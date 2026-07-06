-- 유입 소스 구분: 'visa'(E-6-1 단독 랜딩) vs 'program'(deetz×GRIGO 통합 프로그램 랜딩 /program)
alter table public.dancer_visa_applications
  add column if not exists source text not null default 'visa';
