create table public.portfolio_import_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  kind text not null check (kind in ('text','pdf')),
  source_text text,
  storage_path text,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  reviewed_at timestamptz,
  unique(profile_id, request_id),
  check ((kind='text' and source_text is not null and length(source_text) between 1 and 50000 and storage_path is null)
    or (kind='pdf' and source_text is null and storage_path is not null and storage_path like profile_id::text || '/%'
      and storage_path ~ ('^' || profile_id::text || '/portfolio_[A-Za-z0-9_-]+[.]pdf$') and length(storage_path)<=256))
);
create index portfolio_import_jobs_queue on public.portfolio_import_jobs(created_at) where status='queued';
create index portfolio_import_jobs_owner on public.portfolio_import_jobs(profile_id,created_at desc);
alter table public.portfolio_import_jobs enable row level security;
revoke all on public.portfolio_import_jobs from anon, authenticated;
grant select on public.portfolio_import_jobs to authenticated;
grant all on public.portfolio_import_jobs to service_role;
create policy portfolio_import_owner_read on public.portfolio_import_jobs for select to authenticated
  using (profile_id=(select auth.uid()));

-- Enqueue and limits are atomic. The caller authenticates before this service-only RPC.
create function public.enqueue_portfolio_import(p_profile uuid, p_request uuid, p_kind text, p_text text, p_path text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare found_id uuid; new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 47));
  select id into found_id from portfolio_import_jobs where profile_id=p_profile and request_id=p_request;
  if found_id is not null then return found_id; end if;
  if exists(select 1 from portfolio_import_jobs where profile_id=p_profile and created_at>now()-interval '1 minute')
     or (select count(*) from portfolio_import_jobs where profile_id=p_profile and created_at>now()-interval '24 hours')>=5 then
    raise exception 'IMPORT_RATE_LIMIT';
  end if;
  insert into portfolio_import_jobs(profile_id,request_id,kind,source_text,storage_path)
    values(p_profile,p_request,p_kind,p_text,p_path) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.enqueue_portfolio_import(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_portfolio_import(uuid,uuid,text,text,text) to service_role;

create function public.claim_portfolio_import() returns setof public.portfolio_import_jobs
language plpgsql security invoker set search_path=public as $$
begin
  update portfolio_import_jobs set status='failed',error='PROCESSING_TIMEOUT',finished_at=now()
    where status='processing' and started_at<now()-interval '10 minutes';
  return query update portfolio_import_jobs set status='processing',started_at=now()
    where id=(select id from portfolio_import_jobs where status='queued' order by created_at for update skip locked limit 1)
    returning *;
end $$;
revoke all on function public.claim_portfolio_import() from public,anon,authenticated;
grant execute on function public.claim_portfolio_import() to service_role;

alter table public.careers add column import_key uuid;
create unique index careers_import_key on public.careers(dancer_id,import_key);
