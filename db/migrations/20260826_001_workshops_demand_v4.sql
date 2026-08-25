-- Workshops 수요 층 v4 — 공개 수위 구간화 + 검색 RPC + 어뷰즈 방어 + 알림 루프 기록.
-- 기획 정본: artifact e13b4967 (수요조사 설계 구체화, 2026-08-25 대표 승인·자체결정 D1~D4).
--
-- 1) workshop_artists: 운영메일 스로틀·핸들 검증 상태·모집 안내 발송 기록
-- 2) workshop_demands: 제출 IP(레이트리밋)·정규화 이메일(중복 우회 차단)
-- 3) workshop_public_counts: 수요 정확 수 → 구간(band)으로 교체 (anon RPC 누수 차단)
-- 4) search_workshop_artists: 검색 우선 제출 플로우용 공개 검색 (최소 필드·상한 20)

-- ── 1) artists 운영 컬럼 ────────────────────────────────────────────────────
alter table public.workshop_artists
  add column if not exists ops_notified_at timestamptz,
  add column if not exists handle_check_status text not null default 'unknown',
  add column if not exists handle_checked_at timestamptz,
  add column if not exists demand_notified_at timestamptz;

alter table public.workshop_artists
  drop constraint if exists workshop_artists_handle_check_status_chk;
alter table public.workshop_artists
  add constraint workshop_artists_handle_check_status_chk
  check (handle_check_status in ('unknown', 'ok', 'not_found'));

-- ── 2) demands 어뷰즈 방어 컬럼 ─────────────────────────────────────────────
alter table public.workshop_demands
  add column if not exists submit_ip text,
  add column if not exists contact_email_norm text;

-- 백필: lower + plus-tag 제거, gmail 계열은 점(.)도 제거해 같은 주소의 변형을 하나로 본다.
update public.workshop_demands
set contact_email_norm =
  case
    when split_part(lower(trim(contact_email)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(trim(contact_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(trim(contact_email)), '@', 1), '+', 1)
      || '@' || split_part(lower(trim(contact_email)), '@', 2)
  end
where contact_email is not null
  and position('@' in contact_email) > 0
  and contact_email_norm is null;

-- 이메일 dedup 기준을 원문 lower → 정규화 값으로 교체.
drop index if exists public.workshop_demands_email_uniq;
create unique index if not exists workshop_demands_email_norm_uniq
  on public.workshop_demands (artist_id, contact_email_norm)
  where contact_email_norm is not null;

-- 레이트리밋 조회용 (최근 N분 동일 IP 제출 수)
create index if not exists workshop_demands_ip_recent_idx
  on public.workshop_demands (submit_ip, created_at desc)
  where submit_ip is not null;

-- ── 3) 공개 집계: 수요는 구간만 내보낸다 ────────────────────────────────────
-- 화면에서 수를 지워도 이 RPC 가 정확 수를 반환하면 anon 이 그대로 읽을 수 있다.
-- 구간 컷은 기획 정본 D1: 10 미만 / 10+ / 30+ / 50+ / 100+.
create or replace function public.workshop_demand_band(n integer)
returns text
language sql
immutable
as $$
  select case
    when n >= 100 then '100+'
    when n >= 50 then '50+'
    when n >= 30 then '30+'
    when n >= 10 then '10+'
    else 'lt10'
  end
$$;

drop function if exists public.workshop_public_counts();
create function public.workshop_public_counts()
returns table (artist_id uuid, demand_band text, reserved_count integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    a.id,
    public.workshop_demand_band(
      (select count(*)::int from public.workshop_demands d where d.artist_id = a.id)
    ),
    (select count(*)::int from public.workshop_reservations r
      where r.artist_id = a.id and r.status in ('paid', 'confirmed'))
  from public.workshop_artists a
  where a.status in ('published', 'recruiting', 'confirmed', 'completed');
$$;

grant execute on function public.workshop_public_counts() to anon, authenticated;

-- ── 4) 공개 검색 (검색 우선 제출 플로우) ────────────────────────────────────
-- suggested 는 RLS 가 anon 에 숨기지만, 이름·핸들은 이미 위시 섹션에서 공개하는 최소 정보라
-- 같은 범위(+ 카드 표시용 이미지·장르)만 DEFINER 로 내보낸다. 수요 수는 절대 싣지 않는다.
create or replace function public.search_workshop_artists(q text)
returns table (
  id uuid,
  name text,
  instagram_handle text,
  genres text[],
  country text,
  headline text,
  status text,
  slug text,
  image_url text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cleaned as (
    select
      -- ilike 패턴 문자 제거 (%, _, \)
      regexp_replace(trim(coalesce(q, '')), '[%_\\]', '', 'g') as name_q,
      -- 핸들 비교용: URL·@ 제거 후 소문자 영숫자._ 만
      regexp_replace(
        lower(regexp_replace(trim(coalesce(q, '')), '^https?://(www\.)?instagram\.com/', '', 'i')),
        '[^a-z0-9._]', '', 'g'
      ) as handle_q
  )
  select a.id, a.name, a.instagram_handle, a.genres, a.country, a.headline, a.status, a.slug, a.image_url
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
  order by
    case
      when lower(a.instagram_handle) = c.handle_q then 0
      when a.name ilike c.name_q || '%' then 1
      when a.instagram_handle ilike c.handle_q || '%' then 2
      else 3
    end,
    case a.status
      when 'recruiting' then 0
      when 'published' then 1
      when 'confirmed' then 2
      when 'completed' then 3
      else 4
    end,
    a.name
  limit 20
$$;

revoke all on function public.search_workshop_artists(text) from public;
grant execute on function public.search_workshop_artists(text) to anon, authenticated;
