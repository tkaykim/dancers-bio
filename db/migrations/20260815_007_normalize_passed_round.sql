-- ============================================================================
-- 20260815_007 normalize_passed_round
--
-- passed_round 를 status 와 항상 정합시킨다. 애플리케이션 코드에 의존하지 않는다.
--
-- 필요한 이유:
--  1) 배포 시차 — DB 컬럼은 먼저 들어가고 코드는 나중에 나간다. 그 사이 구버전
--     코드가 처리한 합격은 passed_round=0 으로 남는다(실제로 1건 발생).
--  2) 지원자 본인이 수행하는 전이 — 받은 제안 수락(proposals.ts)은 지원자 세션이
--     실행하는데, 20260815_004 가드가 본인의 passed_round 변경을 막는다.
--     따라서 코드에서 채울 수 없고 DB가 채워야 한다.
--  3) 누락된 경로 방어 — ops 스크립트·수동 SQL 등 앞으로 추가될 경로 포함.
--
-- ⚠ 트리거 실행 순서는 "트리거 이름" 알파벳순이다. 가드 트리거의 실제 이름이
-- `trg_enforce_application_applicant_transition` 이므로, 보정 트리거도 반드시
-- `trg_` 접두사를 붙여 `trg_enforce_...` < `trg_normalize_...` 순서를 만들어야 한다.
-- 접두사 없이 `normalize_...` 로 만들면 보정이 먼저 돌아 passed_round 를 바꾸고,
-- 그 뒤 가드가 "지원자가 선발 단계를 바꿨다"고 판단해 받은 제안 수락이 전부 막힌다.
-- (실제로 이 순서 버그를 회귀 점검에서 재현했다.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_application_passed_round()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    -- 합격인데 통과 단계가 비어 있으면 최소 1차는 통과한 것으로 본다.
    IF COALESCE(NEW.passed_round, 0) < 1 THEN
      NEW.passed_round := 1;
    END IF;
  ELSE
    -- 합격이 아닌 상태는 통과 단계를 들고 있지 않는다.
    NEW.passed_round := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_application_passed_round ON public.applications;
DROP TRIGGER IF EXISTS trg_normalize_application_passed_round ON public.applications;

CREATE TRIGGER trg_normalize_application_passed_round
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_application_passed_round();

COMMENT ON FUNCTION public.normalize_application_passed_round() IS
  'passed_round 를 status 와 정합시킨다. accepted 면 최소 1, 그 외는 0.';

-- 배포 시차 동안 생긴 잔여 행 보정.
UPDATE public.applications
   SET passed_round = 1
 WHERE status = 'accepted'
   AND passed_round = 0;
