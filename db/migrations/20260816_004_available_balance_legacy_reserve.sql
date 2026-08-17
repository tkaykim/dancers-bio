-- ⚠ 이행기 안전장치 — 구 정산출금 대기분도 가용잔액에서 예약
--
-- 잔액 출금으로 일원화했지만, 그 전에 이미 '출금신청'된 정산 건들이 관리자 큐에서
-- 이체를 기다리고 있다(적용 시점 39건). 그 금액은 원장에 earn으로 들어가 있는데
-- withdrawal_requests에는 없으므로, 그대로 두면 같은 돈을 잔액에서 또 신청할 수 있다.
-- (구 경로 이체 + 신 경로 이체 = 이중 지급)
--
-- 담당자가 그 건을 paid 처리하면 syncSettlementLedger가 withdraw를 기록하고
-- settlements 쪽 예약도 사라지므로 이중 차감되지 않는다.
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
                where dancer_id = p_dancer_id and status = 'requested'), 0)
    - coalesce((select sum(s.gross_amount - floor(s.gross_amount * s.withholding_rate))
                from public.settlements s
                where s.dancer_id = p_dancer_id
                  and s.status = 'requested'
                  and s.gross_amount is not null), 0);
$$;

revoke all on function public.dancer_available_balance(uuid) from public, anon, authenticated;

comment on function public.dancer_available_balance(uuid) is
  '출금 신청 가능액 = 원장 잔액 - 신청중(잔액출금) - 이체 대기중인 구 정산출금분. 이행기 이중지급 방지.';
