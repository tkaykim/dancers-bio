-- ============================================================================
-- 20260511_006 storage_allow_team_profile_photos
-- profile-photos 버킷의 RLS에 team_id 경로 허용 추가
-- 이전 정책은 (1) auth.uid() 또는 (2) dancer.id (소유자) 만 허용 → 팀 로고 업로드 실패
-- ============================================================================

DROP POLICY IF EXISTS "profile-photos owner write" ON storage.objects;
CREATE POLICY "profile-photos owner write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.dancers d
        WHERE d.id::text = (storage.foldername(name))[1]
          AND d.profile_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.lead_profile_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "profile-photos owner update" ON storage.objects;
CREATE POLICY "profile-photos owner update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.dancers d
        WHERE d.id::text = (storage.foldername(objects.name))[1]
          AND d.profile_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id::text = (storage.foldername(objects.name))[1]
          AND t.lead_profile_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "profile-photos owner delete" ON storage.objects;
CREATE POLICY "profile-photos owner delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-photos'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] = (auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.dancers d
        WHERE d.id::text = (storage.foldername(objects.name))[1]
          AND d.profile_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.teams t
        WHERE t.id::text = (storage.foldername(objects.name))[1]
          AND t.lead_profile_id = auth.uid()
      )
    )
  );
