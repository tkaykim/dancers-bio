-- ============================================================================
-- 20260511_005 multi_dancer_manager_rls
-- 1. manages_dancer() 헬퍼 함수 추가
-- 2. dancers INSERT: profile_id IS NULL 허용 (매니저 플로우)
-- 3. dancers UPDATE: dancer_managers 경유 매니저도 허용
-- 4. dancer_managers: admin 전체 + 사용자 자가 삽입/삭제 분리
-- ============================================================================

-- ── manages_dancer() 헬퍼 ───────────────────────────────────────────────────
-- owns_dancer(), leads_team()과 동일 패턴의 SECURITY DEFINER 헬퍼
CREATE OR REPLACE FUNCTION public.manages_dancer(d_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dancer_managers dm
    WHERE dm.dancer_id = d_id AND dm.manager_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.manages_dancer(uuid) TO authenticated, anon;

-- ── dancers INSERT ──────────────────────────────────────────────────────────
-- 기존: (profile_id = auth.uid()) OR is_admin()
-- 변경: profile_id IS NULL 도 허용 → 매니저가 미소유 댄서 프로필 생성 가능
DROP POLICY IF EXISTS dancers_insert_self ON public.dancers;
CREATE POLICY dancers_insert_self ON public.dancers
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (auth.uid() IS NOT NULL AND profile_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND profile_id IS NULL)
  );

-- ── dancers UPDATE ──────────────────────────────────────────────────────────
-- 기존: (profile_id = auth.uid()) OR is_admin()
-- 변경: dancer_managers 에 등록된 매니저도 업데이트 허용
DROP POLICY IF EXISTS dancers_update_self ON public.dancers;
CREATE POLICY dancers_update_self ON public.dancers
  FOR UPDATE
  USING (
    public.is_admin()
    OR profile_id = auth.uid()
    OR public.manages_dancer(id)
  )
  WITH CHECK (
    public.is_admin()
    OR profile_id = auth.uid()
    OR public.manages_dancer(id)
  );

-- ── dancer_managers 쓰기 정책 분리 ─────────────────────────────────────────
-- 기존: dancer_managers_write_admin (ALL, 관리자만)
-- 변경: admin 전체 + 사용자 자가 삽입(조건부) + 자가 삭제

DROP POLICY IF EXISTS dancer_managers_write_admin ON public.dancer_managers;

-- 관리자 전체 권한 유지
CREATE POLICY dancer_managers_admin ON public.dancer_managers
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 사용자 자가 삽입: manager_id = 본인, 대상 dancer의 profile_id IS NULL 일 때만
-- (소유자가 있는 댄서에 임의로 매니저 등록하는 것 방지)
CREATE POLICY dancer_managers_self_insert ON public.dancer_managers
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND manager_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.dancers d
      WHERE d.id = dancer_managers.dancer_id
        AND d.profile_id IS NULL
    )
  );

-- 사용자 자기 매니저 행 삭제 허용
CREATE POLICY dancer_managers_self_delete ON public.dancer_managers
  FOR DELETE USING (
    auth.uid() IS NOT NULL AND manager_id = auth.uid()
  );
