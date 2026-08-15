-- ============================================================================
-- 20260815_008 passed_round_range_check
--
-- passed_round 로컬 범위 제약. 공고별 selection_rounds 와의 교차 제약은 CHECK 로
-- 걸 수 없지만(다른 테이블 참조 불가), 절대 범위는 DB에서 막을 수 있다.
-- 상한은 MAX_SELECTION_ROUNDS(3)와 같다 — 단계 수 상한을 올리면 여기도 같이 올린다.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_passed_round_range'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_passed_round_range
      CHECK (passed_round BETWEEN 0 AND 3);
  END IF;
END $$;
