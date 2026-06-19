alter table public.ops_ndol_contacts
  add column if not exists bib_code text,
  add column if not exists attendance_status text not null default 'not_arrived',
  add column if not exists onsite_status text not null default 'waiting',
  add column if not exists onsite_note text not null default '',
  add column if not exists checked_in_at timestamptz,
  add column if not exists eliminated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ops_ndol_contacts_attendance_status_check'
  ) then
    alter table public.ops_ndol_contacts
      add constraint ops_ndol_contacts_attendance_status_check
      check (attendance_status in ('not_arrived', 'checked_in', 'no_show'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ops_ndol_contacts_onsite_status_check'
  ) then
    alter table public.ops_ndol_contacts
      add constraint ops_ndol_contacts_onsite_status_check
      check (onsite_status in ('waiting', 'watching', 'hold', 'eliminated', 'finalist'));
  end if;
end $$;

create unique index if not exists ops_ndol_contacts_event_bib_unique
  on public.ops_ndol_contacts (event_key, bib_code)
  where bib_code is not null;

with candidates as (
  select
    id,
    row_number() over (order by manager_key, group_key, sort_rank, name) as rn
  from public.ops_ndol_contacts
  where event_key = 'ndol-20260618'
    and outreach_status = 'available'
), assigned as (
  select
    id,
    chr(65 + ((rn - 1) / 30)::int) || '-' || lpad((((rn - 1) % 30) + 1)::text, 2, '0') as bib_code
  from candidates
)
update public.ops_ndol_contacts c
set
  bib_code = assigned.bib_code,
  attendance_status = coalesce(c.attendance_status, 'not_arrived'),
  onsite_status = coalesce(c.onsite_status, 'waiting'),
  updated_at = now()
from assigned
where c.id = assigned.id;

drop function if exists public.ops_ndol_contacts_for_token_v2(text);

create function public.ops_ndol_contacts_for_token_v2(p_token text)
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
  updated_at timestamptz,
  dancer_slug text,
  dancer_profile_img text,
  dancer_korean_name text,
  dancer_bio text,
  dancer_location text,
  dancer_genres text[],
  dancer_specialties text[],
  dancer_social_links jsonb,
  dancer_portfolio_file_url text,
  dancer_portfolio_file_name text,
  bib_code text,
  attendance_status text,
  onsite_status text,
  onsite_note text,
  checked_in_at timestamptz,
  eliminated_at timestamptz
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
    c.updated_at,
    d.slug as dancer_slug,
    d.profile_img as dancer_profile_img,
    d.korean_name as dancer_korean_name,
    d.bio as dancer_bio,
    d.location as dancer_location,
    d.genres as dancer_genres,
    d.specialties as dancer_specialties,
    d.social_links as dancer_social_links,
    d.portfolio_file_url as dancer_portfolio_file_url,
    d.portfolio_file_name as dancer_portfolio_file_name,
    c.bib_code,
    c.attendance_status,
    c.onsite_status,
    c.onsite_note,
    c.checked_in_at,
    c.eliminated_at
  from public.ops_ndol_contacts c
  left join public.dancers d on d.id = c.dancer_id
  where
    public.is_ops_event_token_valid('ndol-20260618', p_token)
    and c.event_key = 'ndol-20260618'
  order by c.manager_key, c.group_key, c.sort_rank, c.name;
$$;

create or replace function public.update_ops_ndol_onsite_contact(
  p_token text,
  p_id uuid,
  p_attendance_status text,
  p_onsite_status text,
  p_onsite_note text default null
)
returns table (
  id uuid,
  attendance_status text,
  onsite_status text,
  onsite_note text,
  checked_in_at timestamptz,
  eliminated_at timestamptz,
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

  if p_attendance_status not in ('not_arrived', 'checked_in', 'no_show') then
    raise exception 'invalid attendance status' using errcode = '22023';
  end if;

  if p_onsite_status not in ('waiting', 'watching', 'hold', 'eliminated', 'finalist') then
    raise exception 'invalid onsite status' using errcode = '22023';
  end if;

  return query
  update public.ops_ndol_contacts c
  set
    attendance_status = p_attendance_status,
    onsite_status = p_onsite_status,
    onsite_note = left(coalesce(p_onsite_note, c.onsite_note, ''), 1000),
    checked_in_at = case
      when p_attendance_status = 'checked_in' and c.checked_in_at is null then now()
      when p_attendance_status <> 'checked_in' then null
      else c.checked_in_at
    end,
    eliminated_at = case
      when p_onsite_status = 'eliminated' and c.eliminated_at is null then now()
      when p_onsite_status <> 'eliminated' then null
      else c.eliminated_at
    end,
    updated_at = now()
  where
    c.id = p_id
    and c.event_key = 'ndol-20260618'
  returning
    c.id,
    c.attendance_status,
    c.onsite_status,
    c.onsite_note,
    c.checked_in_at,
    c.eliminated_at,
    c.updated_at;
end;
$$;

revoke all on function public.ops_ndol_contacts_for_token_v2(text) from public;
revoke all on function public.update_ops_ndol_onsite_contact(text, uuid, text, text, text) from public;

grant execute on function public.ops_ndol_contacts_for_token_v2(text) to anon, authenticated;
grant execute on function public.update_ops_ndol_onsite_contact(text, uuid, text, text, text) to anon, authenticated;
