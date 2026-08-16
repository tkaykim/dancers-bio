-- 오디션 참석 여부 회신(RSVP).
-- 현장 참가가 원칙이고, 한국에 없거나 입국이 어려운 경우에만 온라인 참여를 허용한다.
alter table public.dancer_visa_applications
  add column if not exists audition_rsvp text,
  add column if not exists audition_rsvp_at timestamptz,
  add column if not exists audition_rsvp_note text,
  add column if not exists audition_ends_at timestamptz;

alter table public.dancer_visa_applications
  drop constraint if exists dancer_visa_applications_audition_rsvp_check;

alter table public.dancer_visa_applications
  add constraint dancer_visa_applications_audition_rsvp_check
  check (audition_rsvp is null or audition_rsvp in ('onsite', 'online', 'unavailable'));

create index if not exists dancer_visa_applications_audition_rsvp_idx
  on public.dancer_visa_applications (audition_rsvp, audition_at)
  where audition_rsvp is not null;
