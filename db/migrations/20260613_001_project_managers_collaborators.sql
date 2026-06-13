-- 공동관리자(co-manager) 레이어: 프로젝트당 여러 관리자 지정 + 권한 함수 + RLS repoint.
-- 등급: 슈퍼관리자(is_admin) / 프로젝트 매니저(can_create_project=owner) / 공동관리자(project_managers).
-- 공동관리자 권한 = 지원자 열람·수락/거절 + 프로젝트 수정 + 제안 발송. (삭제·공동관리자 추가는 소유자·슈퍼관리자만)

create table if not exists public.project_managers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'manager',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, profile_id)
);
create index if not exists project_managers_project_idx on public.project_managers(project_id);
create index if not exists project_managers_profile_idx on public.project_managers(profile_id);

alter table public.project_managers enable row level security;

-- owner 또는 슈퍼관리자(is_admin) 여부
create or replace function public.is_project_owner(p_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_admin()
      or exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid());
$$;

-- owner 또는 슈퍼관리자 또는 공동관리자 → 이 프로젝트를 "관리"할 수 있는가
create or replace function public.can_manage_project(p_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_admin()
      or exists (select 1 from public.projects p where p.id = p_id and p.owner_id = auth.uid())
      or exists (select 1 from public.project_managers pm where pm.project_id = p_id and pm.profile_id = auth.uid());
$$;

grant select, insert, delete on public.project_managers to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated, anon;
grant execute on function public.is_project_owner(uuid) to authenticated, anon;

-- RLS: 관리자(소유자·슈퍼·공동)는 명단 조회 가능
drop policy if exists project_managers_select on public.project_managers;
create policy project_managers_select on public.project_managers
  for select using (public.can_manage_project(project_id));

-- 추가/삭제는 소유자·슈퍼관리자만 (공동관리자는 다른 공동관리자 추가 불가)
drop policy if exists project_managers_insert on public.project_managers;
create policy project_managers_insert on public.project_managers
  for insert with check (public.is_project_owner(project_id) and added_by = auth.uid());

drop policy if exists project_managers_delete on public.project_managers;
create policy project_managers_delete on public.project_managers
  for delete using (public.is_project_owner(project_id));

-- ── 기존 정책 repoint: owns_project → can_manage_project (지원자 관리 + 수정) ──

drop policy if exists applications_select on public.applications;
create policy applications_select on public.applications
  for select using (
    is_admin()
    or ((dancer_id is not null) and can_act_as_dancer(dancer_id))
    or ((team_id is not null) and leads_team(team_id))
    or can_manage_project(project_id)
    or ((applicant_id is not null) and (applicant_id = auth.uid()))
  );

drop policy if exists applications_update on public.applications;
create policy applications_update on public.applications
  for update using (
    is_admin()
    or ((dancer_id is not null) and can_act_as_dancer(dancer_id))
    or ((team_id is not null) and leads_team(team_id))
    or can_manage_project(project_id)
  ) with check (
    is_admin()
    or ((dancer_id is not null) and can_act_as_dancer(dancer_id))
    or ((team_id is not null) and leads_team(team_id))
    or can_manage_project(project_id)
  );

drop policy if exists applications_insert on public.applications;
create policy applications_insert on public.applications
  for insert with check (
    is_admin()
    or (
      (source = 'apply'::application_source)
      and (
        ((dancer_id is not null) and can_act_as_dancer(dancer_id))
        or ((team_id is not null) and leads_team(team_id))
      )
      and exists (
        select 1 from projects p
        where p.id = applications.project_id
          and p.status = 'open'::project_status
          and p.deleted_at is null
          and (applications.team_id is null or p.allow_team_apply = true)
      )
    )
    or (
      (source = 'direct_proposal'::application_source)
      and can_manage_project(project_id)
      and (
        (dancer_id is not null)
        or ((team_id is not null) and exists (
          select 1 from projects p where p.id = applications.project_id and p.allow_team_apply = true
        ))
      )
    )
  );

-- 프로젝트 수정: 공동관리자도 가능 (삭제는 projects_delete 그대로 owner/admin만 유지)
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update using (can_manage_project(id))
  with check (can_manage_project(id));
