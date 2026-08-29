-- 지연 발송 아웃박스(message_jobs).
-- Vercel Cron(1분)이 FOR UPDATE SKIP LOCKED 로 원자 선점해 처리한다.
-- Vercel Cron 은 중복 호출·누락이 정상 스펙(공식 문서) — 멱등키·조건부 완료로 흡수한다.
--
-- job_type: campaign_fanout | unread_mail | staff_sla  (CHECK 없는 text — alimtalk_log 전례)
-- 시각은 available_at 하나만 쓴다(run_at·next_attempt_at 이원화 금지 — 교차검증 반영).

create type public.message_job_status as enum ('pending', 'processing', 'done', 'cancelled', 'failed');

create table public.message_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  idem_key text not null unique,
  available_at timestamptz not null default now(),
  status public.message_job_status not null default 'pending',
  room_id uuid,
  dancer_id uuid,
  campaign_id uuid,
  payload jsonb not null default '{}'::jsonb,
  locked_until timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_message_jobs_due on public.message_jobs (available_at) where status = 'pending';
create index idx_message_jobs_lease on public.message_jobs (locked_until) where status = 'processing';
create index idx_message_jobs_room on public.message_jobs (room_id) where status = 'pending';

alter table public.message_jobs enable row level security; -- 정책 없음 = service-role 전용
