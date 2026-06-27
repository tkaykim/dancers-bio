-- 외부(비-deetz) 인원도 보드 멤버로: dancer_id 선택화 + 스냅샷 컬럼.
alter table public.casting_board_members alter column dancer_id drop not null;
alter table public.casting_board_members add column if not exists display_name text;
alter table public.casting_board_members add column if not exists korean_name text;
alter table public.casting_board_members add column if not exists gender text;
alter table public.casting_board_members add column if not exists height_cm integer;
