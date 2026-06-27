-- 장르 정규화 공용 헬퍼 + 매칭 RPC 2개 장르매칭 수정.
-- 배경: 댄서 genres 는 영문/혼합("Hip Hop"/"hiphop"/"kpop"…), 프로젝트 장르는 genres(label_ko/en/slug).
--       라벨 직매칭이 안 돼 콘솔 추천(match_dancers_for_project)의 genre_match 가 항상 false 였음.
-- 새 테이블/컬럼 없음. 작은 IMMUTABLE 헬퍼 1개로 양 RPC 의 중복 정규화 로직 통합.

CREATE OR REPLACE FUNCTION public.genre_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT lower(regexp_replace(coalesce(t,''), '[^a-zA-Z0-9가-힣]', '', 'g')); $$;

-- 콘솔 추천 RPC — 장르매칭만 정규화 기반으로 수정. 시그니처·owner게이트·지역매칭·정렬·제외조건 동일.
CREATE OR REPLACE FUNCTION public.match_dancers_for_project(p_id uuid, _limit integer DEFAULT 20)
 RETURNS TABLE(dancer_id uuid, stage_name text, slug text, profile_img text, genres text[], location text, profile_id uuid, genre_match boolean, location_match boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_tokens text[];
  v_region_text text;
begin
  if not (public.is_admin() or public.owns_project(p_id)) then
    return;
  end if;

  select
    array(select distinct public.genre_norm(x) from unnest(array[g.label_ko, g.label_en, g.slug]) x where x is not null and length(x) > 0),
    coalesce(p.region_text, r.label_ko)
    into v_tokens, v_region_text
  from public.projects p
  left join public.genres g on g.id = p.genre_id
  left join public.regions r on r.id = p.region_id
  where p.id = p_id;

  return query
  select
    d.id, d.stage_name, d.slug, d.profile_img, d.genres, d.location, d.profile_id,
    (array_length(v_tokens,1) is not null and d.genres is not null
      and exists (select 1 from unnest(d.genres) dg where public.genre_norm(dg) = any(v_tokens))) as genre_match,
    (v_region_text is not null and d.location is not null and d.location ilike '%'||v_region_text||'%') as location_match
  from public.dancers d
  left join public.dancer_scores s on s.dancer_id = d.id
  where d.approval_status = 'approved'
    and coalesce(d.is_active, true) = true
    and not exists (
      select 1 from public.applications a
      where a.project_id = p_id and a.dancer_id = d.id
        and a.status in ('pending','accepted') and a.archived_at is null
    )
    and not exists (
      select 1 from public.projects p
      where p.id = p_id and (p.owner_dancer_id = d.id or d.profile_id = p.owner_id)
    )
  order by
    (case when array_length(v_tokens,1) is not null and d.genres is not null
       and exists (select 1 from unnest(d.genres) dg where public.genre_norm(dg) = any(v_tokens)) then 50 else 0 end)
    + (case when v_region_text is not null and d.location is not null and d.location ilike '%'||v_region_text||'%' then 20 else 0 end)
    + coalesce(s.score, 0) desc,
    d.created_at desc
  limit greatest(1, least(coalesce(_limit, 20), 100));
end;
$function$;

-- 발송용 RPC도 동일 헬퍼로 통합.
CREATE OR REPLACE FUNCTION public.dancers_to_notify_for_project(p_id uuid)
RETURNS TABLE(profile_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_tokens text[];
BEGIN
  SELECT array(select distinct public.genre_norm(x) from unnest(array[g.label_ko, g.label_en, g.slug]) x where x is not null and length(x) > 0)
  INTO v_tokens
  FROM public.projects p JOIN public.genres g ON g.id = p.genre_id
  WHERE p.id = p_id;

  IF v_tokens IS NULL OR array_length(v_tokens, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT d.profile_id
  FROM public.dancers d
  WHERE d.profile_id IS NOT NULL
    AND d.approval_status = 'approved'
    AND coalesce(d.is_active, true) = true
    AND d.genres IS NOT NULL
    AND EXISTS (SELECT 1 FROM unnest(d.genres) dg WHERE public.genre_norm(dg) = ANY(v_tokens))
    AND NOT EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.project_id = p_id AND a.dancer_id = d.id
        AND a.status IN ('pending','accepted') AND a.archived_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_id AND (p.owner_dancer_id = d.id OR d.profile_id = p.owner_id)
    )
  LIMIT 1000;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dancers_to_notify_for_project(uuid) FROM anon, authenticated;
