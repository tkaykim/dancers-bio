-- Unified payment cancellation/refund control plane.
-- These tables are service-role only and intentionally have no client RLS policies.

create table if not exists public.payment_operations (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null check (operation_type in ('cancel', 'refund')),
  source_system text not null check (source_system in ('deetz', 'grigoent')),
  source_type text not null
    check (source_type in ('training_payment', 'workshop_reservation', 'workshop_event')),
  source_order_id text not null,
  source_payment_id text not null,
  order_no text,
  provider text check (provider is null or provider in ('toss', 'paypal')),
  ledger_amount numeric(14, 2) not null default 0 check (ledger_amount >= 0),
  ledger_currency text not null check (ledger_currency ~ '^[A-Z]{3}$'),
  provider_amount numeric(14, 2) not null default 0 check (provider_amount >= 0),
  provider_currency text not null check (provider_currency ~ '^[A-Z]{3}$'),
  reason_code text not null check (char_length(reason_code) between 1 and 80),
  reason_detail text not null check (char_length(reason_detail) between 1 and 500),
  status text not null default 'requested'
    check (status in (
      'requested', 'processing', 'provider_pending', 'completed', 'failed',
      'rejected', 'reconciliation_required', 'cancelled'
    )),
  requested_by uuid not null,
  requested_by_name text not null,
  approved_by uuid,
  approved_by_name text,
  idempotency_key text not null unique,
  provider_refund_id text,
  provider_status text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  error_code text,
  error_message text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  processed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  constraint payment_operations_distinct_actors
    check (approved_by is null or requested_by <> approved_by),
  constraint payment_operations_refund_amount
    check (operation_type <> 'refund' or (ledger_amount > 0 and provider_amount > 0)),
  constraint payment_operations_cancel_amount
    check (operation_type <> 'cancel' or (ledger_amount = 0 and provider_amount = 0))
);

create index if not exists payment_operations_source_created_idx
  on public.payment_operations (source_system, source_type, source_payment_id, requested_at desc);

create index if not exists payment_operations_status_created_idx
  on public.payment_operations (status, requested_at desc);

create unique index if not exists payment_operations_one_active_per_payment_idx
  on public.payment_operations (source_system, source_type, source_payment_id)
  where status in ('requested', 'processing', 'provider_pending', 'reconciliation_required');

create table if not exists public.deetz_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.payment_operations(id) on delete restrict,
  source_type text not null check (source_type in ('workshop_reservation', 'workshop_event')),
  source_id uuid not null,
  provider text not null check (provider in ('toss', 'paypal')),
  ledger_amount numeric(14, 2) not null check (ledger_amount > 0),
  ledger_currency text not null check (ledger_currency ~ '^[A-Z]{3}$'),
  provider_amount numeric(14, 2) not null check (provider_amount > 0),
  provider_currency text not null check (provider_currency ~ '^[A-Z]{3}$'),
  idempotency_key text not null unique,
  status text not null default 'processing'
    check (status in ('processing', 'pending', 'completed', 'failed', 'reconciliation_required')),
  provider_refund_id text,
  provider_status text,
  reason text not null check (char_length(reason) between 1 and 500),
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  error_code text,
  error_message text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists deetz_payment_refunds_source_status_idx
  on public.deetz_payment_refunds (source_type, source_id, status, requested_at desc);

create unique index if not exists deetz_payment_refunds_one_active_per_source_idx
  on public.deetz_payment_refunds (source_type, source_id)
  where status in ('processing', 'pending', 'reconciliation_required');

alter table public.payment_operations enable row level security;
alter table public.deetz_payment_refunds enable row level security;

revoke all on table public.payment_operations from anon, authenticated;
revoke all on table public.deetz_payment_refunds from anon, authenticated;
grant select, insert, update on table public.payment_operations to service_role;
grant select, insert, update on table public.deetz_payment_refunds to service_role;

comment on table public.payment_operations is
  'Two-person approval and execution audit log for payment cancellation/refund operations.';

comment on table public.deetz_payment_refunds is
  'Server-only immutable ledger of Toss and PayPal refunds executed for deetz-native payments.';

alter table public.workshop_reservations
  add column if not exists provider_order_id text;

alter table public.workshop_event_orders
  add column if not exists provider_order_id text;

comment on column public.workshop_reservations.provider_order_id is
  'Provider-side order ID used to verify cancellation before capture.';

comment on column public.workshop_event_orders.provider_order_id is
  'Provider-side order ID used to verify cancellation before capture.';
