-- 운영보드 접근 권한 신청(Drive식): 권한 없는 로그인 사용자가 신청 → 관리권한자 승인(만료일)/거절.
-- 적용: 2026-06-25 (enum은 execute_sql, 테이블은 apply_migration 로 선반영 후 파일 기록).

-- 알림 타입 2종 (트랜잭션 밖에서 선반영됨).
alter type public.notification_type add value if not exists 'ops_access_requested';
alter type public.notification_type add value if not exists 'ops_access_granted';

create table if not exists public.event_access_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.project_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  message text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);

-- 한 사람당 행사별 '대기중' 신청은 1건만.
create unique index if not exists event_access_requests_pending_key
  on public.event_access_requests (event_id, profile_id) where status = 'pending';
create index if not exists event_access_requests_event_status_idx
  on public.event_access_requests (event_id, status);

alter table public.event_access_requests enable row level security;
drop policy if exists ear_select_own on public.event_access_requests;
create policy ear_select_own on public.event_access_requests
  for select using (profile_id = auth.uid());
