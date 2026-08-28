-- Private attachments for a paid visa/training-program document intake.
-- Files live outside Postgres; this table is the server-only metadata ledger.

create table if not exists public.visa_document_attachments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.dancer_visa_applications(id) on delete cascade,
  kind text not null
    check (kind in ('passport_copy', 'dancer_profile', 'id_photo', 'activity_photo')),
  sort_order smallint not null default 0,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null
    check (mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf'
    )),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  constraint visa_document_attachments_sort_order_check check (
    (kind = 'activity_photo' and sort_order between 0 and 7)
    or (kind <> 'activity_photo' and sort_order = 0)
  ),
  constraint visa_document_attachments_application_slot_key
    unique (application_id, kind, sort_order)
);

comment on table public.visa_document_attachments is
  'Server-only metadata for private visa intake files stored in the visa-documents bucket.';
comment on column public.visa_document_attachments.sort_order is
  'Zero for singleton documents; zero through seven for the eight activity photos.';

create index if not exists visa_document_attachments_application_created_idx
  on public.visa_document_attachments (application_id, kind, sort_order, created_at);

alter table public.visa_document_attachments enable row level security;
revoke all on table public.visa_document_attachments from anon, authenticated;
grant all on table public.visa_document_attachments to service_role;

-- No storage.objects policies are intentionally created for this bucket.
-- The server verifies case ownership and issues a unique signed upload token;
-- reads use short-lived signed URLs generated for the applicant or an admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visa-documents',
  'visa-documents',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;
