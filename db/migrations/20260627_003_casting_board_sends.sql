-- 캐스팅 보드 클라이언트 발송 이력.
create table if not exists public.casting_board_sends (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.casting_boards(id) on delete cascade,
  recipient_email text not null,
  recipient_name text,
  message text,
  status text not null default 'sent',
  error text,
  sent_by uuid,
  sent_at timestamptz not null default now()
);
create index if not exists casting_board_sends_board_idx on public.casting_board_sends(board_id, sent_at desc);
alter table public.casting_board_sends enable row level security;
create policy casting_board_sends_manage on public.casting_board_sends
  for all using (exists (select 1 from public.casting_boards b where b.id = board_id and public.can_manage_project(b.project_id)))
  with check (exists (select 1 from public.casting_boards b where b.id = board_id and public.can_manage_project(b.project_id)));
