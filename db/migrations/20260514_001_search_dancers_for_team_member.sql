-- ============================================================================
-- 20260514_001 search_dancers_for_team_member
-- 팀 멤버 추가 UI 에서 댄서를 이름/한글명으로 검색하기 위한 RPC.
-- security invoker: 호출자의 dancers/team_members SELECT 정책으로 평가됨.
-- approval_status='approved' + is_active=true + 이미 팀에 등록된 dancer 제외.
-- ============================================================================

create or replace function public.search_dancers_for_team_member(
  p_team_id uuid,
  p_term    text,
  p_limit   int default 10
) returns table (
  id uuid,
  stage_name text,
  korean_name text,
  slug text,
  profile_img text
) language sql stable security invoker set search_path = public as $$
  select d.id, d.stage_name, d.korean_name, d.slug, d.profile_img
  from public.dancers d
  where d.approval_status = 'approved'
    and d.is_active = true
    and (
      d.stage_name ilike '%' || p_term || '%'
      or d.korean_name ilike '%' || p_term || '%'
    )
    and not exists (
      select 1 from public.team_members tm
      where tm.team_id = p_team_id and tm.dancer_id = d.id
    )
  order by
    (d.stage_name ilike p_term || '%') desc,  -- prefix match 우선
    d.display_order desc nulls last,
    d.stage_name asc
  limit greatest(1, least(coalesce(p_limit, 10), 25));
$$;

grant execute on function public.search_dancers_for_team_member(uuid, text, int)
  to authenticated;
