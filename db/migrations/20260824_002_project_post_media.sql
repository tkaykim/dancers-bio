-- Project post media keeps the existing public-read behavior used by private
-- share links, while limiting browser writes to each authenticated user's path.
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
where id = 'project-files';

drop policy if exists "project_files_authenticated_write" on storage.objects;
drop policy if exists "project_files_authenticated_update" on storage.objects;
drop policy if exists "project_files_authenticated_delete" on storage.objects;

create policy "project_files_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "project_files_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "project_files_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'project-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Project collaborators use the same server-side permission contract as the
-- project edit screen instead of the older owner/team-only attachment policy.
drop policy if exists project_attachments_write on public.project_attachments;

create policy project_attachments_write
on public.project_attachments
for all
to authenticated
using (public.can_manage_project(project_id))
with check (public.can_manage_project(project_id));
