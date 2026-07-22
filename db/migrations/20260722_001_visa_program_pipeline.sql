-- deetz 비자 프로그램 운영 파이프라인.
-- 기존 신청 데이터는 그대로 보존하고, 오디션 → 조건부 트레이닝 → 월말평가 → 비자 준비를 관리한다.

alter table public.dancer_visa_applications
  add column if not exists case_stage text not null default 'application_received',
  add column if not exists audition_at timestamptz,
  add column if not exists audition_location text,
  add column if not exists audition_status text not null default 'not_scheduled',
  add column if not exists audition_result text not null default 'pending',
  add column if not exists audition_feedback text,
  add column if not exists level_test_video_url text,
  add column if not exists training_required boolean,
  add column if not exists training_partner text,
  add column if not exists training_start_date date,
  add column if not exists training_end_date date,
  add column if not exists training_status text not null default 'not_required',
  add column if not exists monthly_evaluation_at timestamptz,
  add column if not exists monthly_evaluation_result text not null default 'pending',
  add column if not exists base_price_krw integer not null default 4000000,
  add column if not exists quoted_price_krw integer,
  add column if not exists quote_note text,
  add column if not exists follow_up_answers jsonb not null default '{}'::jsonb,
  add column if not exists follow_up_submitted_at timestamptz,
  add column if not exists project_opportunity_opt_in boolean,
  add column if not exists next_action text;

create index if not exists idx_visa_apps_case_stage
  on public.dancer_visa_applications(case_stage);

comment on column public.dancer_visa_applications.case_stage is
  'application_received|triage_submitted|audition_scheduled|audition_complete|training|monthly_evaluation|visa_documents|visa_submitted|complete|on_hold';
comment on column public.dancer_visa_applications.audition_result is
  'pending|pass|training_required|no_show';
comment on column public.dancer_visa_applications.monthly_evaluation_result is
  'pending|pass|continue|hold';
comment on column public.dancer_visa_applications.base_price_krw is
  '기본 안내 단가. 최종 견적은 상담과 트랙에 따라 증감 가능.';
comment on column public.dancer_visa_applications.project_opportunity_opt_in is
  'deetz 프로젝트 지원 기회 안내 수신 희망. 일거리 제공 보장이 아님.';
