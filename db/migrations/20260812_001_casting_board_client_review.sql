-- Extend the existing casting board into a reusable client-review workspace.
-- Public /cast links remain read-only; writes only happen through server actions
-- after a signed review token is verified.

alter table public.casting_boards
  add column if not exists review_token_version integer not null default 1,
  add column if not exists review_submitted_at timestamptz,
  add column if not exists review_submitted_by text;

alter table public.casting_board_members
  add column if not exists application_id uuid references public.applications(id) on delete set null,
  add column if not exists client_decision text not null default 'undecided',
  add column if not exists client_note text,
  add column if not exists client_decided_at timestamptz,
  add column if not exists client_decided_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'casting_boards_review_token_version_positive'
      and conrelid = 'public.casting_boards'::regclass
  ) then
    alter table public.casting_boards
      add constraint casting_boards_review_token_version_positive
      check (review_token_version > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'casting_board_members_client_decision_check'
      and conrelid = 'public.casting_board_members'::regclass
  ) then
    alter table public.casting_board_members
      add constraint casting_board_members_client_decision_check
      check (client_decision = any (array['undecided', 'selected', 'hold', 'excluded']));
  end if;
end
$$;

create unique index if not exists casting_board_members_board_application_key
  on public.casting_board_members(board_id, application_id)
  where application_id is not null;

create index if not exists casting_board_members_application_idx
  on public.casting_board_members(application_id)
  where application_id is not null;

create table if not exists public.casting_board_review_events (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.casting_boards(id) on delete cascade,
  member_id uuid references public.casting_board_members(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  previous_decision text,
  decision text not null,
  actor_kind text not null default 'client',
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  created_at timestamptz not null default now(),
  constraint casting_board_review_events_previous_decision_check
    check (
      previous_decision is null
      or previous_decision = any (array['undecided', 'selected', 'hold', 'excluded'])
    ),
  constraint casting_board_review_events_decision_check
    check (decision = any (array['undecided', 'selected', 'hold', 'excluded'])),
  constraint casting_board_review_events_actor_kind_check
    check (actor_kind = any (array['client', 'manager']))
);

create index if not exists casting_board_review_events_board_created_idx
  on public.casting_board_review_events(board_id, created_at desc);

create index if not exists casting_board_review_events_member_idx
  on public.casting_board_review_events(member_id)
  where member_id is not null;

create index if not exists casting_board_review_events_application_idx
  on public.casting_board_review_events(application_id)
  where application_id is not null;

create index if not exists casting_board_review_events_actor_profile_idx
  on public.casting_board_review_events(actor_profile_id)
  where actor_profile_id is not null;

alter table public.casting_board_review_events enable row level security;

revoke all on public.casting_board_review_events from anon, authenticated;
grant select on public.casting_board_review_events to authenticated;

drop policy if exists casting_board_review_events_select on public.casting_board_review_events;
create policy casting_board_review_events_select
  on public.casting_board_review_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.casting_boards b
      where b.id = casting_board_review_events.board_id
        and public.can_manage_project(b.project_id)
    )
  );

comment on column public.casting_boards.review_token_version is
  'Version embedded in the signed client-review capability token. Increment to revoke prior write links.';

comment on column public.casting_board_members.application_id is
  'Application represented by this board member. Null for legacy or external snapshot members.';

comment on column public.casting_board_members.client_decision is
  'Latest client review choice, separate from applications.status and applications.confirmed_at.';

comment on table public.casting_board_review_events is
  'Append-only audit trail for token-based client review choices and manager-applied decisions.';
