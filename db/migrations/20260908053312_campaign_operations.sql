begin;
create table public.campaign_participant_operations (
 participant_id uuid primary key, project_id uuid not null,
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
 version integer not null default 1, updated_at timestamptz not null default now(),
 foreign key(participant_id,project_id) references public.campaign_participants(id,project_id)
);
create table public.campaign_operations_settings (
 project_id uuid primary key references public.projects(id),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'),
 version integer not null default 1, updated_at timestamptz not null default now()
);
alter table public.campaign_budget_fees add column terms jsonb not null default '{}' check(jsonb_typeof(terms)='object');
alter table public.campaign_participant_operations enable row level security;
alter table public.campaign_operations_settings enable row level security;
revoke all on public.campaign_participant_operations,public.campaign_operations_settings from public,anon,authenticated;
grant all on public.campaign_participant_operations,public.campaign_operations_settings to service_role;
create function public.campaign_operations_mutate(p_project uuid,p_actor uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare person public.campaign_participants; previous jsonb; fields jsonb; fee jsonb; vterms jsonb; account jsonb; v integer; k text; amount bigint;
begin
 perform 1 from public.projects where id=p_project and deleted_at is null for update;
 if not found or not exists(select 1 from public.profiles p where p.id=p_actor and (p.is_admin or exists(select 1 from public.projects where id=p_project and owner_id=p_actor) or exists(select 1 from public.project_managers where project_id=p_project and profile_id=p_actor))) then raise exception 'CAMPAIGN_DENIED'; end if;
 fields:=p_data->'fields';
 if fields is null or jsonb_typeof(fields)<>'object' or octet_length(fields::text)>20000 then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
 if p_action='settings' then
   if not exists(select 1 from public.profiles where id=p_actor and is_admin and is_super_admin) then raise exception 'CAMPAIGN_DENIED'; end if;
   select version,to_jsonb(s) into v,previous from public.campaign_operations_settings s where project_id=p_project;
   if coalesce(v,0) is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
   foreach k in array array['spend_target','spend_cap'] loop
     if fields->>k is not null and ((fields->>k)::bigint<0 or (fields->>k)::bigint>1000000000000) then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
   end loop;
   if (fields->>'spend_target')::bigint>(fields->>'spend_cap')::bigint then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
   insert into public.campaign_operations_settings(project_id,data) values(p_project,fields)
   on conflict(project_id) do update set data=excluded.data,version=campaign_operations_settings.version+1,updated_at=now();
 else
   if p_action<>'participant' then raise exception 'CAMPAIGN_INVALID_ACTION'; end if;
   select * into person from public.campaign_participants where id=(p_data->>'participant_id')::uuid and project_id=p_project for update;
   if not found or person.version is distinct from (p_data->>'participant_version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
   select version,to_jsonb(o) into v,previous from public.campaign_participant_operations o where participant_id=person.id;
   if coalesce(v,0) is distinct from (p_data->>'version')::integer then raise exception 'CAMPAIGN_STALE'; end if;
   if coalesce(fields->>'engagement','') not in ('confirmed','negotiating','on_hold','cancelled') or coalesce(fields->>'schedule_kind','') not in ('participation','upload') then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
   if fields->>'planned_on' is not null then perform (fields->>'planned_on')::date; end if;
   if jsonb_typeof(fields->'accounts') is distinct from 'array' or jsonb_array_length(fields->'accounts')>10 then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
   for account in select value from jsonb_array_elements(fields->'accounts') loop
     if coalesce(account->>'handle','')!~'^[a-z0-9._]{1,30}$' or coalesce((account->>'count')::integer,0) not between 1 and 10 then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     foreach k in array array['guide_amount','agreed_amount'] loop
       if account->>k is not null and ((account->>k)::bigint<0 or (account->>k)::bigint>1000000000000) then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     end loop;
   end loop;
   if (select count(*)<>count(distinct value->>'handle') from jsonb_array_elements(fields->'accounts')) then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
   fee:=p_data->'fee';
   if fee is not null and fee<>'null'::jsonb then
     vterms:=fee->'terms';
     if jsonb_typeof(vterms) is distinct from 'object' then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     foreach k in array array['guide_amount','quote_amount','offer_amount','base_amount','bonus_amount','threshold'] loop
       if vterms->>k is not null and ((vterms->>k)::bigint<0 or (vterms->>k)::bigint>1000000000000) then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     end loop;
     if coalesce(vterms->>'condition_state','') not in ('unmeasured','below','met') then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     if coalesce((vterms->>'bonus_amount')::bigint,0)>0 and coalesce((vterms->>'threshold')::bigint,0)=0 then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     amount:=case when vterms->>'base_amount' is null and vterms->>'bonus_amount' is null then null else coalesce((vterms->>'base_amount')::bigint,0)+coalesce((vterms->>'bonus_amount')::bigint,0) end;
     if amount>1000000000000 then raise exception 'CAMPAIGN_INVALID_INPUT'; end if;
     -- A fee reservation is independent of engagement; restore temporarily inside this atomic transaction.
     update public.campaign_participants set active=true where id=person.id;
     perform public.campaign_budget_mutate(p_project,p_actor,'fee',fee||jsonb_build_object('participant_id',person.id,'amount',amount));
     update public.campaign_budget_fees set terms=vterms where participant_id=person.id;
   end if;
   update public.campaign_participants set owner_label=coalesce(fields->>'owner_label',''),active=(fields->>'engagement'<>'cancelled'),version=version+1,updated_at=now() where id=person.id;
   insert into public.campaign_participant_operations(participant_id,project_id,data) values(person.id,p_project,fields)
   on conflict(participant_id) do update set data=excluded.data,version=campaign_participant_operations.version+1,updated_at=now();
 end if;
 insert into public.campaign_submission_events(project_id,participant_id,actor_id,action,detail)
 values(p_project,person.id,p_actor,'operations_'||p_action,jsonb_build_object('input',p_data,'previous',previous));
 return '{}';
end $$;
revoke all on function public.campaign_operations_mutate(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.campaign_operations_mutate(uuid,uuid,text,jsonb) to service_role;
commit;
