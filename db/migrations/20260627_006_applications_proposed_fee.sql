-- 지원 시 댄서가 제시하는 단가(견적). collect_applicant_fee=true 공고에서만 수집.
-- fee_status: quoted(금액제시) / negotiable(금액+협의가능) / unsure(잘모름=협의희망) / NULL(단가 안받는 공고)

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS proposed_fee integer,
  ADD COLUMN IF NOT EXISTS proposed_fee_currency text NOT NULL DEFAULT 'KRW',
  ADD COLUMN IF NOT EXISTS proposed_fee_unit text,
  ADD COLUMN IF NOT EXISTS fee_status text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_fee_status_chk') THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_fee_status_chk
      CHECK (fee_status IS NULL OR fee_status IN ('quoted','unsure','negotiable'));
  END IF;
END $$;

COMMENT ON COLUMN public.applications.proposed_fee IS '지원자가 제시한 단가(정수). fee_status=unsure면 NULL. collect_applicant_fee 공고에서만 수집.';
COMMENT ON COLUMN public.applications.proposed_fee_currency IS '단가 통화 (기본 KRW). 외국 댄서 대응 USD/JPY/EUR 등.';
COMMENT ON COLUMN public.applications.proposed_fee_unit IS '단가 단위 (회당/일당/건당/총액 등).';
COMMENT ON COLUMN public.applications.fee_status IS 'quoted=금액제시 / negotiable=금액+협의가능 / unsure=잘모름(협의희망). NULL=단가 안받는 공고.';
