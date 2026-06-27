-- 공고가 지원 시 댄서에게 단가(견적)를 받는지 여부. 프로젝트 생성 시 토글.
-- 기본 false → 기존 공고는 단가를 받지 않던 상태 그대로 유지(backward compatible). 신규 공고에서만 켜서 사용.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS collect_applicant_fee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projects.collect_applicant_fee IS '지원 시 댄서에게 단가(견적) 제출을 받는 공고 여부. 기본 false(기존 공고 미적용). 신규 공고에서만 켜서 사용.';
