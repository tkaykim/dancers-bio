-- 출금 경로 일원화 마무리 — 원장 원자성 + 구 경로 봉인 (2026-08-17)
--
-- 배경(RUBA 사례): 구 정산출금(8/11 신청)이 이체 대기 중인데, 잔액출금 UI가
-- 열린 뒤 예약 로직이 배포되기 전 2시간 창(8/17 07:33)에 같은 212,740원을
-- 잔액에서 또 신청했다. 예약 로직(20260816_004)이 창을 닫았지만,
-- 남은 위험 두 가지를 여기서 DB 차원에서 제거한다.
--
-- ① 원장 미러 비원자성: 앱은 settlements 상태 변경과 원장 동기화
--    (syncSettlementLedger)를 별도 요청으로 하고, 후자는 비치명적(실패 무시)이다.
--    paid 전환 후 원장 withdraw 기록이 유실되면 "지급됐는데 잔액은 그대로"가
--    영구히 남아 그 돈을 잔액출금으로 또 신청할 수 있다. 취소 후 earn 삭제
--    유실도 같은 클래스(취소된 돈이 잔액에 남음).
--    → 트리거가 같은 트랜잭션 안에서 원장을 미러링한다. 부분 실패가 불가능해진다.
--
-- ② 구 경로 재개방 가능성: 앱은 requestWithdrawalAction 입구를 막았지만
--    DB는 여전히 pending→requested 전이를 허용한다. 향후 코드 실수·수기 SQL로
--    구 큐가 다시 자라면 두 경로 병존이 영구화된다.
--    → 신규 requested 전이를 트리거로 차단. 기존 requested 재고(2026-08-17 기준
--      36건)는 requested→paid/cancelled 소진만 가능. 재고가 비면 구 큐는 자연 소멸.

-- ── ① settlements → dancer_ledger_entries 원자 미러 ─────────────────────
-- src/lib/ledger.ts의 syncSettlementLedger와 동일 의미론:
--   · 금액확정(gross>0, status≠cancelled) → earn 1줄(세후액) 보장, 금액 변경 시 갱신
--   · paid → withdraw 1줄(−세후액) 보장 / paid 해제 → withdraw 삭제
--   · 취소·금액소멸·행삭제 → 그 정산에서 나온 줄 전부 삭제
-- 앱의 사후 sync 호출은 멱등이라 그대로 둬도 무해하다(같은 상태로 수렴).
--
-- SECURITY DEFINER 필수: 일괄 금액 저장은 관리권한자의 user 클라이언트로
-- settlements를 UPDATE하는데(RLS settlements_manage), 그 사용자는 원장 테이블에
-- 쓰기 권한이 없다. INVOKER면 트리거의 원장 쓰기가 실패해 금액 저장 자체가 죽는다.
create or replace function public.settlements_mirror_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row settlements;
  v_net bigint;
  v_counts boolean;
begin
  if tg_op = 'DELETE' then
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = old.id;
    return old;
  end if;

  v_row := new;

  -- request_withdrawal RPC와 같은 잠금 — 잔액 계산과 원장 변경을 직렬화한다.
  perform pg_advisory_xact_lock(hashtext(v_row.dancer_id::text));

  v_counts := v_row.gross_amount is not null
              and v_row.gross_amount > 0
              and v_row.status <> 'cancelled';

  if not v_counts then
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = v_row.id;
    return null;
  end if;

  -- 세후 실수령액 = gross − floor(gross × rate). calcSettlement와 동일(원단위 절사).
  v_net := v_row.gross_amount - floor(v_row.gross_amount * v_row.withholding_rate)::bigint;

  insert into public.dancer_ledger_entries
    (dancer_id, entry_type, amount, ref_type, ref_id, memo)
  values (v_row.dancer_id, 'earn', v_net, 'settlement', v_row.id, '정산 금액 확정')
  on conflict (ref_type, ref_id, entry_type)
    where ref_type is not null and ref_id is not null
  do update set amount = excluded.amount, dancer_id = excluded.dancer_id;

  if v_row.status = 'paid' then
    insert into public.dancer_ledger_entries
      (dancer_id, entry_type, amount, ref_type, ref_id, memo, created_by)
    values (v_row.dancer_id, 'withdraw', -v_net, 'settlement', v_row.id,
            '출금(이체 완료)', v_row.paid_by)
    on conflict (ref_type, ref_id, entry_type)
      where ref_type is not null and ref_id is not null
    do update set amount = excluded.amount, dancer_id = excluded.dancer_id;
  else
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = v_row.id and entry_type = 'withdraw';
  end if;

  return null;
end;
$$;

revoke all on function public.settlements_mirror_ledger() from public, anon, authenticated;

drop trigger if exists settlements_mirror_ledger on public.settlements;
create trigger settlements_mirror_ledger
  after insert or update of status, gross_amount, withholding_rate, dancer_id
  or delete on public.settlements
  for each row execute function public.settlements_mirror_ledger();

comment on function public.settlements_mirror_ledger() is
  '정산 상태를 잔액 원장에 같은 트랜잭션으로 미러링. 앱의 syncSettlementLedger가 유실돼도 원장이 어긋나지 않는다.';

-- ── ② 정산 건별 출금 신규 진입 봉인 ─────────────────────────────────────
-- 기존 requested 행의 다른 컬럼 갱신(requested→requested)과
-- requested→paid/cancelled 소진은 허용. 새로 requested가 되는 것만 막는다.
-- (정말 되살려야 하면 관리자가 이 트리거를 disable 하고 수기로 — 의도적 마찰.)
create or replace function public.settlements_block_new_requested()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'requested'
     and (tg_op = 'INSERT' or old.status is distinct from 'requested') then
    raise exception 'LEGACY_WITHDRAWAL_CLOSED: 정산 건별 출금은 종료되었습니다. 잔액 출금(withdrawal_requests)을 사용하세요.';
  end if;
  return new;
end;
$$;

revoke all on function public.settlements_block_new_requested() from public, anon, authenticated;

drop trigger if exists settlements_block_new_requested on public.settlements;
create trigger settlements_block_new_requested
  before insert or update on public.settlements
  for each row execute function public.settlements_block_new_requested();

comment on function public.settlements_block_new_requested() is
  '출금 일원화: 신규 pending→requested 전이 차단. 기존 requested 재고는 paid/cancelled로 소진만 가능.';
