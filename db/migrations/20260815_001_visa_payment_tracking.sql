-- 오디션 통과 후 참가비/프로그램 비용 결제까지를 케이스에서 추적한다.
--
-- 결제 자체는 grigoent(별도 Supabase 프로젝트 rqaycpwaumuffzammyje)의
-- training_orders / training_order_payments 가 정본이다.
-- 여기에는 "이 지원자가 결제를 했는가"만 미러링해서, 운영자가 deetz 어드민 한 곳에서
-- 지원 → 미팅 → 오디션 → 결제까지 한 줄로 볼 수 있게 한다.
--
-- 미러링 경로: grigoent 결제 승인 → POST /api/visa/payment-callback (HMAC 서명) → 아래 컬럼 갱신.

alter table public.dancer_visa_applications
  -- unpaid: 아직 결제 링크를 보내지 않음
  -- link_sent: 결제 링크 발급/발송함, 아직 미결제
  -- paid: 결제 완료
  -- refunded: 결제 후 취소·환불됨
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_link_sent_at timestamptz,
  -- grigoent 주문번호 (GRT-YYMMDD-XXXXXX). 대사(reconciliation) 기준값.
  add column if not exists payment_order_no text,
  add column if not exists payment_provider text,
  add column if not exists payment_amount_krw integer,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_refunded_at timestamptz,
  -- 콜백 원본 payload. 금액·통화·PG 응답을 그대로 남겨 분쟁 시 근거로 쓴다.
  add column if not exists payment_meta jsonb not null default '{}'::jsonb;

alter table public.dancer_visa_applications
  drop constraint if exists dancer_visa_applications_payment_status_check;

alter table public.dancer_visa_applications
  add constraint dancer_visa_applications_payment_status_check
  check (payment_status in ('unpaid', 'link_sent', 'paid', 'refunded'));

-- 결제 완료 건을 어드민에서 최신순으로 훑는 용도.
create index if not exists dancer_visa_applications_paid_at_idx
  on public.dancer_visa_applications (paid_at desc)
  where paid_at is not null;

-- 주문번호로 역조회(콜백 재처리·수기 대사).
create index if not exists dancer_visa_applications_payment_order_no_idx
  on public.dancer_visa_applications (payment_order_no)
  where payment_order_no is not null;
