-- 일정 응답자 큐레이션: 관리자가 특정 일정의 응답자(가능자)를 활성/비활성 토글.
-- 기본 활성(true). 비활성 = 이 일정 후보에서 제외하되 응답 기록은 보존(명단 셰이프만 바뀜).
-- 응답 데이터(status/time_slots/note) 자체는 불변 — 큐레이션 오버레이 플래그.
alter table public.project_schedule_responses
  add column if not exists is_active boolean not null default true;
