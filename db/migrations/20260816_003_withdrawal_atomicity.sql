-- 부분 출금 정합성 보강 (Codex 교차검토 반영)
-- 상세 주석은 각 함수 본문 참조. 운영 DB에는 apply_migration 으로 적용 완료.
revoke all on function public.dancer_available_balance(uuid) from public, anon, authenticated;
revoke all on function public.dancer_balance(uuid) from public, anon, authenticated;
-- request_withdrawal: 지급정보 스냅샷 필수값 검증 추가 (PAYOUT_INFO_INCOMPLETE)
-- mark_withdrawal_paid(request_id, admin_id): 상태 전환 + 원장 withdraw 를 한 트랜잭션에서
-- cancel_withdrawal_request(request_id, dancer_id): 동일 advisory lock 안에서 취소
-- (세 함수 모두 public/anon/authenticated 실행권한 revoke)
