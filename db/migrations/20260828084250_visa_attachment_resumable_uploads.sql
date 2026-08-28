-- Let paid visa applicants upload modern high-resolution source files safely.
-- The project-wide Supabase Storage limit remains the final infrastructure guard;
-- this bucket no longer adds the former 10 MB ceiling.

alter table public.visa_document_attachments
  drop constraint if exists visa_document_attachments_size_bytes_check;

alter table public.visa_document_attachments
  add constraint visa_document_attachments_size_bytes_check
  check (size_bytes >= 1);

alter table public.visa_document_attachments
  drop constraint if exists visa_document_attachments_sort_order_check;

alter table public.visa_document_attachments
  add constraint visa_document_attachments_sort_order_check
  check (
    (kind = 'activity_photo' and sort_order >= 0)
    or (kind <> 'activity_photo' and sort_order = 0)
  );

comment on column public.visa_document_attachments.sort_order is
  'Zero for singleton documents; non-negative display order for four or more activity photos.';

comment on column public.visa_document_attachments.size_bytes is
  'Stored object size after optional browser-side image optimization; no application-level maximum.';

update storage.buckets
set
  public = false,
  file_size_limit = null
where id = 'visa-documents';
