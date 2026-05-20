-- Lite:
-- 1) 자동 마감 트리거 제거. admin이 수락 시 클라이언트가 "마감할까요?" 확인 후 명시적 close.
--    (수락 도달 후에도 추가 모집을 허용하기 위함)
-- 2) careers.is_public 기본값 true — 사용자가 추가 시 즉시 공개.

DROP TRIGGER IF EXISTS applications_auto_close_project_trg ON applications;
DROP FUNCTION IF EXISTS applications_auto_close_project();

ALTER TABLE careers ALTER COLUMN is_public SET DEFAULT true;
