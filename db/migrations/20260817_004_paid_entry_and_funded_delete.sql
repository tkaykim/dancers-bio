-- Codex 교차검토 라운드3 반영 (2026-08-17)
--
-- ① paid 진입은 requested→paid만 허용. pending→paid 직행과 paid 상태 INSERT가
--    DB에서 열려 있으면, 프로젝트 관리자(authenticated, RLS settlements_manage)가
--    실제 이체 없이 paid로 기록할 수 있고 mirror 트리거가 withdraw를 만들어
--    댄서의 잔액·청구가 소리 없이 소멸한다.
--    구 재고 소진 후에는 requested가 더 안 생기므로(20260817_001 봉인) paid도
--    자연히 더 안 생긴다 — 신 경로의 지급 기록 정본은 withdrawal_requests.paid.
--
-- ② 돈이 실린 행(pending & gross>0)의 hard DELETE 차단(FUNDED_NO_DELETE).
--    확정 금액이 기록 없이 원장에서 사라지는 경로였다. 취소(cancelled)로 기록을
--    남긴 뒤에만 삭제 가능. 빈 껍데기(pending & 금액없음)·cancelled는 삭제 허용
--    (오입력·셀프수집 빈 행·테스트 정리).
--
-- 트리거를 BEFORE INSERT OR UPDATE OR DELETE로 확장 재생성.
-- BEFORE 트리거 순서(알파벳): block_new_requested → enforce_payout_readiness
-- → paid_terminal → touch_updated_at.

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
    if old.status = 'pending' and old.gross_amount is not null and old.gross_amount > 0 then
      raise exception 'FUNDED_NO_DELETE: 금액이 확정된 정산은 바로 삭제할 수 없습니다. 먼저 취소하세요.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      raise exception 'PAID_ENTRY: 정산을 입금완료 상태로 생성할 수 없습니다.';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status = 'paid' and old.status is distinct from 'paid'
     and old.status <> 'requested' then
    raise exception 'PAID_ENTRY: 입금완료는 출금신청(requested) 상태에서만 전이할 수 있습니다.';
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

drop trigger if exists settlements_paid_terminal on public.settlements;
create trigger settlements_paid_terminal
  before insert or update or delete on public.settlements
  for each row execute function public.settlements_paid_terminal();
