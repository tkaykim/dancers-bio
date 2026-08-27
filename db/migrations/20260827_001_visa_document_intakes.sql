-- Paid visa/training-program document intake.
-- Existing member/payment/profile tables stay canonical; this table stores only the case snapshot.

alter table public.dancer_visa_applications
  add column if not exists email_normalized text generated always as (lower(btrim(email))) stored,
  add column if not exists external_training_order_id uuid,
  add column if not exists program_product_slug text;

create unique index if not exists dancer_visa_applications_external_training_order_uidx
  on public.dancer_visa_applications (external_training_order_id)
  where external_training_order_id is not null;

create index if not exists dancer_visa_applications_email_normalized_idx
  on public.dancer_visa_applications (email_normalized);

create table if not exists public.visa_document_intakes (
  application_id uuid primary key
    references public.dancer_visa_applications(id) on delete cascade,
  schema_version smallint not null default 1 check (schema_version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'needs_revision', 'accepted')),
  draft_version bigint not null default 1 check (draft_version > 0),
  form_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(form_data) = 'object'),
  sensitive_data_ciphertext text,
  last_saved_at timestamptz not null default now(),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.visa_document_intakes is
  'One encrypted, versioned visa document draft per paid deetz program case.';
comment on column public.visa_document_intakes.form_data is
  'Non-secret structured form data only; passport and national ID numbers are excluded.';
comment on column public.visa_document_intakes.sensitive_data_ciphertext is
  'AES-256-GCM envelope encrypted by the application server.';

create index if not exists visa_document_intakes_status_updated_idx
  on public.visa_document_intakes (status, updated_at desc);

alter table public.visa_document_intakes enable row level security;
revoke all on table public.visa_document_intakes from anon, authenticated;
grant all on table public.visa_document_intakes to service_role;

-- This table is written only by service-role mail jobs and was accidentally left exposed.
alter table public.career_reminder_log enable row level security;
revoke all on table public.career_reminder_log from anon, authenticated;
grant all on table public.career_reminder_log to service_role;

-- Visa applications contain internal notes and are intentionally server-only.
revoke all on table public.dancer_visa_applications from anon, authenticated;
grant all on table public.dancer_visa_applications to service_role;
