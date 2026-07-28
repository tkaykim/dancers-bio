-- 비자/프로그램 지원자가 케이스 포털에서 "지금은 진행하지 않겠다"를 직접 남길 수 있게 한다.
-- 사유는 5지선다(other_agency|price|schedule|not_ready|other) + 기타 직접입력.
-- 진행 재개 시 declined_at/decline_reason/decline_reason_detail을 다시 NULL로 되돌린다.

alter table public.dancer_visa_applications
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists decline_reason_detail text;

create index if not exists dancer_visa_applications_declined_at_idx
  on public.dancer_visa_applications (declined_at desc)
  where declined_at is not null;
