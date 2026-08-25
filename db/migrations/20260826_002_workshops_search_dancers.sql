-- Workshops 검색 v2 — deetz 댄서 풀 연합 검색 (태국 역방향 수요조사: 태국 댄서 → 한국 안무가).
-- 대표 지시 2026-08-26: 방콕 행사 취소, 태국을 시작으로 수요조사 재시동. 태국은 한국 안무가를 기대.
--
-- 설계: dancers(승인·활성·인스타 보유 ~471명)를 workshop_artists 로 복사하지 않고
-- 검색 RPC 에서 union — 수요가 실제로 붙는 순간에만 카드가 만들어진다(기존 nominate upsert 재사용).
-- dancers 는 anon SELECT 0 (RLS) 이지만 이 RPC 는 DEFINER 로 공개 프로필 표시 필드만 내보낸다.

-- ── 인스타 핸들 정규화 (JS normalizeInstagramHandle 과 같은 규칙) ─────────────
create or replace function public.normalize_ig_handle(raw text)
returns text
language sql
immutable
as $$
  select lower(
    split_part(split_part(split_part(
      ltrim(regexp_replace(trim(coalesce(raw, '')), '^https?://(www\.)?instagram\.com/', '', 'i'), '@'),
    '/', 1), '?', 1), '#', 1)
  )
$$;

-- ── 검색 v2: workshop_artists + dancers 연합 ────────────────────────────────
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
      regexp_replace(trim(coalesce(q, '')), '[%_\\]', '', 'g') as name_q,
      regexp_replace(
        lower(regexp_replace(trim(coalesce(q, '')), '^https?://(www\.)?instagram\.com/', '', 'i')),
        '[^a-z0-9._]', '', 'g'
      ) as handle_q
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
      )
      -- 같은 핸들의 workshop_artists 카드가 이미 있으면 카드 쪽만 노출(수요 합산 일관성)
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
