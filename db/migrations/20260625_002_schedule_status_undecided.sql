-- project_schedules.status 에 'undecided'(미정) 추가.
--   undecided = 미정 (날짜는 잡혔으나 클라이언트가 진행 여부 미확정 — time_tbd와 무관)
--   tentative = 예정 / confirmed = 확정 / cancelled = 취소됨

alter table public.project_schedules
  drop constraint if exists project_schedules_status_check;

alter table public.project_schedules
  add constraint project_schedules_status_check
  check (status in ('undecided', 'tentative', 'confirmed', 'cancelled'));
