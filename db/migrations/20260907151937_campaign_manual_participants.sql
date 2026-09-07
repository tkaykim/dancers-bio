begin;
alter table public.campaign_participants add column manual_entry_id uuid unique;
alter table public.campaign_participants add column client_visible boolean not null default false;
alter table public.campaign_participants drop constraint campaign_participants_check;
alter table public.campaign_participants add constraint campaign_participants_origin_check check(board_member_id is not null or application_id is not null or manual_entry_id is not null);
create function public.campaign_manual_participant(p_project uuid,p_actor uuid,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare person public.campaign_participants; previous jsonb; target uuid; handle text; label text;
begin
  perform 1 from public.projects where id=p_project and deleted_at is null for update;
  if not found or not exists(select 1 from public.profiles p where p.id=p_actor and (p.is_admin
    or exists(select 1 from public.projects where id=p_project and owner_id=p_actor)
    or exists(select 1 from public.project_managers where project_id=p_project and profile_id=p_actor))) then raise exception 'CAMPAIGN_DENIED'; end if;
  if not exists(select 1 from public.campaign_submission_settings where project_id=p_project and enabled) then raise exception 'CAMPAIGN_DENIED'; end if;
  if p_data->>'participant_id' is not null then
    select * into person from public.campaign_participants where id=(p_data->>'participant_id')::uuid and project_id=p_project and manual_entry_id is not null;
    if not found then raise exception 'CAMPAIGN_DENIED'; end if;
    if person.version is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
  else
    if p_data->>'request_id' is null then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
    select * into person from public.campaign_participants where manual_entry_id=(p_data->>'request_id')::uuid;
    if found then
      if person.project_id<>p_project then raise exception 'CAMPAIGN_DENIED'; end if;
      return jsonb_build_object('id',person.id,'duplicate',true);
    end if;
  end if;
  previous:=to_jsonb(person); target:=nullif(p_data->>'dancer_id','')::uuid;
  label:=trim(p_data->>'display_name'); handle:=nullif(lower(trim(p_data->>'ig_handle')),'');
  if label is null or length(label) not between 1 and 100 or (handle is not null and handle !~ '^[a-z0-9._]{1,30}$') then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
  if nullif(trim(p_data->>'note'),'') is null then raise exception 'CAMPAIGN_LINK_REASON'; end if;
  if target is not null and not exists(select 1 from public.dancers where id=target) then raise exception 'CAMPAIGN_MEMBER_MISSING'; end if;
  if exists(select 1 from public.campaign_participants p where p.project_id=p_project and p.id is distinct from person.id and
    ((target is not null and p.dancer_id=target) or (handle is not null and lower(p.ig_handle)=handle))) then raise exception 'CAMPAIGN_DUPLICATE_PERSON'; end if;
  if person.id is null then
    insert into public.campaign_participants(project_id,manual_entry_id,dancer_id,display_name,ig_handle,note,owner_label,client_visible)
      values(p_project,(p_data->>'request_id')::uuid,target,label,handle,p_data->>'note',coalesce(p_data->>'owner_label',''),coalesce((p_data->>'client_visible')::boolean,false)) returning * into person;
  else
    update public.campaign_participants set dancer_id=target,display_name=label,ig_handle=handle,note=p_data->>'note',
      owner_label=coalesce(p_data->>'owner_label',''),client_visible=coalesce((p_data->>'client_visible')::boolean,false),version=version+1,updated_at=now() where id=person.id returning * into person;
  end if;
  insert into public.campaign_submission_events(project_id,participant_id,actor_id,action,detail)
    values(p_project,person.id,p_actor,'manual_participant',jsonb_build_object('previous',previous,'input',p_data));
  return jsonb_build_object('id',person.id);
end $$;
revoke all on function public.campaign_manual_participant(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_manual_participant(uuid,uuid,jsonb) to service_role;
commit;
