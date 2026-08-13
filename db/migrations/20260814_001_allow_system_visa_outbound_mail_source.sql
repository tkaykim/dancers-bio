-- Automatic application-confirmation emails are sent by the web app, so their
-- audit rows use source='system'. Preserve the existing admin/script sources.
set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.visa_outbound_mails
  drop constraint if exists visa_outbound_mails_source_check;

alter table public.visa_outbound_mails
  add constraint visa_outbound_mails_source_check
  check (source in ('admin', 'script', 'system')) not valid;

alter table public.visa_outbound_mails
  validate constraint visa_outbound_mails_source_check;
