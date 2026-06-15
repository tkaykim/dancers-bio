-- 정산 서류: 댄서 프로필당(계정 아님) 신분증·통장사본 보관.
-- 매우 민감한 PII → 비공개 버킷 + 본인(can_act_as_dancer) 또는 슈퍼관리자만 접근.
-- 파일 경로 첫 폴더 = dancer_id (프로필 단위). 열람은 서버액션이 service-role로 서명URL 발급.

alter table public.dancer_private_info
  add column if not exists id_card_path text,
  add column if not exists id_card_uploaded_at timestamptz,
  add column if not exists bankbook_path text,
  add column if not exists bankbook_uploaded_at timestamptz;

-- 비공개 버킷 (public=false). 이미지/PDF, 10MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dancer-docs', 'dancer-docs', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];

-- 스토리지 RLS: 경로 첫 폴더(dancer_id)에 대해 본인 또는 admin만.
drop policy if exists "dancer-docs read" on storage.objects;
create policy "dancer-docs read" on storage.objects
  for select using (
    bucket_id = 'dancer-docs'
    and (
      public.is_admin()
      or exists (
        select 1 from public.dancers d
        where d.id::text = (storage.foldername(name))[1]
          and public.can_act_as_dancer(d.id)
      )
    )
  );

drop policy if exists "dancer-docs write" on storage.objects;
create policy "dancer-docs write" on storage.objects
  for insert with check (
    bucket_id = 'dancer-docs'
    and (
      public.is_admin()
      or exists (
        select 1 from public.dancers d
        where d.id::text = (storage.foldername(name))[1]
          and public.can_act_as_dancer(d.id)
      )
    )
  );

drop policy if exists "dancer-docs update" on storage.objects;
create policy "dancer-docs update" on storage.objects
  for update using (
    bucket_id = 'dancer-docs'
    and (
      public.is_admin()
      or exists (
        select 1 from public.dancers d
        where d.id::text = (storage.foldername(objects.name))[1]
          and public.can_act_as_dancer(d.id)
      )
    )
  );

drop policy if exists "dancer-docs delete" on storage.objects;
create policy "dancer-docs delete" on storage.objects
  for delete using (
    bucket_id = 'dancer-docs'
    and (
      public.is_admin()
      or exists (
        select 1 from public.dancers d
        where d.id::text = (storage.foldername(objects.name))[1]
          and public.can_act_as_dancer(d.id)
      )
    )
  );
