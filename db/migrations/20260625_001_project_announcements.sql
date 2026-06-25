-- 프로젝트 공지사항 + 공지 히스토리.
-- audiences: 열람 대상 다중선택 — 'public'(공개 링크 누구나) / 'pending'(대기) / 'accepted'(수락) / 'rejected'(탈락).
-- 작성·관리는 프로젝트 관리자(can_manage_project), 열람은 공개이거나 본인 지원상태가 대상에 포함될 때.

create table if not exists public.project_announcements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text,
  body text not null,
  audiences text[] not null default '{}',
  pinned boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists project_announcements_project_idx
  on public.project_announcements (project_id, pinned desc, created_at desc);

alter table public.project_announcements enable row level security;

-- 관리자: 전체 권한 (작성·수정·삭제·조회)
drop policy if exists pa_manage on public.project_announcements;
create policy pa_manage on public.project_announcements
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- 열람: 공개(public) 이거나, 로그인한 본인의 지원상태가 대상에 포함될 때 (삭제된 건 제외)
drop policy if exists pa_select_audience on public.project_announcements;
create policy pa_select_audience on public.project_announcements
  for select using (
    deleted_at is null and (
      'public' = any (audiences)
      or exists (
        select 1
        from public.applications a
        where a.project_id = project_announcements.project_id
          and a.applicant_id = auth.uid()
          and a.archived_at is null
          and (
            ('pending'  = any (audiences) and a.status = 'pending')
            or ('accepted' = any (audiences) and a.status = 'accepted')
            or ('rejected' = any (audiences) and a.status = 'rejected')
          )
      )
    )
  );
