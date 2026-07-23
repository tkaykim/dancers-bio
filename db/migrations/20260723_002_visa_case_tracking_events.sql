-- deetz 비자 프로그램 follow-up 메일/케이스 페이지 행동 추적.
-- 외부 사용자가 직접 조회하지 못하게 RLS는 켜고 public policy는 만들지 않는다.

create table if not exists public.visa_case_tracking_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  application_id uuid not null references public.dancer_visa_applications(id) on delete cascade,
  campaign text not null default 'visa_case_followup_20260723',
  event_type text not null,
  event_key text,
  lang text,
  step integer,
  scroll_depth integer,
  page_path text,
  user_agent text,
  ip text,
  referer text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_visa_case_tracking_app_created
  on public.visa_case_tracking_events(application_id, created_at desc);

create index if not exists idx_visa_case_tracking_campaign_type
  on public.visa_case_tracking_events(campaign, event_type, created_at desc);

create index if not exists idx_visa_case_tracking_created
  on public.visa_case_tracking_events(created_at desc);

alter table public.visa_case_tracking_events enable row level security;

comment on table public.visa_case_tracking_events is
  'deetz 비자 프로그램 메일/개인 케이스 페이지 행동 이벤트. service-role API만 append/read.';

comment on column public.visa_case_tracking_events.event_type is
  'email_sent|email_open|cta_click|case_visit|language_view|step_view|scroll_depth|case_exit|follow_up_submit_success';
