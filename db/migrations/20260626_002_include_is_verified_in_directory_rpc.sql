drop function if exists public.list_directory_dancers(integer, integer, text);

create or replace function public.list_directory_dancers(
  _limit integer,
  _offset integer,
  _q text default ''
)
returns table (
  id uuid,
  stage_name text,
  korean_name text,
  slug text,
  profile_img text,
  location text,
  genres text[],
  specialties text[],
  profile_id uuid,
  is_verified boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select d.id, d.stage_name, d.korean_name, d.slug, d.profile_img, d.location,
         d.genres, d.specialties, d.profile_id, d.is_verified
  from public.dancers d
  left join public.dancer_scores s on s.dancer_id = d.id
  where d.approval_status = 'approved'
    and d.is_active = true
    and (
      coalesce(_q, '') = ''
      or d.stage_name ilike '%' || _q || '%'
      or d.korean_name ilike '%' || _q || '%'
    )
  order by coalesce(s.score, 0) desc, d.created_at desc
  limit greatest(_limit, 0) offset greatest(_offset, 0);
$$;

grant execute on function public.list_directory_dancers(integer, integer, text) to anon, authenticated;
