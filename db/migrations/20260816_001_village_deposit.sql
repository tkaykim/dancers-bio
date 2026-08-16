-- Village 사전예약금(크라우드펀딩형) 추적.
-- 결제 정본은 grigoent training_orders 이고 여기 값은 사본이다 — 비자 케이스와 같은 방식.
-- 결제 콜백은 ref 토큰의 id 로 대상 테이블을 구분한다:
--   id 가 dancer_visa_applications 에 있으면 비자/오디션 결제,
--   village_waitlist 에 있으면 Village 사전예약금.
alter table public.village_waitlist
  add column if not exists deposit_status text not null default 'none',
  add column if not exists deposit_link_sent_at timestamptz,
  add column if not exists deposit_order_no text,
  add column if not exists deposit_provider text,
  add column if not exists deposit_amount_krw integer,
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_refunded_at timestamptz,
  add column if not exists deposit_meta jsonb not null default '{}'::jsonb,
  add column if not exists visa_application_id uuid;

alter table public.village_waitlist
  drop constraint if exists village_waitlist_deposit_status_check;

alter table public.village_waitlist
  add constraint village_waitlist_deposit_status_check
  check (deposit_status in ('none', 'link_sent', 'paid', 'refunded'));

create index if not exists village_waitlist_deposit_paid_idx
  on public.village_waitlist (deposit_paid_at desc)
  where deposit_paid_at is not null;

create index if not exists village_waitlist_visa_application_idx
  on public.village_waitlist (visa_application_id)
  where visa_application_id is not null;

create unique index if not exists village_waitlist_visa_application_uniq
  on public.village_waitlist (visa_application_id)
  where visa_application_id is not null;
