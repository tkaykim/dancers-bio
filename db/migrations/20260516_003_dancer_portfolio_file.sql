-- Lite: 댄서가 본인 포트폴리오 파일(PDF/JPG/PNG/MP4) 1개 첨부 가능.
-- 공개 dancer 프로필에서 누구나 다운로드 가능.
-- 기존 portfolio-media 버킷(public) 재사용 — RLS는 이미 dancer.profile_id = auth.uid() 기준.

ALTER TABLE dancers
  ADD COLUMN IF NOT EXISTS portfolio_file_url text,
  ADD COLUMN IF NOT EXISTS portfolio_file_name text,
  ADD COLUMN IF NOT EXISTS portfolio_file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS portfolio_file_mime text,
  ADD COLUMN IF NOT EXISTS portfolio_file_uploaded_at timestamptz;

COMMENT ON COLUMN dancers.portfolio_file_url IS
  'Lite: 본인 첨부 포트폴리오 1개의 public Supabase Storage URL. 댄서 공개 프로필에서 다운로드 가능.';

-- portfolio-media 버킷 제약 보강 (50MB + MIME whitelist)
UPDATE storage.buckets
SET
  file_size_limit = 52428800, -- 50 MB
  allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'video/mp4'
  ]
WHERE id = 'portfolio-media';
