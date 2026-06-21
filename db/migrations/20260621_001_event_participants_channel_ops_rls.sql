-- Allow recruitment channel managers to operate their own channel participants.
-- Project-level managers still retain full event access.

create or replace function public.can_manage_event_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
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
        or (
          ep.recruitment_channel_id is not null
          and public.can_manage_recruitment_channel(ep.recruitment_channel_id)
        )
      )
  );
$function$;

drop policy if exists event_participants_manage on public.event_participants;

create policy event_participants_manage
on public.event_participants
for all
using (public.can_manage_event_participant(id))
with check (
  public.can_manage_project_event(event_id)
  or exists (
    select 1
    from public.event_staff es
    where es.event_id = event_participants.event_id
      and es.profile_id = auth.uid()
      and es.role = any(array['admin','checkin','floor_manager'])
  )
  or (
    recruitment_channel_id is not null
    and public.can_manage_recruitment_channel(recruitment_channel_id)
  )
);
