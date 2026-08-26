-- 검색 v3: 장르 매칭 추가 (추천 칩 "Heels/Breaking/K-Pop" 검색 지원). 운영 적용 완료 (2026-08-26).
-- 장르 표기가 비일관(K-Pop/kpop/Hip Hop/hiphop)이라 영숫자만 남긴 compact 비교로 매치한다.
drop function if exists public.search_workshop_artists(text);
create function public.search_workshop_artists(q text)
returns table (
  id uuid,
  name text,
  instagram_handle text,
  genres text[],
  country text,
  headline text,
  status text,
  slug text,
  image_url text,
  source text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cleaned as (
    select
      regexp_replace(trim(coalesce(q, '')), '[%_\]', '', 'g') as name_q,
      regexp_replace(
        lower(regexp_replace(trim(coalesce(q, '')), '^https?://(www\.)?instagram\.com/', '', 'i')),
        '[^a-z0-9._]', '', 'g'
      ) as handle_q,
      regexp_replace(lower(trim(coalesce(q, ''))), '[^a-z0-9]', '', 'g') as genre_q
  ),
  artist_hits as (
    select
      a.id, a.name, a.instagram_handle, a.genres, a.country, a.headline, a.status, a.slug, a.image_url,
      'artist'::text as source,
      case
        when lower(a.instagram_handle) = c.handle_q then 0
        when a.name ilike c.name_q || '%' then 1
        when a.instagram_handle ilike c.handle_q || '%' then 2
        else 3
      end as rank,
      case a.status
        when 'recruiting' then 0 when 'published' then 1 when 'confirmed' then 2 when 'completed' then 3 else 4
      end as status_rank
    from public.workshop_artists a, cleaned c
    where a.status in ('suggested', 'published', 'recruiting', 'confirmed', 'completed')
      and char_length(c.name_q) >= 1
      and (
        a.name ilike '%' || c.name_q || '%'
        or (
          char_length(c.handle_q) >= 1
          and replace(replace(a.instagram_handle, '.', ''), '_', '')
              ilike '%' || replace(replace(c.handle_q, '.', ''), '_', '') || '%'
        )
        or (
          char_length(c.genre_q) >= 2
          and exists (
            select 1 from unnest(coalesce(a.genres, '{}')) g
            where regexp_replace(lower(g), '[^a-z0-9]', '', 'g') like '%' || c.genre_q || '%'
          )
        )
      )
  ),
  dancer_hits as (
    select
      d.id,
      d.stage_name as name,
      public.normalize_ig_handle(d.social_links->>'instagram') as instagram_handle,
      d.genres,
      '대한민국'::text as country,
      d.korean_name as headline,
      'dancer'::text as status,
      d.slug,
      d.profile_img as image_url,
      'dancer'::text as source,
      case
        when public.normalize_ig_handle(d.social_links->>'instagram') = c.handle_q then 0
        when d.stage_name ilike c.name_q || '%' or d.korean_name ilike c.name_q || '%' then 1
        else 3
      end as rank,
      5 as status_rank
    from public.dancers d, cleaned c
    where d.approval_status = 'approved'
      and d.is_active
      and char_length(c.name_q) >= 1
      and coalesce(trim(d.social_links->>'instagram'), '') <> ''
      and char_length(public.normalize_ig_handle(d.social_links->>'instagram')) >= 2
      and (
        d.stage_name ilike '%' || c.name_q || '%'
        or d.korean_name ilike '%' || c.name_q || '%'
        or (
          char_length(c.handle_q) >= 1
          and replace(replace(public.normalize_ig_handle(d.social_links->>'instagram'), '.', ''), '_', '')
              ilike '%' || replace(replace(c.handle_q, '.', ''), '_', '') || '%'
        )
        or (
          char_length(c.genre_q) >= 2
          and exists (
            select 1 from unnest(coalesce(d.genres, '{}')) g
            where regexp_replace(lower(g), '[^a-z0-9]', '', 'g') like '%' || c.genre_q || '%'
          )
        )
      )
      and not exists (
        select 1 from public.workshop_artists a2
        where a2.status <> 'archived'
          and lower(a2.instagram_handle) = public.normalize_ig_handle(d.social_links->>'instagram')
      )
  )
  select id, name, instagram_handle, genres, country, headline, status, slug, image_url, source
  from (
    select * from artist_hits
    union all
    select * from dancer_hits
  ) hits
  order by rank, status_rank, name
  limit 20
$$;

revoke all on function public.search_workshop_artists(text) from public;
grant execute on function public.search_workshop_artists(text) to anon, authenticated;
