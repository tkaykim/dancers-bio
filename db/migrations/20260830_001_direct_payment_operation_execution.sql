-- Allow explicitly granted representative accounts to execute their own
-- cancellation/refund request immediately while preserving two-person approval
-- for every other administrator.

alter table public.payment_operations
  add column if not exists execution_mode text not null default 'two_person'
    check (execution_mode in ('two_person', 'direct'));

alter table public.payment_operations
  drop constraint if exists payment_operations_distinct_actors;

alter table public.payment_operations
  add constraint payment_operations_actor_separation
  check (
    (
      execution_mode = 'two_person'
      and (approved_by is null or requested_by <> approved_by)
    )
    or (
      execution_mode = 'direct'
      and approved_by is not null
      and requested_by = approved_by
    )
  );

create table if not exists public.payment_operation_executors (
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete restrict,
  grant_reason text not null check (char_length(grant_reason) between 2 and 300),
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_operation_executors enable row level security;

revoke all on table public.payment_operation_executors from public, anon, authenticated, service_role;
grant select on table public.payment_operation_executors to service_role;

comment on column public.payment_operations.execution_mode is
  'two_person requires a different approver; direct is restricted to the server-side executor allowlist.';

comment on table public.payment_operation_executors is
  'Server-only allowlist for administrators permitted to execute their own payment cancellation/refund request immediately.';
