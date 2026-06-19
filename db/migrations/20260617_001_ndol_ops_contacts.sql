create table if not exists public.ops_ndol_contacts (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  source_key text not null,
  dancer_id uuid references public.dancers(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  project_code text not null,
  project_href text,
  group_key text not null check (
    group_key in ('confirmed', 'accepted_unknown', 'pending_unknown', 'recovery')
  ),
  manager_key text not null check (manager_key in ('baw', 'hs')),
  manager_name text not null,
  name text not null default '',
  gender text not null default 'unknown',
  app_status text,
  availability_status text,
  outreach_status text not null default 'pending' check (
    outreach_status in ('pending', 'no_answer', 'unavailable', 'available')
  ),
  phone text,
  instagram text,
  email text,
  note text not null default '',
  sort_rank integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_key, source_key)
);

alter table public.ops_ndol_contacts enable row level security;

create index if not exists ops_ndol_contacts_event_idx
  on public.ops_ndol_contacts (event_key, manager_key, group_key, outreach_status);

create index if not exists ops_ndol_contacts_updated_idx
  on public.ops_ndol_contacts (event_key, updated_at desc);
