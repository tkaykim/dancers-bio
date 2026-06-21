-- Channel member decision permissions.
-- Additive permission flags for recruitment channel managers.

alter table public.recruitment_channel_members
  add column if not exists can_view_applicants boolean not null default true,
  add column if not exists can_decide_applications boolean not null default false;

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
            and (
              coalesce(rcm.can_view_applicants, true)
              or coalesce(rcm.can_decide_applications, false)
            )
        )
      )
  );
$$;

create or replace function public.can_decide_recruitment_channel_applications(
  p_channel_id uuid
)
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
            and coalesce(rcm.can_decide_applications, false)
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
            and (
              rcm.role = 'owner'
              or coalesce(rcm.can_decide_applications, false)
            )
        )
      )
  );
$$;

grant execute on function public.can_view_recruitment_channel(uuid) to authenticated;
grant execute on function public.can_manage_recruitment_channel(uuid) to authenticated;
grant execute on function public.can_decide_recruitment_channel_applications(uuid) to authenticated;

drop policy if exists recruitment_channel_members_manage on public.recruitment_channel_members;
create policy recruitment_channel_members_manage on public.recruitment_channel_members
  for all to authenticated
  using (
    exists (
      select 1
      from public.recruitment_channels rc
      where rc.id = channel_id
        and public.can_manage_project_ops(rc.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.recruitment_channels rc
      where rc.id = channel_id
        and public.can_manage_project_ops(rc.project_id)
    )
  );

drop policy if exists applications_channel_update on public.applications;
create policy applications_channel_update on public.applications
  for update to authenticated
  using (
    recruitment_channel_id is not null
    and public.can_decide_recruitment_channel_applications(recruitment_channel_id)
  )
  with check (
    recruitment_channel_id is not null
    and public.can_decide_recruitment_channel_applications(recruitment_channel_id)
  );

comment on column public.recruitment_channel_members.can_view_applicants is
  'Whether this channel member can view applicants in this recruitment channel.';

comment on column public.recruitment_channel_members.can_decide_applications is
  'Whether this channel member can accept, reject, or return applicants to pending for this recruitment channel.';
