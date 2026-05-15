-- ============================================================================
-- 20260515_001 projects_select_public_link_sharable
-- 대표님 의도 (2026-05-15 명시): "비공개 프로젝트는 카드리스트에 노출되지
-- 않지만, URL 을 알면 권한 없이 누구나 들어가 볼 수 있다" (sharable secret URL).
--
-- 기존 projects_select 정책은 visibility='public' 또는 본인 application 존재
-- 만 외부 SELECT 를 허용해 비공개는 사실상 invitee 외에는 404. visibility 분기를
-- 풀고 status<>'draft' AND deleted_at IS NULL 만 충족하면 SELECT 통과하도록
-- 완화한다. /feed 카드 쿼리는 코드 레벨에서 visibility='public' 필터링하므로
-- 카드 노출은 그대로(공개 카드만).
-- ============================================================================

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
  FOR SELECT USING (
    owner_id = auth.uid()
    OR public.is_admin()
    OR (owner_dancer_id IS NOT NULL AND public.can_act_as_dancer(owner_dancer_id))
    OR (owner_team_id   IS NOT NULL AND public.leads_team(owner_team_id))
    OR (status <> 'draft' AND deleted_at IS NULL)
  );
