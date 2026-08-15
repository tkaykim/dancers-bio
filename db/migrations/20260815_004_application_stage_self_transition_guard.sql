-- ============================================================================
-- 20260815_004 application_stage_self_transition_guard
--
-- 지원 단계 모델을 DB 레벨에서 강제한다.
--
--   검토 중      status='pending'
--   1차 합격     status='accepted' AND confirmed_at IS NULL   → 본인 포기 가능(declined)
--   최종 선발    status='accepted' AND confirmed_at IS NOT NULL → 본인 포기 불가
--   불합격       status='rejected'
--
-- 배경: applications_update RLS 는 `can_act_as_dancer(dancer_id)` 를 통과시키면서
-- 컬럼·값 제한이 없다. 즉 지원자가 anon 키로 본인 행의 status 를 'accepted' 로
-- 바꾸거나 confirmed_at 을 지울 수 있었다. 서버 액션에만 의존하면 막히지 않는다.
-- 이 트리거가 "본인이 할 수 있는 상태 변경"을 화이트리스트로 못 박는다.
--
-- 운영자(admin / 프로젝트 관리자 / 결정권 있는 채널 담당자)와 service_role 은
-- 영향을 받지 않는다.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_application_applicant_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- service_role / 서버 배치(세션 사용자 없음)는 통과.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- 통제 대상 컬럼이 하나도 안 바뀌었으면 권한 조회 없이 통과 (핫패스).
  IF NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.confirmed_at IS NOT DISTINCT FROM OLD.confirmed_at
     AND NEW.confirmed_by IS NOT DISTINCT FROM OLD.confirmed_by
     AND NEW.rejection_reason IS NOT DISTINCT FROM OLD.rejection_reason THEN
    RETURN NEW;
  END IF;

  -- 운영자는 자유롭게 변경 가능.
  IF public.is_admin()
     OR public.can_manage_project(NEW.project_id)
     OR (NEW.recruitment_channel_id IS NOT NULL
         AND public.can_decide_recruitment_channel_applications(NEW.recruitment_channel_id)) THEN
    RETURN NEW;
  END IF;

  -- ---------------------------------------------------------------- 지원자 본인
  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
     OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by THEN
    RAISE EXCEPTION '최종 선발 여부는 본인이 변경할 수 없습니다.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION '지원 결과 정보는 본인이 변경할 수 없습니다.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 최종 선발(확정)된 지원은 본인이 어떤 상태로도 바꿀 수 없다.
    IF OLD.confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION '최종 선발된 지원은 본인이 취소할 수 없습니다. 운영팀에 문의해 주세요.'
        USING ERRCODE = '42501';
    END IF;

    -- 허용 전이 화이트리스트
    --   pending  → withdrawn            : 검토 중 지원 취소
    --   pending  → accepted | declined  : 받은 제안 응답 — direct_proposal 에서만.
    --                                     apply 지원에서 열어두면 지원자가 스스로
    --                                     1차 합격으로 올릴 수 있다.
    --   accepted → declined             : 1차 합격 후 본인 포기 (확정 전에만)
    IF NOT (
      (OLD.status = 'pending' AND NEW.status = 'withdrawn')
      OR (OLD.status = 'pending'
          AND NEW.status IN ('accepted', 'declined')
          AND OLD.source = 'direct_proposal')
      OR (OLD.status = 'accepted' AND NEW.status = 'declined')
    ) THEN
      RAISE EXCEPTION '허용되지 않는 지원 상태 변경입니다.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_application_applicant_transition ON public.applications;

CREATE TRIGGER trg_enforce_application_applicant_transition
  BEFORE UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_application_applicant_transition();

COMMENT ON FUNCTION public.enforce_application_applicant_transition() IS
  '지원자 본인이 할 수 있는 applications 상태 변경을 화이트리스트로 제한한다. 최종 선발(confirmed_at) 이후에는 본인 포기 불가.';
