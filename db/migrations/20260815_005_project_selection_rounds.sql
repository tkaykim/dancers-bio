-- ============================================================================
-- 20260815_005 project_selection_rounds
--
-- 공고마다 선발 단계 수(1~3)를 정한다. 단계 이름은 선택 입력.
--
--   selection_rounds = 1 : 대기 → 최종 합격
--   selection_rounds = 2 : 대기 → 1차 합격 → 최종 합격
--   selection_rounds = 3 : 대기 → 1차 합격 → 2차 합격 → 최종 합격
--
-- 지원 상태는 2축으로 표현한다 (상태값 enum 은 늘리지 않는다).
--   status        = 이 지원이 살아있나 (pending / accepted) 끝났나 (rejected / withdrawn / declined)
--   passed_round  = 몇 차까지 통과했나 (0 = 미통과)
--   confirmed_at  = 최종 합격 잠금. 이게 있으면 본인 포기 불가 (20260815_004 트리거).
--
-- 최종 합격 ⇔ status='accepted' AND passed_round = projects.selection_rounds AND confirmed_at IS NOT NULL
-- ============================================================================

-- 기본값 2 = 기존 운영 방식(수락 → 확정)과 동일. 단순 공고는 1로 낮출 수 있다.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS selection_rounds smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS round_labels text[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_selection_rounds_range'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_selection_rounds_range
      CHECK (selection_rounds BETWEEN 1 AND 3);
  END IF;
END $$;

COMMENT ON COLUMN public.projects.selection_rounds IS
  '선발 단계 수(1~3). 마지막 단계가 최종 합격이다.';
COMMENT ON COLUMN public.projects.round_labels IS
  '각 단계 표시 이름(예: {"서류 합격","오디션 합격","최종 합격"}). NULL 이면 "N차 합격/최종 합격" 기본값.';

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS passed_round smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.applications.passed_round IS
  '통과한 선발 단계 번호. 0=미통과(대기/탈락). status=accepted 이면 1 이상.';

-- 기존 데이터 정합: 신규 컬럼을 채우는 것뿐이고 기존 컬럼 값은 건드리지 않는다.
--   수락(미확정) → 1차 합격 통과
--   수락 + 확정  → 2차(=최종) 합격 통과
UPDATE public.projects SET selection_rounds = 2 WHERE selection_rounds = 1;

UPDATE public.applications
   SET passed_round = 1
 WHERE status = 'accepted'
   AND passed_round = 0;

UPDATE public.applications
   SET passed_round = 2
 WHERE status = 'accepted'
   AND confirmed_at IS NOT NULL
   AND passed_round < 2;

CREATE INDEX IF NOT EXISTS applications_project_passed_round_idx
  ON public.applications (project_id, passed_round)
  WHERE archived_at IS NULL;
