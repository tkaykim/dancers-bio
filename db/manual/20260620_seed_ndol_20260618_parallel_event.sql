-- Parallel seed for normalized event operations.
-- This keeps the legacy NDOL 2026-06-18 board intact and copies its rows into
-- project_events/event_participants for productized ops-board testing.

with parent_project as (
  select id
  from public.projects
  where short_code = 'ndol26'
  limit 1
),
existing_event as (
  select id, ops_code, public_pass_code
  from public.project_events
  where metadata->>'legacy_event_key' = 'ndol-20260618'
    and metadata->>'migration_kind' = 'parallel_test'
  order by created_at
  limit 1
),
inserted_event as (
  insert into public.project_events (
    project_id,
    name,
    event_type,
    starts_at,
    ends_at,
    status,
    metadata
  )
  select
    parent_project.id,
    'NDOL 2026-06-18 1차 오디션 (정규 구조 테스트)',
    'audition',
    '2026-06-18 16:00:00+09'::timestamptz,
    '2026-06-18 21:00:00+09'::timestamptz,
    'completed',
    jsonb_build_object(
      'legacy_event_key', 'ndol-20260618',
      'migration_kind', 'parallel_test',
      'source_table', 'ops_ndol_contacts',
      'legacy_board_preserved', true,
      'seeded_at', now()
    )
  from parent_project
  where not exists (select 1 from existing_event)
  returning id, ops_code, public_pass_code
),
target_event as (
  select id, ops_code, public_pass_code from existing_event
  union all
  select id, ops_code, public_pass_code from inserted_event
),
source_rows as (
  select distinct on (c.dancer_id)
    c.id as legacy_ops_contact_id,
    c.dancer_id,
    c.project_id,
    c.bib_code,
    c.attendance_status,
    c.onsite_status,
    c.checked_in_at,
    c.eliminated_at,
    coalesce(nullif(concat_ws(E'\n', nullif(c.note, ''), nullif(c.onsite_note, '')), ''), '') as note,
    a.id as application_id,
    coalesce(a.recruitment_channel_id, rc.id) as recruitment_channel_id
  from public.ops_ndol_contacts c
  left join lateral (
    select a.id, a.recruitment_channel_id
    from public.applications a
    where a.dancer_id = c.dancer_id
      and a.archived_at is null
      and (
        a.project_id = c.project_id
        or a.project_id in (
          select legacy_project_id
          from public.recruitment_channels
          where project_id = (select id from parent_project)
            and legacy_project_id is not null
        )
      )
    order by
      case when a.project_id = c.project_id then 0 else 1 end,
      case when a.status = 'accepted' then 0 else 1 end,
      a.created_at desc
    limit 1
  ) a on true
  left join public.recruitment_channels rc
    on rc.legacy_project_id = c.project_id
  where c.event_key = 'ndol-20260618'
    and c.dancer_id is not null
  order by
    c.dancer_id,
    case when c.attendance_status = 'checked_in' then 0 else 1 end,
    case when c.bib_code is not null then 0 else 1 end,
    c.sort_rank,
    c.updated_at desc
),
inserted_participants as (
  insert into public.event_participants (
    event_id,
    application_id,
    dancer_id,
    recruitment_channel_id,
    legacy_ops_contact_id,
    bib_code,
    attendance_status,
    onsite_status,
    checked_in_at,
    eliminated_at,
    note
  )
  select
    target_event.id,
    source_rows.application_id,
    source_rows.dancer_id,
    source_rows.recruitment_channel_id,
    source_rows.legacy_ops_contact_id,
    source_rows.bib_code,
    source_rows.attendance_status,
    source_rows.onsite_status,
    source_rows.checked_in_at,
    source_rows.eliminated_at,
    source_rows.note
  from target_event
  cross join source_rows
  on conflict (event_id, dancer_id) do nothing
  returning id
)
select
  target_event.id as event_id,
  target_event.ops_code,
  target_event.public_pass_code,
  (select count(*) from source_rows) as unique_source_participants,
  (select count(*) from inserted_participants) as inserted_participants,
  (select count(*) from public.event_participants ep where ep.event_id = target_event.id) as total_event_participants
from target_event;
