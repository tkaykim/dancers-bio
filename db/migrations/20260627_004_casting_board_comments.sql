-- 클라이언트가 캐스팅 보드에 남기는 코멘트(공개 페이지 → 관리자 확인용).
create table if not exists public.casting_board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.casting_boards(id) on delete cascade,
  author_name text,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists casting_board_comments_board_idx
  on public.casting_board_comments(board_id, created_at desc);
alter table public.casting_board_comments enable row level security;
-- 관리자(프로젝트 관리권한)만 조회/수정/삭제. INSERT는 공개 제출 서버액션(service-role)으로만.
create policy casting_board_comments_manage on public.casting_board_comments
  for all using (exists (select 1 from public.casting_boards b where b.id = board_id and public.can_manage_project(b.project_id)))
  with check (exists (select 1 from public.casting_boards b where b.id = board_id and public.can_manage_project(b.project_id)));
