-- 20260531_003 phase3_standing_pool_flag
-- 상시 섭외풀(B0): projects.is_standing_pool 플래그. 마감 없음, 지원자 풀 적재.
alter table public.projects
  add column if not exists is_standing_pool boolean not null default false;
comment on column public.projects.is_standing_pool is
  '상시 섭외풀: 마감 없음, 지원자는 풀에 적재(탈락 아님). 가짜 특정공고 대신 진실된 상시 모집.';
