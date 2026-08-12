-- Capture why a user is asking about the protected directory.
-- The directory remains capped; this only adds lead context to the existing request log.

alter table public.roster_access_requests
  add column if not exists purpose text,
  add column if not exists details text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'roster_access_requests_purpose_check'
      and conrelid = 'public.roster_access_requests'::regclass
  ) then
    alter table public.roster_access_requests
      add constraint roster_access_requests_purpose_check
      check (purpose is null or purpose in ('profile_check', 'casting', 'collaboration'));
  end if;
end;
$$;

comment on column public.roster_access_requests.purpose is
  'Reason for the request: profile_check, casting, or collaboration.';
comment on column public.roster_access_requests.details is
  'User-provided casting or collaboration context. Do not use this field for private credentials.';
