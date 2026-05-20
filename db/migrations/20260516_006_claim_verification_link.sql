-- claim과 IG 인증을 연결: claim 본인확인용 IG verification은 claim_request_id를 가짐.
-- 관리자가 IG 인증 승인 시 연결된 claim도 같이 승인 + dancers.profile_id 자동 설정.

ALTER TABLE instagram_verifications
  ADD COLUMN IF NOT EXISTS claim_request_id uuid
    REFERENCES dancer_claim_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS instagram_verifications_claim_request_idx
  ON instagram_verifications(claim_request_id)
  WHERE claim_request_id IS NOT NULL;

COMMENT ON COLUMN instagram_verifications.claim_request_id IS
  'Lite: claim 본인확인용일 때 연결된 dancer_claim_requests 행. NULL이면 creator 권한 발급용.';
