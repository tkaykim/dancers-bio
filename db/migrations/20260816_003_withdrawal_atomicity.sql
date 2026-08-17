-- 부분 출금 정합성 보강 (Codex 교차검토 반영)
--
-- ⚠ 이 파일은 처음엔 "정의는 운영 DB에 적용됨" 주석 스텁이었다 — migration replay 시
--   함수가 생기지 않아 신규 환경 재현이 깨진다(Codex 라운드1 지적). 운영 DB의 실제
--   정의를 그대로 정본화한다.
--
-- · SECURITY DEFINER 함수의 PUBLIC/anon/authenticated 실행권한 회수
-- · request_withdrawal: 지급정보 스냅샷 필수값 검증(PAYOUT_INFO_INCOMPLETE)
-- · mark_withdrawal_paid: 상태 전환 + 원장 차감을 한 트랜잭션에서
--   (앱에서 나누면 원장 기록 실패 시 "지급했는데 잔액은 그대로"가 되어 재출금 가능)
-- · cancel_withdrawal_request: 신청·이체완료와 동일 advisory lock 사용

revoke all on function public.dancer_available_balance(uuid) from public, anon, authenticated;
revoke all on function public.dancer_balance(uuid) from public, anon, authenticated;

-- ── 출금 신청 (지급정보 검증 포함 최종판 — 20260816_002의 초판을 대체) ─────
create or replace function public.request_withdrawal(
  p_dancer_id uuid,
  p_amount bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available bigint;
  v_id uuid;
  v_bank_name text;
  v_bank_no text;
  v_holder text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_dancer_id::text));

  select bank_name, bank_account_number, bank_account_holder
    into v_bank_name, v_bank_no, v_holder
  from public.dancer_private_info
  where dancer_id = p_dancer_id;

  -- 이체 불가능한 신청이 큐에 쌓이지 않게 DB에서도 막는다.
  if coalesce(btrim(v_bank_name), '') = ''
     or coalesce(btrim(v_bank_no), '') = ''
     or coalesce(btrim(v_holder), '') = '' then
    raise exception 'PAYOUT_INFO_INCOMPLETE';
  end if;

  v_available := public.dancer_available_balance(p_dancer_id);
  if p_amount > v_available then
    raise exception 'INSUFFICIENT_BALANCE:%', v_available;
  end if;

  insert into public.withdrawal_requests
    (dancer_id, amount, bank_name, bank_account_number, bank_account_holder)
  values (p_dancer_id, p_amount, v_bank_name, v_bank_no, v_holder)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(uuid, bigint) from public, anon, authenticated;

-- ── 이체 완료 (원자적: 상태 전환 + 원장 withdraw 한 트랜잭션) ──────────────
create or replace function public.mark_withdrawal_paid(
  p_request_id uuid,
  p_admin_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dancer uuid;
  v_amount bigint;
begin
  select dancer_id, amount into v_dancer, v_amount
  from public.withdrawal_requests
  where id = p_request_id;
  if v_dancer is null then
    raise exception 'NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_dancer::text));

  update public.withdrawal_requests
     set status = 'paid', paid_at = now(), paid_by = p_admin_id
   where id = p_request_id and status = 'requested';
  if not found then
    raise exception 'NOT_REQUESTED';
  end if;

  insert into public.dancer_ledger_entries
    (dancer_id, entry_type, amount, ref_type, ref_id, memo, created_by)
  values (v_dancer, 'withdraw', -v_amount, 'withdrawal_request', p_request_id,
          '출금(이체 완료)', p_admin_id);

  return v_amount;
end;
$$;

revoke all on function public.mark_withdrawal_paid(uuid, uuid) from public, anon, authenticated;

-- ── 본인 취소 (신청·이체완료와 같은 advisory lock) ─────────────────────────
create or replace function public.cancel_withdrawal_request(
  p_request_id uuid,
  p_dancer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select dancer_id into v_owner from public.withdrawal_requests where id = p_request_id;
  if v_owner is null or v_owner <> p_dancer_id then
    raise exception 'NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_owner::text));

  update public.withdrawal_requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_request_id and status = 'requested';
  if not found then
    raise exception 'NOT_REQUESTED';
  end if;
  return true;
end;
$$;

revoke all on function public.cancel_withdrawal_request(uuid, uuid) from public, anon, authenticated;
