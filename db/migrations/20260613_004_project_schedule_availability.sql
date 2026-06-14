-- 프로젝트 일정 가능여부 조사 (재사용): 후보 일정 + 지원자별 응답.
-- 프로젝트 생성 시 또는 이후 언제든 후보 일정을 추가하고, (탈락 제외) 지원자에게
-- 매직링크로 가능/시간일부/불가를 받아 집계한다.

create table if not exists public.project_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  note text,
  sort_order int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_schedules_project_idx on public.project_schedules(project_id);

do $$ begin
  create type schedule_response_status as enum ('available','partial','unavailable');
exception when duplicate_object then null; end $$;

create table if not exists public.project_schedule_responses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.project_schedules(id) on delete cascade,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  status schedule_response_status not null,
  time_slots jsonb,
  note text,
  responded_at timestamptz not null default now(),
  unique (schedule_id, dancer_id)
);
create index if not exists psr_schedule_idx on public.project_schedule_responses(schedule_id);

alter table public.project_schedules enable row level security;
alter table public.project_schedule_responses enable row level security;

grant select, insert, update, delete on public.project_schedules to authenticated;
grant select, insert, update, delete on public.project_schedule_responses to authenticated;

-- 관리자(can_manage_project)만 관리·조회. 지원자 응답은 토큰+service-role 경유.
drop policy if exists project_schedules_manage on public.project_schedules;
create policy project_schedules_manage on public.project_schedules
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

drop policy if exists psr_select on public.project_schedule_responses;
create policy psr_select on public.project_schedule_responses
  for select using (exists(
    select 1 from public.project_schedules s
    where s.id = schedule_id and public.can_manage_project(s.project_id)
  ));
