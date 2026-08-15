-- ============================================================================
-- 20260815_006 stage_guard_passed_round
--
-- 20260815_004 의 자기 전이 가드에 passed_round 를 추가한다.
-- 단계 진급은 운영자만 할 수 있어야 한다 — 지원자가 스스로 다음 라운드로
-- 올라가면 "1차 합격" 표시가 조작된다.
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
     AND NEW.passed_round IS NOT DISTINCT FROM OLD.passed_round
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
    RAISE EXCEPTION '최종 합격 여부는 본인이 변경할 수 없습니다.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.passed_round IS DISTINCT FROM OLD.passed_round THEN
    RAISE EXCEPTION '선발 단계는 본인이 변경할 수 없습니다.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION '지원 결과 정보는 본인이 변경할 수 없습니다.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- 최종 합격(확정)된 지원은 본인이 어떤 상태로도 바꿀 수 없다.
    IF OLD.confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION '최종 합격한 지원은 본인이 취소할 수 없습니다. 운영팀에 문의해 주세요.'
        USING ERRCODE = '42501';
    END IF;

    -- 허용 전이 화이트리스트
    --   pending  → withdrawn            : 검토 중 지원 취소
    --   pending  → accepted | declined  : 받은 제안 응답 — direct_proposal 에서만
    --   accepted → declined             : 중간 단계 합격 후 본인 포기 (최종 합격 전까지 언제든)
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
