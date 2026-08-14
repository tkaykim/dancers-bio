-- ndolt1 2026-07-14 shoot operations board one-time backfill.
-- Source of truth: the 100 accepted applications explicitly locked with confirmed_at.
-- The confirmation cutoff pins this migration to the exact set present before the board was created.
-- Additive and idempotent: existing event participants are preserved.

with target_event as (
  select ps.project_event_id as event_id
  from public.project_schedules ps
  join public.projects p on p.id = ps.project_id
  where p.short_code = 'ndolt1'
    and ps.id = '39574aae-6cf3-41e8-9819-9401b2e3c47a'::uuid
    and ps.project_event_id = 'cb781ccc-9b0c-4fa3-ad10-da2bacacf451'::uuid
),
confirmed as (
  select
    a.id as application_id,
    a.dancer_id,
    a.recruitment_channel_id,
    a.confirmed_by as created_by,
    row_number() over (order by a.confirmed_at, a.created_at, a.id) as rn
  from public.applications a
  join public.projects p on p.id = a.project_id
  where p.short_code = 'ndolt1'
    and a.status = 'accepted'
    and a.archived_at is null
    and a.confirmed_at is not null
    and a.confirmed_at <= '2026-07-13T11:15:19.814+00:00'::timestamptz
)
insert into public.event_participants (
  event_id,
  application_id,
  dancer_id,
  recruitment_channel_id,
  bib_code,
  created_by
)
select
  target_event.event_id,
  confirmed.application_id,
  confirmed.dancer_id,
  confirmed.recruitment_channel_id,
  chr(65 + ((confirmed.rn - 1) / 30)::integer)
    || '-'
    || lpad((((confirmed.rn - 1) % 30) + 1)::text, 2, '0'),
  confirmed.created_by
from target_event
cross join confirmed
on conflict (event_id, dancer_id) do nothing;

-- Expected after execution:
-- participants=100, distinct dancers=100, QR tokens=100, bib codes=100.
select
  count(*) as participants,
  count(distinct dancer_id) as distinct_dancers,
  count(pass_token) as qr_tokens,
  count(bib_code) as bib_codes
from public.event_participants
where event_id = 'cb781ccc-9b0c-4fa3-ad10-da2bacacf451'::uuid;
