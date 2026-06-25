-- project_schedules.status 상태값 표준화:
--   tentative  = 예정 (기본; 클라이언트 홀딩 포함)
--   confirmed  = 확정 (진행 확정 / 운영보드 생성 시 자동 설정)
--   cancelled  = 취소됨 (클라이언트 요청 취소 등)
-- 기존 데이터는 tentative/confirmed 두 값만 존재 → 제약 추가해도 안전.

alter table public.project_schedules
  drop constraint if exists project_schedules_status_check;

alter table public.project_schedules
  add constraint project_schedules_status_check
  check (status in ('tentative', 'confirmed', 'cancelled'));
