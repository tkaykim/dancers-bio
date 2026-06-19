-- Ops normalization foundation.
-- Additive-only: keep existing projects/applications/NDOL ops rows intact.

create schema if not exists archive;

create table if not exists archive.projects_pre_ops_normalization_20260619
as table public.projects;

create table if not exists archive.applications_pre_ops_normalization_20260619
as table public.applications;

create table if not exists archive.project_managers_pre_ops_normalization_20260619
as table public.project_managers;

create table if not exists archive.project_schedules_pre_ops_normalization_20260619
as table public.project_schedules;

create table if not exists archive.project_schedule_responses_pre_ops_normalization_20260619
as table public.project_schedule_responses;

create table if not exists archive.settlements_pre_ops_normalization_20260619
as table public.settlements;

create table if not exists archive.ops_ndol_contacts_pre_ops_normalization_20260619
as table public.ops_ndol_contacts;

create table if not exists archive.ops_normalization_snapshot_20260619 as
select 'projects'::text as table_name, count(*)::bigint as row_count, now() as snapped_at from public.projects
union all select 'applications', count(*)::bigint, now() from public.applications
union all select 'project_managers', count(*)::bigint, now() from public.project_managers
union all select 'project_schedules', count(*)::bigint, now() from public.project_schedules
union all select 'project_schedule_responses', count(*)::bigint, now() from public.project_schedule_responses
union all select 'settlements', count(*)::bigint, now() from public.settlements
union all select 'ops_ndol_contacts', count(*)::bigint, now() from public.ops_ndol_contacts;

revoke all on schema archive from anon, authenticated;
revoke all on all tables in schema archive from anon, authenticated;

create or replace function public.gen_ops_token(p_len integer default 12)
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  code text := '';
  i integer;
begin
  if p_len is null or p_len < 6 or p_len > 64 then
    raise exception 'token length must be between 6 and 64';
  end if;

  for i in 1..p_len loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;

  return code;
end;
$$;

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'pm'
    check (role = any (array['owner','admin','pm','viewer','client_viewer'])),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, profile_id)
);

create table if not exists public.recruitment_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  legacy_project_id uuid references public.projects(id) on delete set null,
  name text not null,
  share_code text not null default public.gen_ops_token(6),
  channel_type text not null default 'external'
    check (channel_type = any (array['general','external','partner','school','direct','legacy','other'])),
  status text not null default 'active'
    check (status = any (array['active','paused','archived'])),
  manager_label text,
  sort_order integer not null default 0,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (share_code),
  unique (project_id, name),
  unique (legacy_project_id)
);

create table if not exists public.recruitment_channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.recruitment_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'manager'
    check (role = any (array['owner','manager','viewer'])),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (channel_id, profile_id)
);

create table if not exists public.project_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  event_type text not null default 'other'
    check (event_type = any (array['audition','rehearsal','shoot','meeting','fitting','other'])),
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  status text not null default 'planned'
    check (status = any (array['planned','active','completed','cancelled'])),
  ops_code text not null default public.gen_ops_token(24),
  public_pass_code text not null default public.gen_ops_token(12),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ops_code),
  unique (public_pass_code)
);

create table if not exists public.event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.project_events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'checkin'
    check (role = any (array['admin','checkin','floor_manager','client_viewer'])),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.project_events(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  recruitment_channel_id uuid references public.recruitment_channels(id) on delete set null,
  legacy_ops_contact_id uuid references public.ops_ndol_contacts(id) on delete set null,
  bib_code text,
  pass_token text not null default public.gen_ops_token(32),
  attendance_status text not null default 'not_arrived'
    check (attendance_status = any (array['not_arrived','checked_in','no_show','self_withdrawn'])),
  onsite_status text not null default 'waiting'
    check (onsite_status = any (array['waiting','watching','hold','eliminated','finalist','self_withdrawn'])),
  settlement_eligible boolean not null default false,
  checked_in_at timestamptz,
  eliminated_at timestamptz,
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, dancer_id),
  unique (pass_token)
);

create unique index if not exists event_participants_event_bib_unique
  on public.event_participants(event_id, bib_code)
  where bib_code is not null;

create table if not exists public.outreach_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recruitment_channel_id uuid references public.recruitment_channels(id) on delete set null,
  event_id uuid references public.project_events(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  dancer_id uuid references public.dancers(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  contact_method text not null default 'phone'
    check (contact_method = any (array['phone','email','instagram','kakao','other'])),
  status text not null default 'pending'
    check (status = any (array['pending','no_answer','unavailable','available','do_not_contact','done'])),
  priority integer not null default 0,
  due_at timestamptz,
  last_contacted_at timestamptz,
  result_note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications
  add column if not exists recruitment_channel_id uuid references public.recruitment_channels(id) on delete set null;

alter table public.project_schedules
  add column if not exists project_event_id uuid references public.project_events(id) on delete set null;

alter table public.settlements
  add column if not exists event_participant_id uuid references public.event_participants(id) on delete set null;

create index if not exists applications_recruitment_channel_idx
  on public.applications(recruitment_channel_id)
  where recruitment_channel_id is not null;

create index if not exists recruitment_channels_project_idx
  on public.recruitment_channels(project_id, status, sort_order);

create index if not exists recruitment_channels_legacy_project_idx
  on public.recruitment_channels(legacy_project_id)
  where legacy_project_id is not null;

create index if not exists recruitment_channel_members_profile_idx
  on public.recruitment_channel_members(profile_id);

create index if not exists project_events_project_idx
  on public.project_events(project_id, starts_at, status);

create index if not exists event_staff_profile_idx
  on public.event_staff(profile_id);

create index if not exists event_participants_event_status_idx
  on public.event_participants(event_id, attendance_status, onsite_status);

create index if not exists event_participants_dancer_idx
  on public.event_participants(dancer_id);

create index if not exists event_participants_channel_idx
  on public.event_participants(recruitment_channel_id)
  where recruitment_channel_id is not null;

create index if not exists outreach_tasks_project_status_idx
  on public.outreach_tasks(project_id, status, priority desc);

create index if not exists outreach_tasks_assignee_idx
  on public.outreach_tasks(assigned_to, status)
  where assigned_to is not null;

create index if not exists outreach_tasks_channel_idx
  on public.outreach_tasks(recruitment_channel_id, status)
  where recruitment_channel_id is not null;

create index if not exists project_schedules_project_event_idx
  on public.project_schedules(project_event_id)
  where project_event_id is not null;

create index if not exists settlements_event_participant_idx
  on public.settlements(event_participant_id)
  where event_participant_id is not null;

create or replace function public.touch_ops_normalized_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists project_members_touch_updated_at on public.project_members;
create trigger project_members_touch_updated_at
  before update on public.project_members
  for each row execute function public.touch_ops_normalized_updated_at();

drop trigger if exists recruitment_channels_touch_updated_at on public.recruitment_channels;
create trigger recruitment_channels_touch_updated_at
  before update on public.recruitment_channels
  for each row execute function public.touch_ops_normalized_updated_at();

drop trigger if exists project_events_touch_updated_at on public.project_events;
create trigger project_events_touch_updated_at
  before update on public.project_events
  for each row execute function public.touch_ops_normalized_updated_at();

drop trigger if exists event_participants_touch_updated_at on public.event_participants;
create trigger event_participants_touch_updated_at
  before update on public.event_participants
  for each row execute function public.touch_ops_normalized_updated_at();

drop trigger if exists outreach_tasks_touch_updated_at on public.outreach_tasks;
create trigger outreach_tasks_touch_updated_at
  before update on public.outreach_tasks
  for each row execute function public.touch_ops_normalized_updated_at();

create or replace function public.applications_recruitment_channel_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  channel_project_id uuid;
  channel_legacy_project_id uuid;
begin
  if new.recruitment_channel_id is null then
    return new;
  end if;

  select rc.project_id, rc.legacy_project_id
    into channel_project_id, channel_legacy_project_id
  from public.recruitment_channels rc
  where rc.id = new.recruitment_channel_id;

  if channel_project_id is null then
    raise exception 'recruitment channel not found';
  end if;

  if channel_project_id <> new.project_id
     and coalesce(channel_legacy_project_id, '00000000-0000-0000-0000-000000000000'::uuid) <> new.project_id then
    raise exception 'recruitment channel project mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_recruitment_channel_guard_trg on public.applications;
create trigger applications_recruitment_channel_guard_trg
  before insert or update of project_id, recruitment_channel_id on public.applications
  for each row execute function public.applications_recruitment_channel_guard();

insert into public.project_members(project_id, profile_id, role, added_by, created_at, updated_at)
select p.id, p.owner_id, 'owner', p.owner_id, now(), now()
from public.projects p
where p.owner_id is not null
on conflict (project_id, profile_id) do update
set role = case
    when public.project_members.role = 'owner' then public.project_members.role
    else excluded.role
  end,
  updated_at = now();

insert into public.project_members(project_id, profile_id, role, added_by, created_at, updated_at)
select pm.project_id, pm.profile_id, 'pm', pm.added_by, pm.created_at, now()
from public.project_managers pm
on conflict (project_id, profile_id) do nothing;

create or replace function public.is_project_ops_member(p_project_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.profile_id = auth.uid()
      and (p_roles is null or pm.role = any(p_roles))
  );
$$;

create or replace function public.can_manage_project_ops(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or public.can_manage_project(p_project_id)
      or public.is_project_ops_member(p_project_id, array['owner','admin','pm']);
$$;

create or replace function public.can_view_project_ops(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_project_ops(p_project_id)
      or public.is_project_ops_member(p_project_id, array['viewer','client_viewer']);
$$;

create or replace function public.can_view_recruitment_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recruitment_channels rc
    where rc.id = p_channel_id
      and (
        public.can_view_project_ops(rc.project_id)
        or exists (
          select 1
          from public.recruitment_channel_members rcm
          where rcm.channel_id = rc.id
            and rcm.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_manage_recruitment_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.recruitment_channels rc
    where rc.id = p_channel_id
      and (
        public.can_manage_project_ops(rc.project_id)
        or exists (
          select 1
          from public.recruitment_channel_members rcm
          where rcm.channel_id = rc.id
            and rcm.profile_id = auth.uid()
            and rcm.role = any(array['owner','manager'])
        )
      )
  );
$$;

create or replace function public.can_view_project_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_events pe
    where pe.id = p_event_id
      and (
        public.can_view_project_ops(pe.project_id)
        or exists (
          select 1
          from public.event_staff es
          where es.event_id = pe.id
            and es.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.recruitment_channels rc
          join public.recruitment_channel_members rcm on rcm.channel_id = rc.id
          where rc.project_id = pe.project_id
            and rcm.profile_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_manage_project_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_events pe
    where pe.id = p_event_id
      and (
        public.can_manage_project_ops(pe.project_id)
        or exists (
          select 1
          from public.event_staff es
          where es.event_id = pe.id
            and es.profile_id = auth.uid()
            and es.role = 'admin'
        )
      )
  );
$$;

create or replace function public.can_view_event_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_participants ep
    join public.project_events pe on pe.id = ep.event_id
    where ep.id = p_participant_id
      and (
        public.can_view_project_ops(pe.project_id)
        or exists (
          select 1
          from public.event_staff es
          where es.event_id = ep.event_id
            and es.profile_id = auth.uid()
        )
        or (
          ep.recruitment_channel_id is not null
          and public.can_view_recruitment_channel(ep.recruitment_channel_id)
        )
      )
  );
$$;

create or replace function public.can_manage_event_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_participants ep
    join public.project_events pe on pe.id = ep.event_id
    where ep.id = p_participant_id
      and (
        public.can_manage_project_ops(pe.project_id)
        or exists (
          select 1
          from public.event_staff es
          where es.event_id = ep.event_id
            and es.profile_id = auth.uid()
            and es.role = any(array['admin','checkin','floor_manager'])
        )
      )
  );
$$;

alter table public.project_members enable row level security;
alter table public.recruitment_channels enable row level security;
alter table public.recruitment_channel_members enable row level security;
alter table public.project_events enable row level security;
alter table public.event_staff enable row level security;
alter table public.event_participants enable row level security;
alter table public.outreach_tasks enable row level security;

grant select, insert, update, delete on public.project_members to authenticated;
grant select, insert, update, delete on public.recruitment_channels to authenticated;
grant select, insert, update, delete on public.recruitment_channel_members to authenticated;
grant select, insert, update, delete on public.project_events to authenticated;
grant select, insert, update, delete on public.event_staff to authenticated;
grant select, insert, update, delete on public.event_participants to authenticated;
grant select, insert, update, delete on public.outreach_tasks to authenticated;
grant execute on function public.gen_ops_token(integer) to authenticated;
grant execute on function public.can_manage_project_ops(uuid) to authenticated;
grant execute on function public.can_view_project_ops(uuid) to authenticated;
grant execute on function public.can_view_recruitment_channel(uuid) to authenticated;
grant execute on function public.can_manage_recruitment_channel(uuid) to authenticated;
grant execute on function public.can_view_project_event(uuid) to authenticated;
grant execute on function public.can_manage_project_event(uuid) to authenticated;
grant execute on function public.can_view_event_participant(uuid) to authenticated;
grant execute on function public.can_manage_event_participant(uuid) to authenticated;

drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members
  for select to authenticated
  using (profile_id = auth.uid() or public.can_view_project_ops(project_id));

drop policy if exists project_members_manage on public.project_members;
create policy project_members_manage on public.project_members
  for all to authenticated
  using (public.can_manage_project_ops(project_id))
  with check (public.can_manage_project_ops(project_id));

drop policy if exists recruitment_channels_select on public.recruitment_channels;
create policy recruitment_channels_select on public.recruitment_channels
  for select to authenticated
  using (public.can_view_recruitment_channel(id));

drop policy if exists recruitment_channels_manage on public.recruitment_channels;
create policy recruitment_channels_manage on public.recruitment_channels
  for all to authenticated
  using (public.can_manage_project_ops(project_id))
  with check (public.can_manage_project_ops(project_id));

drop policy if exists recruitment_channel_members_select on public.recruitment_channel_members;
create policy recruitment_channel_members_select on public.recruitment_channel_members
  for select to authenticated
  using (profile_id = auth.uid() or public.can_view_recruitment_channel(channel_id));

drop policy if exists recruitment_channel_members_manage on public.recruitment_channel_members;
create policy recruitment_channel_members_manage on public.recruitment_channel_members
  for all to authenticated
  using (public.can_manage_recruitment_channel(channel_id))
  with check (public.can_manage_recruitment_channel(channel_id));

drop policy if exists project_events_select on public.project_events;
create policy project_events_select on public.project_events
  for select to authenticated
  using (public.can_view_project_event(id));

drop policy if exists project_events_manage on public.project_events;
create policy project_events_manage on public.project_events
  for all to authenticated
  using (public.can_manage_project_ops(project_id))
  with check (public.can_manage_project_ops(project_id));

drop policy if exists event_staff_select on public.event_staff;
create policy event_staff_select on public.event_staff
  for select to authenticated
  using (profile_id = auth.uid() or public.can_view_project_event(event_id));

drop policy if exists event_staff_manage on public.event_staff;
create policy event_staff_manage on public.event_staff
  for all to authenticated
  using (public.can_manage_project_event(event_id))
  with check (public.can_manage_project_event(event_id));

drop policy if exists event_participants_select on public.event_participants;
create policy event_participants_select on public.event_participants
  for select to authenticated
  using (public.can_view_event_participant(id));

drop policy if exists event_participants_manage on public.event_participants;
create policy event_participants_manage on public.event_participants
  for all to authenticated
  using (public.can_manage_event_participant(id))
  with check (public.can_manage_project_event(event_id));

drop policy if exists outreach_tasks_select on public.outreach_tasks;
create policy outreach_tasks_select on public.outreach_tasks
  for select to authenticated
  using (
    public.can_view_project_ops(project_id)
    or assigned_to = auth.uid()
    or (
      recruitment_channel_id is not null
      and public.can_view_recruitment_channel(recruitment_channel_id)
    )
  );

drop policy if exists outreach_tasks_manage on public.outreach_tasks;
create policy outreach_tasks_manage on public.outreach_tasks
  for all to authenticated
  using (
    public.can_manage_project_ops(project_id)
    or assigned_to = auth.uid()
    or (
      recruitment_channel_id is not null
      and public.can_manage_recruitment_channel(recruitment_channel_id)
    )
  )
  with check (
    public.can_manage_project_ops(project_id)
    or assigned_to = auth.uid()
    or (
      recruitment_channel_id is not null
      and public.can_manage_recruitment_channel(recruitment_channel_id)
    )
  );

drop policy if exists applications_channel_select on public.applications;
create policy applications_channel_select on public.applications
  for select to authenticated
  using (
    recruitment_channel_id is not null
    and public.can_view_recruitment_channel(recruitment_channel_id)
  );

drop policy if exists project_schedules_project_event_select on public.project_schedules;
create policy project_schedules_project_event_select on public.project_schedules
  for select to authenticated
  using (
    project_event_id is not null
    and public.can_view_project_event(project_event_id)
  );

drop policy if exists project_schedule_responses_channel_select on public.project_schedule_responses;
create policy project_schedule_responses_channel_select on public.project_schedule_responses
  for select to authenticated
  using (
    exists (
      select 1
      from public.project_schedules ps
      join public.applications a on a.project_id = ps.project_id
        and a.dancer_id = project_schedule_responses.dancer_id
      where ps.id = project_schedule_responses.schedule_id
        and a.recruitment_channel_id is not null
        and public.can_view_recruitment_channel(a.recruitment_channel_id)
    )
  );

drop policy if exists settlements_event_participant_select on public.settlements;
create policy settlements_event_participant_select on public.settlements
  for select to authenticated
  using (
    event_participant_id is not null
    and public.can_view_event_participant(event_participant_id)
  );

comment on table public.recruitment_channels is 'Normalized recruitment source/channel for a parent project. Legacy child projects can be linked through legacy_project_id.';
comment on table public.project_events is 'Operational event/date for a project: audition, rehearsal, shoot, fitting, etc.';
comment on table public.event_participants is 'Event-scoped participant state: bib, QR token, attendance, onsite decision, settlement eligibility.';
comment on table public.outreach_tasks is 'Contact/outreach workflow separated from applications and attendance.';
comment on column public.applications.recruitment_channel_id is 'Optional normalized source channel. For legacy projects this may remain null until backfilled.';
comment on column public.project_schedules.project_event_id is 'Optional normalized event link; legacy schedules can remain project-scoped.';
comment on column public.settlements.event_participant_id is 'Optional event participant link for event-scoped settlement workflows.';
