-- 캐스팅 보드: 관리자가 합격자 풀에서 선발해 클라이언트에게 공유하는 캐스팅 라인업.
-- 공유 = 짧은 코드 /cast/<share_code> (기존 gen_project_survey_code 재사용).
-- 선발 명단을 앱에 저장(외부 구글시트 졸업). 사진 없는 인원은 화면단에서 제외.

create table if not exists public.casting_boards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text,
  share_code text not null unique default gen_project_survey_code(),
  -- 정렬/필터/표시 설정. 예:
  -- { "genderPriority":"male", "sortBy":"height",
  --   "requirePhoto":true, "genders":["male","female"], "minHeight":null,
  --   "fields":{"height":true,"instagram":true,"career":true} }
  settings jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists casting_boards_project_idx
  on public.casting_boards(project_id, created_at desc);

create table if not exists public.casting_board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.casting_boards(id) on delete cascade,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(board_id, dancer_id)
);

create index if not exists casting_board_members_board_idx
  on public.casting_board_members(board_id, sort_order);

-- RLS: default deny. 관리자(can_manage_project)만 CRUD. 공개 열람은 서버 라우트가 service-role로.
alter table public.casting_boards enable row level security;
alter table public.casting_board_members enable row level security;

create policy casting_boards_manage on public.casting_boards
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

create policy casting_board_members_manage on public.casting_board_members
  for all using (
    exists (select 1 from public.casting_boards b
            where b.id = board_id and public.can_manage_project(b.project_id))
  )
  with check (
    exists (select 1 from public.casting_boards b
            where b.id = board_id and public.can_manage_project(b.project_id))
  );
