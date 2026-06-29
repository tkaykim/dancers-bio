-- 비자 온보딩 설문에 한국어 수준 추가. none(전혀)/some(어느정도)/fluent(의사소통 문제없음).
alter table public.dancer_visa_applications
  add column if not exists korean_level text check (korean_level in ('none','some','fluent'));

comment on column public.dancer_visa_applications.korean_level is
  '한국어 수준: none(전혀 못함)/some(어느 정도)/fluent(의사소통 문제없음). /visa 온보딩 설문.';
