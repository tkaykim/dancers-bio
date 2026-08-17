-- Codex 교차검토 라운드2 반영 (2026-08-17)
--
-- ① paid = 회계 필드까지 불변. 라운드1은 상태 역전·삭제만 봉인했는데,
--    paid 행의 gross_amount·withholding_rate를 바꾸면 mirror 트리거가 원장을
--    "실제 이체된 금액과 다른 값"으로 다시 쓴다. dancer_id(귀속)·paid_by·paid_at
--    (지급 기록)도 감사 정합성을 위해 함께 봉인한다. memo 등 비회계 필드는 수정 가능.
--    보정이 필요하면 adjust 원장 줄을 추가한다(3단계 append-only 전환과 일관).
--
-- ② requested 행 hard DELETE 차단. requested = 댄서가 출금을 기다리는 활성 청구인데,
--    settlements는 authenticated에 DELETE 권한 + for all RLS라 앱 밖에서 지울 수 있었다.
--    삭제되면 지급 대기 큐에서 소리 없이 사라진다 — 취소(cancelled) 경로를 쓰게 강제.
--    pending/cancelled 삭제는 열어 둔다(오입력·테스트 정리 경로, mirror가 원장 정리).
--
-- ③ 댄서 이관 락 정렬. 기존엔 항상 new→old 순서라 A→B와 B→A 동시 이관이 데드락.
--    least/greatest로 전역 정렬 획득. 단일 락 획득자(request_withdrawal 등)와는
--    순환이 생기지 않는다.
--
-- (수용 안 한 지적) request_withdrawal의 계좌 형식·주민번호 DB 검증:
--    EXECUTE가 service role 전용(public/anon/authenticated revoke)이라 앱 검증
--    (isPayoutInfoComplete)을 우회할 호출 경로가 없다. 방어 계층 추가는 3단계에서 재검토.

create or replace function public.settlements_paid_terminal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'PAID_TERMINAL: 입금완료된 정산은 삭제할 수 없습니다(지급 이력 보존).';
    end if;
    if old.status = 'requested' then
      raise exception 'REQUESTED_NO_DELETE: 출금신청된 정산은 삭제할 수 없습니다. 정산 취소를 사용하세요.';
    end if;
    return old;
  end if;

  if old.status = 'paid' then
    if new.status is distinct from 'paid' then
      raise exception 'PAID_TERMINAL: 입금완료된 정산은 상태를 되돌릴 수 없습니다. 보정은 adjust 원장으로 하세요.';
    end if;
    if new.gross_amount is distinct from old.gross_amount
       or new.withholding_rate is distinct from old.withholding_rate
       or new.dancer_id is distinct from old.dancer_id
       or new.paid_by is distinct from old.paid_by
       or new.paid_at is distinct from old.paid_at then
      raise exception 'PAID_TERMINAL: 입금완료된 정산의 금액·귀속·지급 기록은 수정할 수 없습니다. 보정은 adjust 원장으로 하세요.';
    end if;
  end if;
  return new;
end;
$$;

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
  v_h1 int;
  v_h2 int;
begin
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtext(old.dancer_id::text));
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = old.id
       and entry_type in ('earn','withdraw');
    return old;
  end if;

  v_row := new;

  if tg_op = 'UPDATE' and old.dancer_id is distinct from new.dancer_id then
    v_h1 := hashtext(old.dancer_id::text);
    v_h2 := hashtext(new.dancer_id::text);
    perform pg_advisory_xact_lock(least(v_h1, v_h2));
    if v_h1 <> v_h2 then
      perform pg_advisory_xact_lock(greatest(v_h1, v_h2));
    end if;
  else
    perform pg_advisory_xact_lock(hashtext(v_row.dancer_id::text));
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
