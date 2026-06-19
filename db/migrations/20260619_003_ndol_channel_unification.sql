-- NDOL 2026-06-18 channel unification.
-- Additive/in-place only: legacy projects and applications stay in place.
-- Dates are business-interpreted as KST.

create schema if not exists archive;

create table if not exists archive.ndol_channel_unification_projects_pre_20260619 as
select p.*
from public.projects p
where p.short_code = any (
  array[
    'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
    'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
    'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
  ]
);

create table if not exists archive.ndol_channel_unification_applications_pre_20260619 as
select a.*
from public.applications a
join public.projects p on p.id = a.project_id
where p.short_code = any (
  array[
    'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
    'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
    'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
  ]
);

create table if not exists archive.ndol_channel_unification_channels_pre_20260619 as
select rc.*
from public.recruitment_channels rc
where rc.project_id in (
  select id
  from public.projects
  where short_code = any (
    array[
      'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
      'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
      'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
    ]
  )
)
or rc.legacy_project_id in (
  select id
  from public.projects
  where short_code = any (
    array[
      'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
      'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
      'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
    ]
  )
);

create table if not exists archive.ndol_channel_unification_expected_counts_20260619 as
select
  p.id as project_id,
  p.short_code,
  p.title,
  p.status,
  p.application_deadline,
  p.is_standing_pool,
  count(a.id)::integer as applications_total,
  count(a.id) filter (where a.status = 'accepted')::integer as accepted_total,
  count(a.id) filter (where a.status = 'pending')::integer as pending_total,
  count(a.id) filter (where a.status = 'rejected')::integer as rejected_total,
  count(a.id) filter (where a.status = 'withdrawn')::integer as withdrawn_total,
  count(a.id) filter (where a.recruitment_channel_id is not null)::integer as with_channel_total,
  now() as snapped_at
from public.projects p
left join public.applications a on a.project_id = p.id and a.archived_at is null
where p.short_code = any (
  array[
    'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
    'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
    'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
  ]
)
group by p.id, p.short_code, p.title, p.status, p.application_deadline, p.is_standing_pool;

revoke all on table archive.ndol_channel_unification_projects_pre_20260619 from anon, authenticated;
revoke all on table archive.ndol_channel_unification_applications_pre_20260619 from anon, authenticated;
revoke all on table archive.ndol_channel_unification_channels_pre_20260619 from anon, authenticated;
revoke all on table archive.ndol_channel_unification_expected_counts_20260619 from anon, authenticated;

alter table archive.ndol_channel_unification_projects_pre_20260619 enable row level security;
alter table archive.ndol_channel_unification_applications_pre_20260619 enable row level security;
alter table archive.ndol_channel_unification_channels_pre_20260619 enable row level security;
alter table archive.ndol_channel_unification_expected_counts_20260619 enable row level security;

with parent_project as (
  select id, owner_id
  from public.projects
  where short_code = 'ndol26'
),
channel_source(short_code, name, channel_type, manager_label, sort_order, notes) as (
  values
    ('ndol26', '기본 모집', 'general', 'deetz', 10, 'NDOL parent/default channel.'),
    ('ndol02', '기본 B', 'external', 'baw', 20, 'Legacy ndol02 project converted into a recruitment channel.'),
    ('ndolsm', '상명대', 'school', '상명대', 30, 'Legacy ndolsm project converted into a recruitment channel.'),
    ('ndolbd', 'BADD', 'partner', 'BADD', 40, 'Legacy ndolbd project converted into a recruitment channel.'),
    ('ndol37', '서울문화예술대', 'school', '서울문화예술대', 50, 'Legacy ndol37 project converted into a recruitment channel.'),
    ('ndoldc', '댄스동아리', 'partner', '댄스동아리', 60, 'Legacy ndoldc project converted into a recruitment channel.'),
    ('ndolha', '한야', 'school', '한야', 70, 'Legacy ndolha project converted into a recruitment channel.'),
    ('ndolhl', '한림예고', 'school', '한림예고', 80, 'Legacy ndolhl project converted into a recruitment channel.'),
    ('ndolhy', '한양대', 'school', '한양대', 90, 'Legacy ndolhy project converted into a recruitment channel.'),
    ('ndoljh', '정화예대', 'school', '정화예대', 100, 'Legacy ndoljh project converted into a recruitment channel.'),
    ('ndolka', '한예종', 'school', '한예종', 110, 'Legacy ndolka project converted into a recruitment channel.'),
    ('ndolkm', '국민대', 'school', '국민대', 120, 'Legacy ndolkm project converted into a recruitment channel.'),
    ('ndolsj', '세종대', 'school', '세종대', 130, 'Legacy ndolsj project converted into a recruitment channel.'),
    ('ndolsp', '서울공연예술학교', 'school', '서울공연예술학교', 140, 'Legacy ndolsp project converted into a recruitment channel.'),
    ('ay25bg', '지인 추가 섭외', 'direct', '지인', 150, 'Legacy ay25bg project converted into a recruitment channel.'),
    ('zudrz5', '지인 예비 링크', 'direct', '지인', 160, 'Legacy zudrz5 project converted into a recruitment channel.')
),
resolved as (
  select
    parent_project.id as parent_project_id,
    parent_project.owner_id as parent_owner_id,
    legacy.id as legacy_project_id,
    channel_source.name,
    channel_source.channel_type,
    channel_source.manager_label,
    channel_source.sort_order,
    channel_source.notes
  from channel_source
  join public.projects legacy on legacy.short_code = channel_source.short_code
  cross join parent_project
)
insert into public.recruitment_channels(
  project_id,
  legacy_project_id,
  name,
  channel_type,
  status,
  manager_label,
  sort_order,
  notes,
  created_by
)
select
  parent_project_id,
  legacy_project_id,
  name,
  channel_type,
  'active',
  manager_label,
  sort_order,
  notes || ' Unified under ndol26 on 2026-06-19 KST.',
  parent_owner_id
from resolved
on conflict (legacy_project_id) do update
set
  project_id = excluded.project_id,
  name = excluded.name,
  channel_type = excluded.channel_type,
  status = 'active',
  manager_label = excluded.manager_label,
  sort_order = excluded.sort_order,
  notes = excluded.notes,
  updated_at = now();

update public.applications a
set recruitment_channel_id = rc.id,
    updated_at = now()
from public.projects p
join public.recruitment_channels rc on rc.legacy_project_id = p.id
where a.project_id = p.id
  and p.short_code = any (
    array[
      'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
      'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
      'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
    ]
  )
  and a.recruitment_channel_id is distinct from rc.id;

update public.projects p
set application_deadline = '2026-06-18 23:59:00+09'::timestamptz,
    is_standing_pool = false,
    updated_at = now()
where p.short_code = any (
  array[
    'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
    'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
    'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
  ]
);

insert into public.recruitment_channel_members(channel_id, profile_id, role, added_by)
select rc.id, legacy.owner_id, 'manager', parent.owner_id
from public.recruitment_channels rc
join public.projects legacy on legacy.id = rc.legacy_project_id
join public.projects parent on parent.id = rc.project_id
where legacy.owner_id is not null
  and legacy.short_code = any (
    array[
      'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
      'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
      'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
    ]
  )
on conflict (channel_id, profile_id) do nothing;

insert into public.recruitment_channel_members(channel_id, profile_id, role, added_by)
select rc.id, pm.profile_id, 'manager', parent.owner_id
from public.project_managers pm
join public.projects legacy on legacy.id = pm.project_id
join public.recruitment_channels rc on rc.legacy_project_id = legacy.id
join public.projects parent on parent.id = rc.project_id
where legacy.short_code = any (
  array[
    'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
    'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
    'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
  ]
)
on conflict (channel_id, profile_id) do nothing;

drop policy if exists applications_channel_update on public.applications;
create policy applications_channel_update on public.applications
  for update to authenticated
  using (
    recruitment_channel_id is not null
    and public.can_manage_recruitment_channel(recruitment_channel_id)
  )
  with check (
    recruitment_channel_id is not null
    and public.can_manage_recruitment_channel(recruitment_channel_id)
  );

create table if not exists archive.ndol_channel_unification_post_counts_20260619 as
select
  p.id as project_id,
  p.short_code,
  p.title,
  p.status,
  p.application_deadline,
  p.is_standing_pool,
  rc.id as channel_id,
  rc.name as channel_name,
  rc.share_code,
  count(a.id)::integer as applications_total,
  count(a.id) filter (where a.status = 'accepted')::integer as accepted_total,
  count(a.id) filter (where a.status = 'pending')::integer as pending_total,
  count(a.id) filter (where a.status = 'rejected')::integer as rejected_total,
  count(a.id) filter (where a.status = 'withdrawn')::integer as withdrawn_total,
  count(a.id) filter (where a.recruitment_channel_id = rc.id)::integer as with_expected_channel_total,
  now() as snapped_at
from public.projects p
join public.recruitment_channels rc on rc.legacy_project_id = p.id
left join public.applications a on a.project_id = p.id and a.archived_at is null
where p.short_code = any (
  array[
    'ndol26', 'ndol02', 'ndolsm', 'ndolbd', 'ndol37',
    'ndoldc', 'ndolha', 'ndolhl', 'ndolhy', 'ndoljh',
    'ndolka', 'ndolkm', 'ndolsj', 'ndolsp', 'ay25bg', 'zudrz5'
  ]
)
group by p.id, p.short_code, p.title, p.status, p.application_deadline, p.is_standing_pool,
  rc.id, rc.name, rc.share_code;

revoke all on table archive.ndol_channel_unification_post_counts_20260619 from anon, authenticated;
alter table archive.ndol_channel_unification_post_counts_20260619 enable row level security;

comment on table archive.ndol_channel_unification_expected_counts_20260619 is
  'Pre-migration NDOL project/application counts for 2026-06-19 channel unification verification.';
comment on table archive.ndol_channel_unification_post_counts_20260619 is
  'Post-migration NDOL project/application/channel counts for 2026-06-19 channel unification verification.';
