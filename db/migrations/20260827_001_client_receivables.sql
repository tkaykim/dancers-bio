-- 매출채권(받을 돈) v1 — design-client-receivables.md rev1
-- 거래처 마스터 + 딜(계약 단위) + 청구 라인 + 입금(append-only).
-- 전 테이블 RLS default-deny(정책 0) + anon/authenticated 권한 회수 → requireAdmin 서버액션(service-role) 전용.

-- 1) 거래처 마스터
create table public.client_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_registration_number text,
  aliases text[] not null default '{}',
  default_contact_name text,
  default_contact_email text,
  default_contact_phone text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index client_parties_brn_uniq
  on public.client_parties(business_registration_number)
  where business_registration_number is not null;

-- 2) 딜(계약 단위)
create table public.project_client_deals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  client_party_id uuid references public.client_parties(id),
  client_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  pricing_model text not null check (pricing_model in
    ('fixed','per_unit','min_guarantee_plus_unit','revenue_share','composite')),
  unit_price bigint,
  unit_label text,
  quantity_cap integer,
  quantity_min integer,
  min_guarantee_amount bigint,
  revenue_share_pct numeric(5,2),
  revenue_share_base text,
  expected_supply_amount bigint,
  vat_mode text not null default 'vat_excluded'
    check (vat_mode in ('vat_excluded','vat_included','tax_free')),
  payment_terms text,
  contract_signed_at date,
  contract_doc_url text,
  agreement_basis text,
  status text not null default 'active'
    check (status in ('negotiating','active','completed','cancelled')),
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_client_deals_project_idx on public.project_client_deals(project_id);

-- 3) 청구 라인(채권 단위)
create table public.deal_revenue_lines (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.project_client_deals(id),
  line_type text not null check (line_type in
    ('base','installment','unit_billing','option','expense_rebill','revenue_share','adjustment')),
  title text not null,
  quantity numeric,
  unit_price bigint,
  supply_amount bigint not null,
  vat_amount bigint not null default 0,
  status text not null default 'draft'
    check (status in ('draft','confirmed','invoiced','received','cancelled')),
  due_date date,
  invoice_issued_at date,
  received_at date,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_lines_adjustment_sign check (line_type = 'adjustment' or supply_amount >= 0),
  constraint deal_lines_unit_fields check (line_type <> 'unit_billing' or (quantity is not null and unit_price is not null))
);
create index deal_revenue_lines_deal_idx on public.deal_revenue_lines(deal_id);

-- 4) 입금 기록(append-only)
create table public.deal_receipts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.project_client_deals(id),
  line_id uuid references public.deal_revenue_lines(id),
  amount bigint not null check (amount <> 0),
  received_on date not null,
  method text,
  clobe_tx_id text,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index deal_receipts_deal_idx on public.deal_receipts(deal_id);
create index deal_receipts_line_idx on public.deal_receipts(line_id);

-- RLS: default-deny (정책 없음) + 클라이언트 role 권한 회수
alter table public.client_parties enable row level security;
alter table public.project_client_deals enable row level security;
alter table public.deal_revenue_lines enable row level security;
alter table public.deal_receipts enable row level security;

revoke all on public.client_parties from anon, authenticated;
revoke all on public.project_client_deals from anon, authenticated;
revoke all on public.deal_revenue_lines from anon, authenticated;
revoke all on public.deal_receipts from anon, authenticated;

-- updated_at 유지(기존 set_updated_at 재사용)
create trigger client_parties_touch_updated before update on public.client_parties
  for each row execute function public.set_updated_at();
create trigger project_client_deals_touch_updated before update on public.project_client_deals
  for each row execute function public.set_updated_at();
create trigger deal_revenue_lines_touch_updated before update on public.deal_revenue_lines
  for each row execute function public.set_updated_at();

-- 봉인 1: 입금은 append-only (교정 = 음수 금액 새 행)
create or replace function public.deal_receipts_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'RECEIPTS_APPEND_ONLY: receipts are immutable; corrections are new negative rows';
end;
$$;
create trigger deal_receipts_no_mutation
  before update or delete on public.deal_receipts
  for each row execute function public.deal_receipts_block_mutation();

-- 봉인 2: 입금 정합(라인-딜 일치) + 합계 도달 시 라인 received 자동 전환
create or replace function public.deal_receipts_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_line public.deal_revenue_lines%rowtype;
  v_sum bigint;
begin
  if new.line_id is not null then
    select * into v_line from public.deal_revenue_lines where id = new.line_id for update;
    if not found then
      raise exception 'RECEIPT_LINE_NOT_FOUND';
    end if;
    if v_line.deal_id <> new.deal_id then
      raise exception 'RECEIPT_DEAL_MISMATCH: receipt.deal_id must match line.deal_id';
    end if;
    select coalesce(sum(amount), 0) into v_sum
      from public.deal_receipts where line_id = new.line_id;
    if v_line.status in ('draft','confirmed','invoiced')
       and v_sum >= v_line.supply_amount + v_line.vat_amount then
      update public.deal_revenue_lines
         set status = 'received',
             received_at = greatest(coalesce(received_at, new.received_on), new.received_on)
       where id = new.line_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger deal_receipts_recalc
  after insert on public.deal_receipts
  for each row execute function public.deal_receipts_after_insert();

-- 봉인 3: 라인 불변식 — received 전면 불변 / invoiced 후 금액·귀속 잠금 /
--         received 전환은 입금 합계 충족 시에만 / 입금 있는 라인 취소·삭제 금지
create or replace function public.deal_revenue_lines_enforce_seal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_receipts bigint;
begin
  if tg_op = 'DELETE' then
    if old.status in ('invoiced','received') then
      raise exception 'LINE_NO_DELETE: invoiced/received lines cannot be deleted';
    end if;
    select coalesce(sum(amount), 0) into v_receipts
      from public.deal_receipts where line_id = old.id;
    if v_receipts <> 0 then
      raise exception 'LINE_NO_DELETE: line has receipts';
    end if;
    return old;
  end if;

  if old.status = 'received' then
    raise exception 'LINE_RECEIVED_IMMUTABLE: corrections go to a new adjustment line';
  end if;

  if old.status = 'invoiced'
     and (new.supply_amount <> old.supply_amount
       or new.vat_amount <> old.vat_amount
       or new.quantity is distinct from old.quantity
       or new.unit_price is distinct from old.unit_price
       or new.deal_id <> old.deal_id) then
    raise exception 'LINE_INVOICED_AMOUNT_LOCKED: amounts are frozen after invoice issuance';
  end if;

  if new.status = 'received' and old.status <> 'received' then
    select coalesce(sum(amount), 0) into v_receipts
      from public.deal_receipts where line_id = new.id;
    if v_receipts < new.supply_amount + new.vat_amount then
      raise exception 'RECEIVED_REQUIRES_RECEIPTS: receipts total % below billed %',
        v_receipts, new.supply_amount + new.vat_amount;
    end if;
    new.received_at := coalesce(new.received_at, current_date);
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    select coalesce(sum(amount), 0) into v_receipts
      from public.deal_receipts where line_id = new.id;
    if v_receipts <> 0 then
      raise exception 'CANCEL_HAS_RECEIPTS: refund to zero before cancelling';
    end if;
  end if;

  return new;
end;
$$;
create trigger deal_revenue_lines_seal
  before update or delete on public.deal_revenue_lines
  for each row execute function public.deal_revenue_lines_enforce_seal();

-- 트리거 함수 직접 실행 차단(방어)
revoke execute on function public.deal_receipts_block_mutation() from public, anon, authenticated;
revoke execute on function public.deal_receipts_after_insert() from public, anon, authenticated;
revoke execute on function public.deal_revenue_lines_enforce_seal() from public, anon, authenticated;
