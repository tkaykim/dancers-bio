-- Codex 교차검토 라운드1 반영 (2026-08-17)
--
-- ① settlements_mirror_ledger 보강
--    · DELETE 분기에도 advisory lock (삭제도 잔액을 바꾸므로 출금 RPC와 직렬화)
--    · dancer_id 변경 시 이전 댄서 락도 획득 (양쪽 잔액이 바뀜)
--    · 삭제 범위를 entry_type in ('earn','withdraw')로 한정
--      — 향후 adjust/refund가 정산을 참조해도 트리거가 지우지 않는다
--    · withdraw upsert 시 created_by(=paid_by)도 동기화
--
-- ② settlements_paid_terminal 신설 — paid = 종결 상태
--    실제 이체가 끝난 기록이 뒤집히면(paid→pending: withdraw 삭제로 잔액 부활 /
--    paid→cancelled: 원장 삭제 / paid DELETE: 지급 이력 소멸) 같은 돈을 다시
--    출금할 수 있다. settlements는 authenticated에 DELETE 권한과 for all RLS,
--    프로젝트·댄서 cascade 삭제 경로까지 있어 앱 밖에서도 뚫린다 — DB에서 봉인.
--    정말 보정이 필요하면 관리자가 트리거를 disable 하고 수기로(의도적 마찰).
--    부수효과: paid 정산이 있는 댄서·프로젝트의 hard delete도 막힌다(회계 보존 의도).
--
-- 이와 함께 앱의 사후 syncSettlementLedger 호출을 전부 제거했다(src/lib/ledger.ts 삭제).
-- 사후 sync는 상태를 다시 읽어 별도 요청으로 쓰므로, 트리거와 경쟁하면 오래된
-- 스냅샷으로 원장을 되살릴 수 있다. 원장 미러의 유일한 주체 = DB 트리거.

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
    perform pg_advisory_xact_lock(hashtext(old.dancer_id::text));
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = old.id
       and entry_type in ('earn','withdraw');
    return old;
  end if;

  v_row := new;

  perform pg_advisory_xact_lock(hashtext(v_row.dancer_id::text));
  if tg_op = 'UPDATE' and old.dancer_id is distinct from new.dancer_id then
    perform pg_advisory_xact_lock(hashtext(old.dancer_id::text));
  end if;

  v_counts := v_row.gross_amount is not null
              and v_row.gross_amount > 0
              and v_row.status <> 'cancelled';

  if not v_counts then
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = v_row.id
       and entry_type in ('earn','withdraw');
    return null;
  end if;

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
    do update set amount = excluded.amount, dancer_id = excluded.dancer_id,
                  created_by = excluded.created_by;
  else
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = v_row.id and entry_type = 'withdraw';
  end if;

  return null;
end;
$$;

create or replace function public.settlements_paid_terminal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'PAID_TERMINAL: 입금완료된 정산은 삭제할 수 없습니다(지급 이력 보존).';
    end if;
    return old;
  end if;
  if old.status = 'paid' and new.status is distinct from 'paid' then
    raise exception 'PAID_TERMINAL: 입금완료된 정산은 상태를 되돌릴 수 없습니다. 보정은 adjust 원장으로 하세요.';
  end if;
  return new;
end;
$$;

revoke all on function public.settlements_paid_terminal() from public, anon, authenticated;

drop trigger if exists settlements_paid_terminal on public.settlements;
create trigger settlements_paid_terminal
  before update or delete on public.settlements
  for each row execute function public.settlements_paid_terminal();

comment on function public.settlements_paid_terminal() is
  'paid 종결성: 역전·삭제 차단. 지급 이력 보존 + 잔액 부활로 인한 재출금 방지.';
