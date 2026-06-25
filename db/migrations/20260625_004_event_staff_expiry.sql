-- 현장 스태프(event_staff) 권한 만료일자 + 중복방지.
--   expires_at: NULL=무기한 / 값 있으면 그 시각 이후 운영 콘솔 접근 차단.
--   unique(event_id, profile_id): 같은 행사에 같은 계정 중복 등록 방지.
-- 적용: 2026-06-25 (Supabase MCP apply_migration 로 선반영 후 파일 기록).

alter table public.event_staff
  add column if not exists expires_at timestamptz;

comment on column public.event_staff.expires_at is
  '현장 스태프 권한 만료 시각(NULL=무기한). 만료 후 운영 콘솔 접근 차단.';

create unique index if not exists event_staff_event_profile_key
  on public.event_staff (event_id, profile_id);
