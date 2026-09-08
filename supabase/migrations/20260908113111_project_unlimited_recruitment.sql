-- A fixed recruitment count remains the default for existing projects.
alter table public.projects
  add column recruitment_unlimited boolean not null default false;
comment on column public.projects.recruitment_unlimited is
  'No fixed participant quota; public views show no limit and capacity checks are skipped. Application deadline still applies.';
