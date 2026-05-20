-- Lite MVP: admin-authored projects need a free-text "등록자" label
-- (admin이 직접 입력한 텍스트가 노출용 등록자명).
-- additive only — 기존 데이터는 NULL이며 detail 페이지는 owner display_name으로 fallback.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS posted_by_label varchar(80);

COMMENT ON COLUMN projects.posted_by_label IS
  'Lite: admin이 직접 입력한 등록자 표시 텍스트. NULL이면 owner display_name으로 fallback.';
