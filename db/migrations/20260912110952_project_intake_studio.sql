-- Admin-only source inbox. Originals and all generated media stay private.
create table public.project_intake_jobs (
  id uuid primary key,
  created_by uuid not null references public.profiles(id),
  source_raw text not null check(length(source_raw)<=20000),
  source_paths text[] not null default '{}' check(cardinality(source_paths)<=5),
  languages text[] not null check(cardinality(languages) between 1 and 4 and languages <@ array['ko','en','ja','zh','th','id']),
  private_terms text[] not null default '{}',
  hide_names boolean not null default true,
  status text not null default 'queued' check(status in ('queued','processing','review','failed','registered')),
  revision integer not null default 1,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  operator_notes text not null default '',
  project_override jsonb,
  result jsonb,
  assets jsonb not null default '[]',
  studio_jobs jsonb not null default '{}',
  error text,
  project_id uuid unique references public.projects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(length(source_raw)>=10 or cardinality(source_paths)>0)
);
alter table public.project_intake_jobs enable row level security;
revoke all on public.project_intake_jobs from anon, authenticated;
grant all on public.project_intake_jobs to service_role;
create index project_intake_jobs_queue on public.project_intake_jobs(status,created_at);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-intake','project-intake',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

-- Invoker: service_role only. SKIP LOCKED + token/revision fencing allow recovery.
create function public.claim_project_intake() returns setof public.project_intake_jobs
language plpgsql security invoker set search_path=public as $$
declare chosen uuid;
begin
  perform pg_advisory_xact_lock(hashtext('deetz-project-intake-worker'));
  if exists(select 1 from project_intake_jobs where status='processing' and lease_until>now()) then return; end if;
  update project_intake_jobs set status='failed', error='처리 시간이 초과되었습니다. 다시 시도해 주세요.',updated_at=now()
  where status='processing' and lease_until<now() and attempts>=3;
  select id into chosen from project_intake_jobs
  where status='queued' or (status='processing' and lease_until<now() and attempts<3)
  order by created_at for update skip locked limit 1;
  if chosen is null then return; end if;
  return query update project_intake_jobs set status='processing',lease_token=gen_random_uuid(),
    lease_until=now()+interval '15 minutes',attempts=attempts+1,error=null,updated_at=now()
    where id=chosen returning *;
end $$;
revoke all on function public.claim_project_intake() from public,anon,authenticated;
grant execute on function public.claim_project_intake() to service_role;

-- One transaction: never leave a project without its default recruitment channel.
create function public.register_project_intake(p_id uuid,p_revision integer,p_actor uuid)
returns uuid language plpgsql security invoker set search_path=public as $$
declare job project_intake_jobs; d jsonb; pid uuid; gid uuid;
begin
  if not exists(select 1 from profiles where id=p_actor and is_admin) then raise exception 'admin required'; end if;
  select * into job from project_intake_jobs where id=p_id for update;
  if not found then raise exception 'not found'; end if;
  if job.project_id is not null then return job.project_id; end if;
  if job.status<>'review' or job.revision<>p_revision or job.result is null then raise exception 'stale review'; end if;
  if jsonb_array_length(job.assets) <> cardinality(job.languages)*2 then raise exception 'cards incomplete'; end if;
  d:=job.result->'project';
  select id into gid from genres where slug=d->>'genre_slug';
  insert into projects(owner_id,title,description,visibility,status,category,genre_id,region_text,
    pay_type,pay_amount,recruitment_count,recruitment_unlimited,application_deadline,
    posted_by_label,collect_applicant_fee,collect_casting_details,auto_accept_on_apply,allow_team_apply)
  values(job.created_by,d->>'title',d->>'description',(d->>'visibility')::project_visibility,'draft',
    (d->>'category')::project_category,gid,d->>'region_text',(d->>'pay_type')::pay_type,
    (d->>'pay_amount')::integer,(d->>'recruitment_count')::integer,(d->>'recruitment_unlimited')::boolean,
    (d->>'application_deadline')::timestamptz,'deetz',(d->>'collect_applicant_fee')::boolean,
    (d->>'collect_casting_details')::boolean,false,false) returning id into pid;
  insert into recruitment_channels(project_id,name,channel_type,manager_label,created_by)
    values(pid,'기본 모집','general','프로젝트 관리자',job.created_by);
  update project_intake_jobs set status='registered',project_id=pid,updated_at=now() where id=p_id;
  return pid;
end $$;
revoke all on function public.register_project_intake(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.register_project_intake(uuid,integer,uuid) to service_role;
