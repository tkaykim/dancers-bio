-- 20260531_001 dancer_pending_proposal_count
-- 공개 /d/[slug] 페이지에서 service role 없이 미claim 댄서의 대기 중 direct_proposal 수를
-- 조회하기 위한 SECURITY DEFINER 함수. 카운트만 반환(민감정보 노출 없음).
-- Phase 1: 미claim 댄서에게 도착한 캐스팅 제안을 claim 후크로 노출하기 위함.

create or replace function public.dancer_pending_proposal_count(d_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from public.applications a
  where a.dancer_id = d_id
    and a.source = 'direct_proposal'
    and a.status = 'pending'
    and a.archived_at is null;
$$;

revoke all on function public.dancer_pending_proposal_count(uuid) from public;
grant execute on function public.dancer_pending_proposal_count(uuid) to anon, authenticated;
