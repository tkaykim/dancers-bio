-- 부분 출금 (2단계) — 잔액에서 원하는 금액만 출금 신청
--
-- 기존 출금은 "정산 1건 = 전액"이라 쪼갤 수 없었다. 잔액 원장이 생겼으므로
-- 출금을 정산에서 떼어내 독립 신청으로 만든다.
--
-- 금액은 원장과 같은 기준(세후 실지급액)이다.
-- 실제 이체는 여전히 사람이 통장에서 하고, 앱은 기록만 한다.

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  dancer_id uuid not null references public.dancers(id) on delete cascade,

  -- 세후 실지급액. 잔액에서 이 금액만큼 빠진다.
  amount bigint not null check (amount > 0),

  status text not null default 'requested'
    check (status in ('requested', 'paid', 'cancelled')),

  -- 신청 시점의 지급정보 스냅샷 — 나중에 계좌를 바꿔도 이체 근거가 남아야 한다.
  bank_name text,
  bank_account_number text,
  bank_account_holder text,

  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  memo text
);

create index if not exists withdrawal_requests_dancer_idx
  on public.withdrawal_requests (dancer_id, requested_at desc);
create index if not exists withdrawal_requests_status_idx
  on public.withdrawal_requests (status, requested_at);

comment on table public.withdrawal_requests is
  '댄서 부분 출금 신청. amount는 세후 실지급액. 가용잔액 = 원장 잔액 - 신청중 합계.';

alter table public.withdrawal_requests enable row level security;

-- 본인·관리자 조회만. 생성·상태변경은 서버 액션(service-role)에서만 한다.
drop policy if exists withdrawal_requests_select_own on public.withdrawal_requests;
create policy withdrawal_requests_select_own on public.withdrawal_requests
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.dancers d
      where d.id = withdrawal_requests.dancer_id
        and d.profile_id = (select auth.uid())
    )
  );

-- ── 가용 잔액 ─────────────────────────────────────────────────────────
-- 이미 신청했지만 아직 이체되지 않은 금액은 다시 신청할 수 없어야 한다.
create or replace function public.dancer_available_balance(p_dancer_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select sum(amount) from public.dancer_ledger_entries
              where dancer_id = p_dancer_id), 0)
    - coalesce((select sum(amount) from public.withdrawal_requests
                where dancer_id = p_dancer_id and status = 'requested'), 0);
$$;

comment on function public.dancer_available_balance(uuid) is
  '지금 출금 신청 가능한 금액 = 원장 잔액 - 신청중(미이체) 합계.';

-- ── 출금 신청 (원자적) ────────────────────────────────────────────────
-- 동시에 두 번 눌러 잔액을 초과 신청하는 것을 DB에서 막는다.
-- 댄서 단위 advisory lock으로 같은 사람의 신청만 직렬화한다.
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

  v_available := public.dancer_available_balance(p_dancer_id);
  if p_amount > v_available then
    raise exception 'INSUFFICIENT_BALANCE:%', v_available;
  end if;

  select bank_name, bank_account_number, bank_account_holder
    into v_bank_name, v_bank_no, v_holder
  from public.dancer_private_info
  where dancer_id = p_dancer_id;

  insert into public.withdrawal_requests
    (dancer_id, amount, bank_name, bank_account_number, bank_account_holder)
  values (p_dancer_id, p_amount, v_bank_name, v_bank_no, v_holder)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_withdrawal(uuid, bigint) from public, anon, authenticated;

comment on function public.request_withdrawal(uuid, bigint) is
  '부분 출금 신청. 가용잔액 검증과 삽입을 한 트랜잭션에서 처리(동시 신청 방지). 서버 액션 전용.';

-- ── 보강 (Codex 교차검토 반영) ────────────────────────────────────────
-- · SECURITY DEFINER 함수의 PUBLIC/anon/authenticated 실행권한 회수
-- · 신청 RPC에서 지급정보 스냅샷 필수값 검증(PAYOUT_INFO_INCOMPLETE)
-- · mark_withdrawal_paid: 상태 전환 + 원장 차감을 한 트랜잭션에서
--   (앱에서 나누면 원장 기록 실패 시 "지급했는데 잔액은 그대로"가 되어 재출금 가능)
-- · cancel_withdrawal_request: 신청·이체완료와 동일 advisory lock 사용
-- 실제 정의는 20260816_003_withdrawal_atomicity.sql 참조.
