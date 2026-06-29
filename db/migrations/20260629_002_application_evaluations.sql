-- 지원자 사전선별 평가: 프로젝트×지원자 1건에 대해 담당자별 점수(1~10) + 코멘트.
-- 댄서 전역 경력점수(dancer_scores)와 별개 — 이 지원 1건에 한정한 적합성 평가.
-- stage 기본 'prescreen'. 미래에 'onsite'(현장점수) 등 추가 시 같은 테이블에 한 줄로 확장.
-- "담당자들끼리 의견 공유" 해결 = 같은 프로젝트 담당자는 서로의 점수·코멘트를 모두 조회, 쓰기는 본인 것만.

create table if not exists public.application_evaluations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  evaluator_id uuid not null references public.profiles(id) on delete cascade,
  stage text not null default 'prescreen',
  score smallint not null check (score between 1 and 10),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, evaluator_id, stage)
);
create index if not exists application_evaluations_app_idx
  on public.application_evaluations(application_id, stage);

alter table public.application_evaluations enable row level security;

-- 조회: 이 지원이 속한 프로젝트의 담당자(소유자·슈퍼·공동관리자)는 전원의 평가를 본다.
drop policy if exists application_evaluations_select on public.application_evaluations;
create policy application_evaluations_select on public.application_evaluations
  for select using (
    exists (
      select 1 from public.applications a
      where a.id = application_id and public.can_manage_project(a.project_id)
    )
  );

-- 입력: 같은 담당자 게이트 + 본인(evaluator_id = auth.uid())만.
drop policy if exists application_evaluations_insert on public.application_evaluations;
create policy application_evaluations_insert on public.application_evaluations
  for insert with check (
    evaluator_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and public.can_manage_project(a.project_id)
    )
  );

-- 수정: 본인 평가만.
drop policy if exists application_evaluations_update on public.application_evaluations;
create policy application_evaluations_update on public.application_evaluations
  for update using (
    evaluator_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and public.can_manage_project(a.project_id)
    )
  ) with check (
    evaluator_id = auth.uid()
    and exists (
      select 1 from public.applications a
      where a.id = application_id and public.can_manage_project(a.project_id)
    )
  );

-- 삭제(내 점수 비우기): 본인 평가만.
drop policy if exists application_evaluations_delete on public.application_evaluations;
create policy application_evaluations_delete on public.application_evaluations
  for delete using (evaluator_id = auth.uid());

grant select, insert, update, delete on public.application_evaluations to authenticated;

-- 확정: 수락된 지원자 위에 얹는 "최종 잠금" 플래그 (status enum 대체가 아님 → 기존 accepted 쿼리 보존).
alter table public.applications
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null;
create index if not exists applications_confirmed_idx
  on public.applications(project_id) where confirmed_at is not null;
