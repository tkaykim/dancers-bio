-- ============================================================================
-- 20260511_007 careers_manager_rls
-- careers RLS에 manages_dancer() 추가
-- 이전 정책: 본인 댄서 owner / 팀 lead / admin 만 카리어 다룰 수 있었음
-- 매니저 댄서(dancer_managers 등록) 도 자기가 관리하는 댄서의 경력을 추가/수정/삭제 가능하도록 확장
-- ============================================================================

DROP POLICY IF EXISTS careers_manage ON public.careers;
CREATE POLICY careers_manage ON public.careers
  FOR ALL
  USING (
    public.is_admin()
    OR ((dancer_id IS NOT NULL) AND public.owns_dancer(dancer_id))
    OR ((dancer_id IS NOT NULL) AND public.manages_dancer(dancer_id))
    OR ((team_id IS NOT NULL) AND public.leads_team(team_id))
  )
  WITH CHECK (
    public.is_admin()
    OR ((dancer_id IS NOT NULL) AND public.owns_dancer(dancer_id))
    OR ((dancer_id IS NOT NULL) AND public.manages_dancer(dancer_id))
    OR ((team_id IS NOT NULL) AND public.leads_team(team_id))
  );

DROP POLICY IF EXISTS careers_select ON public.careers;
CREATE POLICY careers_select ON public.careers
  FOR SELECT
  USING (
    is_public = true
    OR public.is_admin()
    OR ((dancer_id IS NOT NULL) AND public.owns_dancer(dancer_id))
    OR ((dancer_id IS NOT NULL) AND public.manages_dancer(dancer_id))
    OR ((team_id IS NOT NULL) AND public.leads_team(team_id))
  );
