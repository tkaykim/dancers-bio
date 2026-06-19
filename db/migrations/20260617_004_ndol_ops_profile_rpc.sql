create or replace function public.ops_ndol_contacts_for_token_v2(p_token text)
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
  dancer_portfolio_file_name text
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
    d.portfolio_file_name as dancer_portfolio_file_name
  from public.ops_ndol_contacts c
  left join public.dancers d on d.id = c.dancer_id
  where
    public.is_ops_event_token_valid('ndol-20260618', p_token)
    and c.event_key = 'ndol-20260618'
  order by c.manager_key, c.group_key, c.sort_rank, c.name;
$$;

revoke all on function public.ops_ndol_contacts_for_token_v2(text) from public;
grant execute on function public.ops_ndol_contacts_for_token_v2(text) to anon, authenticated;
