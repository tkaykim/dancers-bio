-- 스태프 정산 풀 Phase 1b — 유니크 (project,dancer) → (project,dancer,role) 교체
-- ⚠ 반드시 role 인지 코드(20260825_001 + PR #175)가 배포·drain된 뒤 적용한다.
--   한 트랜잭션이므로 교체 순간에도 무제약 창은 없다. 구코드는 default role='dancer'라
--   교체 후에도 셀프제출 멱등이 유지된다.
-- 롤백: create unique index settlements_project_dancer_uniq on settlements(project_id,dancer_id);
--       alter table settlements add constraint settlements_project_id_dancer_id_key unique (project_id, dancer_id);
--       drop index settlements_project_dancer_role_uniq;
--       (겸직 행이 생긴 뒤에는 롤백 전 중복 (project,dancer) 정리가 선행돼야 한다)

drop index if exists public.settlements_project_dancer_uniq;
alter table public.settlements
  drop constraint if exists settlements_project_id_dancer_id_key;

create unique index settlements_project_dancer_role_uniq
  on public.settlements(project_id, dancer_id, role);

comment on index public.settlements_project_dancer_role_uniq is
  '한 프로젝트 × 한 수취인 × 한 role = 1행 합산(대표 확정 2026-08-25). 겸직은 role 분리로 표현';
