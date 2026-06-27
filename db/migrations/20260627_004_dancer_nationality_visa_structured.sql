-- 댄서 국적·비자 구조화: 회원가입/프로필에서 국가 선택(드롭다운+검색) + 한국 비자(검색+드롭다운+기타) + 만료일 수집.
-- nationality(라벨, 표시용)·is_korean_national·has_visa·visa_details 는 이미 존재. 아래는 구조화 컬럼 추가.

ALTER TABLE public.dancer_private_info
  ADD COLUMN IF NOT EXISTS nationality_code text,
  ADD COLUMN IF NOT EXISTS visa_type text,
  ADD COLUMN IF NOT EXISTS visa_type_other text,
  ADD COLUMN IF NOT EXISTS visa_expiry date;

COMMENT ON COLUMN public.dancer_private_info.nationality_code IS 'ISO 3166-1 alpha-2 국가코드 (예: KR, JP). nationality=표시용 라벨, is_korean_national=KR 여부';
COMMENT ON COLUMN public.dancer_private_info.visa_type IS '한국 체류자격 코드 (예: E-6-1). OTHER=기타 직접입력(visa_type_other에 자유입력)';
COMMENT ON COLUMN public.dancer_private_info.visa_type_other IS 'visa_type=OTHER일 때 자유입력 비자명';
COMMENT ON COLUMN public.dancer_private_info.visa_expiry IS '비자 만료일';

-- 안전 백필: 한국 국적 플래그가 명확한 기존 행만 KR 코드 부여 (additive)
UPDATE public.dancer_private_info
  SET nationality_code = 'KR'
  WHERE is_korean_national IS TRUE AND nationality_code IS NULL;
