begin;
create table public.campaign_budget_settings (
  project_id uuid primary key references public.projects(id),
  total_amount bigint check(total_amount between 0 and 1000000000000),
  operations_reserve bigint check(operations_reserve between 0 and 1000000000000),
  basis text not null default '' check(length(basis)<=2000),
  version integer not null default 1, updated_at timestamptz not null default now()
);
create table public.campaign_budget_fees (
  participant_id uuid primary key, project_id uuid not null,
  amount bigint check(amount between 0 and 1000000000000),
  status text not null default 'estimate' check(status in ('estimate','agreed')),
  note text not null check(length(trim(note)) between 1 and 2000),
  version integer not null default 1, updated_at timestamptz not null default now(),
  foreign key(participant_id,project_id) references public.campaign_participants(id,project_id)
);
create table public.campaign_budget_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  actor_id uuid not null references public.profiles(id), action text not null,
  detail jsonb not null, created_at timestamptz not null default now()
);
create index campaign_budget_fees_project on public.campaign_budget_fees(project_id);
create index campaign_budget_events_project on public.campaign_budget_events(project_id,created_at desc);
alter table public.campaign_budget_settings enable row level security;
alter table public.campaign_budget_fees enable row level security;
alter table public.campaign_budget_events enable row level security;
revoke all on public.campaign_budget_settings,public.campaign_budget_fees,public.campaign_budget_events from public,anon,authenticated;
grant all on public.campaign_budget_settings,public.campaign_budget_fees,public.campaign_budget_events to service_role;
create function public.campaign_budget_mutate(p_project uuid,p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare cfg public.campaign_budget_settings; fee public.campaign_budget_fees; previous jsonb;
begin
  if not exists(select 1 from public.profiles p where p.id=p_actor and
    ((p_action='configure' and p.is_admin and p.is_super_admin) or (p_action='fee' and (p.is_admin
      or exists(select 1 from public.projects where id=p_project and owner_id=p_actor)
      or exists(select 1 from public.project_managers where project_id=p_project and profile_id=p_actor))))) then raise exception 'CAMPAIGN_DENIED'; end if;
  perform 1 from public.projects where id=p_project and deleted_at is null for update;
  if not found then raise exception 'CAMPAIGN_DENIED'; end if;
  if p_action='configure' then
    select * into cfg from public.campaign_budget_settings where project_id=p_project;
    if coalesce(cfg.version,0) is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
    previous:=to_jsonb(cfg);
    if nullif(trim(p_data->>'basis'),'') is null then raise exception 'BUDGET_BASIS_REQUIRED'; end if;
    insert into public.campaign_budget_settings(project_id,total_amount,operations_reserve,basis)
      values(p_project,(p_data->>'total_amount')::bigint,(p_data->>'operations_reserve')::bigint,p_data->>'basis')
      on conflict(project_id) do update set total_amount=excluded.total_amount,operations_reserve=excluded.operations_reserve,
        basis=excluded.basis,version=campaign_budget_settings.version+1,updated_at=now();
  elsif p_action='fee' then
    if not exists(select 1 from public.campaign_participants where id=(p_data->>'participant_id')::uuid and project_id=p_project and active)
      then raise exception 'CAMPAIGN_DENIED'; end if;
    select * into fee from public.campaign_budget_fees where participant_id=(p_data->>'participant_id')::uuid;
    if coalesce(fee.version,0) is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
    previous:=to_jsonb(fee);
    if nullif(trim(p_data->>'note'),'') is null then raise exception 'BUDGET_BASIS_REQUIRED'; end if;
    insert into public.campaign_budget_fees(participant_id,project_id,amount,status,note)
      values((p_data->>'participant_id')::uuid,p_project,(p_data->>'amount')::bigint,p_data->>'status',p_data->>'note')
      on conflict(participant_id) do update set amount=excluded.amount,status=excluded.status,note=excluded.note,
        version=campaign_budget_fees.version+1,updated_at=now();
  else raise exception 'CAMPAIGN_INVALID_ACTION'; end if;
  insert into public.campaign_budget_events(project_id,actor_id,action,detail) values(p_project,p_actor,p_action,jsonb_build_object('previous',previous,'input',p_data));
  return '{}';
end $$;
revoke all on function public.campaign_budget_mutate(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_budget_mutate(uuid,uuid,text,jsonb) to service_role;
commit;
