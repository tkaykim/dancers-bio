alter table public.dancers
  drop column if exists public_consent_at,
  drop column if exists public_consent_note;
