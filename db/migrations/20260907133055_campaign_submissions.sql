-- Additive, service-role only. Apply before the application deployment.
begin;
create table public.campaign_submission_settings (
  project_id uuid primary key references public.projects(id),
  enabled boolean not null default false,
  board_id uuid references public.casting_boards(id),
  deadline timestamptz,
  client_visible boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.campaign_participants (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  board_member_id uuid references public.casting_board_members(id),
  application_id uuid references public.applications(id), dancer_id uuid references public.dancers(id),
  display_name text not null check(length(display_name) between 1 and 100), ig_handle text,
  owner_label text not null default '' check(length(owner_label)<=100),
  deadline timestamptz, active boolean not null default true, note text not null default '' check(length(note)<=5000),
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,project_id), unique(project_id,board_member_id), unique(project_id,application_id), unique(project_id,dancer_id),
  check(board_member_id is not null or application_id is not null)
);
create table public.campaign_submissions (
  id uuid primary key default gen_random_uuid(), project_id uuid not null,
  participant_id uuid not null, post_id uuid not null,
  status text not null default 'pending_review' check(status in ('pending_review','changes_requested','approved')),
  feedback text not null default '' check(length(feedback)<=2000),
  review_checks jsonb not null default '{}',
  submitted_by uuid not null references public.profiles(id), source text not null check(source in ('participant','admin')),
  submitted_at timestamptz not null default now(), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  replaced_at timestamptz, version integer not null default 1,
  unique(id,project_id),
  foreign key(participant_id,project_id) references public.campaign_participants(id,project_id),
  foreign key(post_id,project_id) references public.campaign_posts(id,project_id)
);
create unique index campaign_submissions_current on public.campaign_submissions(participant_id,post_id) where replaced_at is null;
create index campaign_submissions_project on public.campaign_submissions(project_id,participant_id);
create table public.campaign_submission_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  participant_id uuid, submission_id uuid, actor_id uuid not null references public.profiles(id),
  action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(participant_id,project_id) references public.campaign_participants(id,project_id),
  foreign key(submission_id,project_id) references public.campaign_submissions(id,project_id)
);
create index campaign_submission_events_project on public.campaign_submission_events(project_id,created_at desc);
create function public.campaign_participant_scope_guard() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if new.application_id is not null and not exists(select 1 from public.applications a where a.id=new.application_id
    and a.project_id=new.project_id and a.dancer_id=new.dancer_id) then raise exception 'CAMPAIGN_APPLICATION_MISMATCH'; end if;
  if new.board_member_id is not null and not exists(select 1 from public.casting_board_members m join public.casting_boards b on b.id=m.board_id
    where m.id=new.board_member_id and b.project_id=new.project_id) then raise exception 'CAMPAIGN_BOARD_MISMATCH'; end if;
  return new;
end $$;
create trigger campaign_participant_scope before insert or update on public.campaign_participants
for each row execute function public.campaign_participant_scope_guard();
revoke all on function public.campaign_participant_scope_guard() from public,anon,authenticated;
alter table public.campaign_submission_settings enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.campaign_submissions enable row level security;
alter table public.campaign_submission_events enable row level security;
revoke all on public.campaign_submission_settings,public.campaign_participants,public.campaign_submissions,public.campaign_submission_events from public,anon,authenticated;
grant all on public.campaign_submission_settings,public.campaign_participants,public.campaign_submissions,public.campaign_submission_events to service_role;

-- The actor comes only from a verified server session. This RPC is NOT granted to authenticated.
-- A project lock serializes review/replacement/import; versions reject stale editor writes.
create function public.campaign_submission_mutate(p_project uuid,p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  staff boolean; cfg public.campaign_submission_settings; person public.campaign_participants;
  sub public.campaign_submissions; previous public.campaign_submissions;
  post public.campaign_posts; member record; app record; person_id uuid; sub_id uuid;
  result jsonb := '{}'; n integer := 0; code text; linked_dancer uuid;
begin
  perform 1 from public.projects where id=p_project and deleted_at is null for update;
  if not found or not exists(select 1 from public.profiles where id=p_actor) then raise exception 'CAMPAIGN_DENIED'; end if;
  select coalesce(p.is_admin,false) or exists(select 1 from public.projects where id=p_project and owner_id=p_actor)
    or exists(select 1 from public.project_managers where project_id=p_project and profile_id=p_actor)
    into staff from public.profiles p where p.id=p_actor;
  select * into cfg from public.campaign_submission_settings where project_id=p_project;
  if p_action <> 'submit' and not staff then raise exception 'CAMPAIGN_DENIED'; end if;

  if p_action='configure' then
    if coalesce(cfg.version,0) <> coalesce((p_data->>'version')::integer,-1) then raise exception 'CAMPAIGN_STALE'; end if;
    if p_data->>'board_id' is not null and not exists(select 1 from public.casting_boards where id=(p_data->>'board_id')::uuid and project_id=p_project)
      then raise exception 'CAMPAIGN_BOARD_MISMATCH'; end if;
    if cfg.board_id is distinct from (p_data->>'board_id')::uuid and exists(select 1 from public.campaign_participants where project_id=p_project)
      then raise exception 'CAMPAIGN_BOARD_LOCKED'; end if;
    insert into public.campaign_submission_settings(project_id,enabled,board_id,deadline,client_visible)
      values(p_project,coalesce((p_data->>'enabled')::boolean,false),(p_data->>'board_id')::uuid,(p_data->>'deadline')::timestamptz,coalesce((p_data->>'client_visible')::boolean,false))
      on conflict(project_id) do update set enabled=excluded.enabled,board_id=excluded.board_id,deadline=excluded.deadline,
        client_visible=excluded.client_visible,version=campaign_submission_settings.version+1,updated_at=now();
  elsif p_action='sync' then
    if cfg.project_id is null then raise exception 'CAMPAIGN_NOT_ENABLED'; end if;
    if cfg.board_id is not null then
      for member in select m.*,d.stage_name from public.casting_board_members m left join public.dancers d on d.id=m.dancer_id
        where m.board_id=cfg.board_id and m.lineup_status='confirmed' loop
        -- Conflicting historical application links never grant member access.
        if member.application_id is not null and not exists(select 1 from public.applications a where a.id=member.application_id
          and a.project_id=p_project and a.dancer_id=member.dancer_id and a.status='accepted' and a.confirmed_at is not null and a.archived_at is null)
          then continue; end if;
        insert into public.campaign_participants(project_id,board_member_id,application_id,dancer_id,display_name,ig_handle)
          values(p_project,member.id,member.application_id,member.dancer_id,coalesce(nullif(member.display_name,''),member.stage_name,'참여자'),member.ig_handle)
          on conflict do nothing;
        if found then n:=n+1; end if;
      end loop;
    else
      for app in select a.id,a.dancer_id,d.stage_name,d.social_links from public.applications a join public.dancers d on d.id=a.dancer_id
        where a.project_id=p_project and a.status='accepted' and a.confirmed_at is not null and a.archived_at is null loop
        insert into public.campaign_participants(project_id,application_id,dancer_id,display_name)
          values(p_project,app.id,app.dancer_id,coalesce(nullif(app.stage_name,''),'참여자')) on conflict do nothing;
        if found then n:=n+1; end if;
      end loop;
    end if;
    result:=jsonb_build_object('added',n);
  elsif p_action='participant' then
    select * into person from public.campaign_participants where id=(p_data->>'participant_id')::uuid and project_id=p_project;
    if not found then raise exception 'CAMPAIGN_DENIED'; end if;
    person_id:=person.id;
    if person.version is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
    linked_dancer:=nullif(p_data->>'dancer_id','')::uuid;
    if linked_dancer is distinct from person.dancer_id then
      if person.application_id is not null then raise exception 'CAMPAIGN_APPLICATION_LOCKED'; end if;
      if linked_dancer is not null and not exists(select 1 from public.dancers where id=linked_dancer and profile_id is not null)
        then raise exception 'CAMPAIGN_MEMBER_MISSING'; end if;
      if nullif(trim(p_data->>'link_reason'),'') is null then raise exception 'CAMPAIGN_LINK_REASON'; end if;
    end if;
    if person.deadline is distinct from (p_data->>'deadline')::timestamptz and nullif(trim(p_data->>'note'),'') is null
      then raise exception 'CAMPAIGN_DEADLINE_REASON'; end if;
    update public.campaign_participants set dancer_id=linked_dancer,owner_label=coalesce(p_data->>'owner_label',''),
      deadline=(p_data->>'deadline')::timestamptz,active=coalesce((p_data->>'active')::boolean,true),note=coalesce(p_data->>'note',''),
      version=version+1,updated_at=now() where id=person.id;
  elsif p_action='submit' then
    select * into person from public.campaign_participants where id=(p_data->>'participant_id')::uuid and project_id=p_project;
    if not found or not person.active or not coalesce(cfg.enabled,false) then raise exception 'CAMPAIGN_DENIED'; end if;
    person_id:=person.id;
    if not staff and (not exists(select 1 from public.dancers where id=person.dancer_id and profile_id=p_actor)
      or (person.application_id is not null and not exists(select 1 from public.applications where id=person.application_id
        and project_id=p_project and dancer_id=person.dancer_id and status='accepted' and confirmed_at is not null and archived_at is null)))
      then raise exception 'CAMPAIGN_DENIED'; end if;
    code:=p_data->>'short_code';
    if code is null or code !~ '^[A-Za-z0-9_-]{1,100}$' or p_data->>'url' is distinct from 'https://www.instagram.com/reel/'||code||'/'
      then raise exception 'CAMPAIGN_INVALID_URL'; end if;
    if p_data->>'replace_id' is not null then
      select * into previous from public.campaign_submissions where id=(p_data->>'replace_id')::uuid
        and project_id=p_project and participant_id=person.id and replaced_at is null;
      if not found or previous.version is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
    end if;
    select * into post from public.campaign_posts where project_id=p_project and short_code=code;
    if post.id is null then
      insert into public.campaign_posts(project_id,short_code,post_url,display_name,dancer_id,application_id,source,created_by)
        values(p_project,code,p_data->>'url',person.display_name,person.dancer_id,person.application_id,case when staff then 'admin_paste' else 'participant' end,p_actor) returning * into post;
    end if;
    if post.status in ('removed','excluded') then raise exception 'CAMPAIGN_POST_UNAVAILABLE'; end if;
    select * into sub from public.campaign_submissions where participant_id=person.id and post_id=post.id and replaced_at is null;
    if sub.id is not null then
      if previous.id is null then return jsonb_build_object('id',sub.id,'duplicate',true); end if;
      if sub.id <> previous.id then raise exception 'CAMPAIGN_ALREADY_LINKED'; end if;
      -- Same-URL resubmission also resets approval; retain history in the event below.
      update public.campaign_submissions set status='pending_review',feedback='',review_checks='{}',reviewed_at=null,reviewed_by=null,
        submitted_at=now(),submitted_by=p_actor,source=case when staff then 'admin' else 'participant' end,version=version+1 where id=sub.id;
      sub_id:=sub.id;
    else
      if not staff and exists(select 1 from public.campaign_submissions where post_id=post.id and participant_id<>person.id and replaced_at is null)
        then raise exception 'CAMPAIGN_COLLAB_REVIEW'; end if;
      if previous.id is not null then update public.campaign_submissions set replaced_at=now(),version=version+1 where id=previous.id; end if;
      insert into public.campaign_submissions(project_id,participant_id,post_id,submitted_by,source)
        values(p_project,person.id,post.id,p_actor,case when staff then 'admin' else 'participant' end) returning id into sub_id;
    end if;
    result:=jsonb_build_object('id',sub_id);
  elsif p_action='review' then
    select * into sub from public.campaign_submissions where id=(p_data->>'submission_id')::uuid and project_id=p_project and replaced_at is null;
    if not found or sub.version is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
    select * into person from public.campaign_participants where id=sub.participant_id and active;
    if not found then raise exception 'CAMPAIGN_DENIED'; end if;
    person_id:=person.id; sub_id:=sub.id;
    if p_data->>'status' is null or p_data->>'status' not in ('approved','changes_requested') then raise exception 'CAMPAIGN_INVALID_STATUS'; end if;
    if p_data->>'status'='changes_requested' and nullif(trim(p_data->>'feedback'),'') is null then raise exception 'CAMPAIGN_FEEDBACK_REQUIRED'; end if;
    if p_data->>'status'='approved' then
      if not coalesce((p_data->'checks'->>'public')::boolean,false) or not coalesce((p_data->'checks'->>'account')::boolean,false)
        or not coalesce((p_data->'checks'->>'guidelines')::boolean,false) then raise exception 'CAMPAIGN_CHECKS_REQUIRED'; end if;
      if not exists(select 1 from public.campaign_posts where id=sub.post_id and status not in ('removed','excluded')) then raise exception 'CAMPAIGN_POST_UNAVAILABLE'; end if;
    end if;
    update public.campaign_submissions set status=p_data->>'status',feedback=coalesce(p_data->>'feedback',''),review_checks=coalesce(p_data->'checks','{}'),
      reviewed_by=p_actor,reviewed_at=now(),version=version+1 where id=sub.id;
  else raise exception 'CAMPAIGN_INVALID_ACTION';
  end if;
  insert into public.campaign_submission_events(project_id,participant_id,submission_id,actor_id,action,detail)
    values(p_project,person_id,sub_id,p_actor,p_action,jsonb_build_object('input',p_data,'previous',case when previous.id is not null then to_jsonb(previous) when sub.id is not null then to_jsonb(sub) when person.id is not null then to_jsonb(person) else null end));
  return result;
end $$;
revoke all on function public.campaign_submission_mutate(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_submission_mutate(uuid,uuid,text,jsonb) to service_role;
commit;
