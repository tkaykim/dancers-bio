-- deetz Village 건물 사진. 옵션 A/B/공용별로 여러 장.
-- 업로드는 공개 링크(/village/upload)에서 누구나 가능(대표 지시) — 서버 액션이 service-role로 적재한다.
-- 파일은 public 버킷이라 랜딩(/village)에서 그대로 <img> 로 노출된다.

insert into storage.buckets (id, name, public)
values ('village-photos', 'village-photos', true)
on conflict (id) do nothing;

create table if not exists public.village_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  option_key text not null check (option_key in ('a', 'b', 'common')),
  storage_path text not null unique,
  public_url text not null,
  caption text,
  sort_order integer not null default 0,
  hidden boolean not null default false,
  uploader_note text
);

create index if not exists village_photos_option_idx
  on public.village_photos (option_key, sort_order, created_at);

alter table public.village_photos enable row level security;

revoke all on table public.village_photos from anon, authenticated;

comment on table public.village_photos is
  'deetz Village 옵션별 사진. /village/upload 공개 업로드 → /village 랜딩 노출. RLS default-deny(service-role 전용), 파일은 public 버킷 village-photos.';

-- 2026-08-15 추가(Codex 교차검토 2R): Storage 레벨 용량·형식 강제.
-- 서버 액션은 signed URL 발급 시점의 신고값만 보므로, 실제 업로드 본문이 다르면 막지 못한다.
-- 버킷 제한은 업로드 자체를 거부하는 마지막 방어선이다. 한도는 앱 상수(20MB)와 동일하게 유지한다.
update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array['image/jpeg', 'image/pjpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
 where id = 'village-photos';
