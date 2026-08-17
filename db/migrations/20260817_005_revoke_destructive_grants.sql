-- Codex 교차검토 라운드4 반영 (2026-08-17)
--
-- 발견된 우회로: pending 금액을 0/null로 지우면(의도된 금액 수정 기능 —
-- mirror가 earn을 삭제해 잔액은 정합) FUNDED_NO_DELETE의 gross>0 조건이 꺼져
-- 행 삭제가 가능했다.
--
-- 근본 원인 제거: 앱 소스에 settlements DELETE 경로가 전무한데(전수 grep)
-- 테이블 권한은 authenticated DELETE를 허용하고 있었다 — 순수 공격면.
-- RLS 이전에 테이블 권한 단계에서 차단해 프로젝트 관리자의 PostgREST 직접
-- 삭제를 원천 봉쇄한다. service role(관리 스크립트·테스트 정리)은 영향 없고,
-- 그 경로도 여전히 paid/requested/funded-pending 삭제는 트리거 가드에 걸린다.
-- 같은 원칙으로 원장·출금신청 테이블의 DELETE/TRUNCATE도 회수(위생).
revoke delete, truncate on table public.settlements from authenticated, anon;
revoke delete, truncate on table public.dancer_ledger_entries from authenticated, anon;
revoke delete, truncate on table public.withdrawal_requests from authenticated, anon;
