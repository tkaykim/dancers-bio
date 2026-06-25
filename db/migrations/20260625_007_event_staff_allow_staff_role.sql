-- event_staff.role CHECK 에 'staff' 추가.
--   현장 스태프 등록(addEventStaffAction)·접근승인(decideEventAccessRequestAction)이
--   role='staff'로 insert하는데, 기존 제약은 admin/checkin/floor_manager/client_viewer 만 허용해
--   등록·승인이 전부 실패하던 버그 수정 (E2E 중 발견).
-- 적용: 2026-06-25 (apply_migration 로 선반영 후 파일 기록).

alter table public.event_staff drop constraint if exists event_staff_role_check;
alter table public.event_staff add constraint event_staff_role_check
  check (role = any (array['admin','checkin','floor_manager','client_viewer','staff']));
