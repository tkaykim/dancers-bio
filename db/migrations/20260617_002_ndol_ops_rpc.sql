create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.ops_event_tokens (
  event_key text primary key,
  token_hash text not null,
  token_hint text,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);

alter table public.ops_event_tokens enable row level security;
revoke all on table public.ops_event_tokens from anon, authenticated;

create or replace function public.is_ops_event_token_valid(
  p_event_key text,
  p_token text
)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.ops_event_tokens t
    where t.event_key = p_event_key
      and t.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
  );
$$;

revoke all on function public.is_ops_event_token_valid(text, text) from public;
grant execute on function public.is_ops_event_token_valid(text, text) to anon, authenticated;

create or replace function public.ops_ndol_contacts_for_token(p_token text)
returns table (
  id uuid,
  event_key text,
  source_key text,
  dancer_id uuid,
  project_id uuid,
  project_code text,
  project_href text,
  group_key text,
  manager_key text,
  manager_name text,
  name text,
  gender text,
  app_status text,
  availability_status text,
  outreach_status text,
  phone text,
  instagram text,
  email text,
  note text,
  sort_rank integer,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.event_key,
    c.source_key,
    c.dancer_id,
    c.project_id,
    c.project_code,
    c.project_href,
    c.group_key,
    c.manager_key,
    c.manager_name,
    c.name,
    c.gender,
    c.app_status,
    c.availability_status,
    c.outreach_status,
    c.phone,
    c.instagram,
    c.email,
    c.note,
    c.sort_rank,
    c.updated_at
  from public.ops_ndol_contacts c
  where
    public.is_ops_event_token_valid('ndol-20260618', p_token)
    and c.event_key = 'ndol-20260618'
  order by c.manager_key, c.group_key, c.sort_rank, c.name;
$$;

create or replace function public.update_ops_ndol_contact(
  p_token text,
  p_id uuid,
  p_outreach_status text,
  p_note text default null
)
returns table (
  id uuid,
  outreach_status text,
  note text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_ops_event_token_valid('ndol-20260618', p_token) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if p_outreach_status not in ('pending', 'no_answer', 'unavailable', 'available') then
    raise exception 'invalid outreach status' using errcode = '22023';
  end if;

  return query
  update public.ops_ndol_contacts c
  set
    outreach_status = p_outreach_status,
    note = left(coalesce(p_note, c.note, ''), 1000),
    updated_at = now()
  where
    c.id = p_id
    and c.event_key = 'ndol-20260618'
  returning c.id, c.outreach_status, c.note, c.updated_at;
end;
$$;

revoke all on function public.ops_ndol_contacts_for_token(text) from public;
revoke all on function public.update_ops_ndol_contact(text, uuid, text, text) from public;

grant execute on function public.ops_ndol_contacts_for_token(text) to anon, authenticated;
grant execute on function public.update_ops_ndol_contact(text, uuid, text, text) to anon, authenticated;
