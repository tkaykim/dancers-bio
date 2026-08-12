alter table public.visa_meeting_invites
  add column if not exists request_id uuid,
  add column if not exists duration_minutes integer not null default 30,
  add column if not exists source_slot_local text,
  add column if not exists source_timezone text,
  add column if not exists google_calendar_id text,
  add column if not exists google_event_id text,
  add column if not exists google_event_url text,
  add column if not exists calendar_status text not null default 'not_created',
  add column if not exists calendar_error text,
  add column if not exists calendar_created_at timestamptz,
  add column if not exists mail_sent_at timestamptz;

alter table public.visa_meeting_invites
  drop constraint if exists visa_meeting_invites_duration_minutes_check,
  add constraint visa_meeting_invites_duration_minutes_check
    check (duration_minutes in (30, 45, 60)),
  drop constraint if exists visa_meeting_invites_calendar_status_check,
  add constraint visa_meeting_invites_calendar_status_check
    check (calendar_status in ('not_created', 'pending', 'created', 'failed', 'cancelled'));

create unique index if not exists visa_meeting_invites_request_id_uidx
  on public.visa_meeting_invites (request_id)
  where request_id is not null;

create unique index if not exists visa_meeting_invites_google_event_id_uidx
  on public.visa_meeting_invites (google_event_id)
  where google_event_id is not null;

create index if not exists visa_meeting_invites_sent_by_idx
  on public.visa_meeting_invites (sent_by)
  where sent_by is not null;

revoke all on table public.visa_meeting_invites from anon, authenticated;

comment on column public.visa_meeting_invites.request_id is
  'Client-generated idempotency key for Calendar creation and confirmation mail retries.';
comment on column public.visa_meeting_invites.calendar_status is
  'Google Calendar/Meet lifecycle, tracked separately from branded confirmation mail status.';
