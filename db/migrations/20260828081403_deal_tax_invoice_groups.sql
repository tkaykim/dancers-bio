-- 세금계산서 1건에 복수 매출 항목을 묶는 명시적 헤더.
-- 계약(project_client_deals) 1건 → 세금계산서(deal_tax_invoices) N건 → 매출 항목 N건.

create table public.deal_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.project_client_deals(id),
  issued_on date not null,
  due_date date,
  supply_amount bigint not null,
  vat_amount bigint not null default 0,
  external_reference text,
  document_url text,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deal_tax_invoices_deal_idx
  on public.deal_tax_invoices(deal_id, issued_on desc);

create unique index deal_tax_invoices_external_reference_uniq
  on public.deal_tax_invoices(deal_id, external_reference)
  where external_reference is not null;

alter table public.deal_revenue_lines
  add column tax_invoice_id uuid references public.deal_tax_invoices(id);

create index deal_revenue_lines_tax_invoice_idx
  on public.deal_revenue_lines(tax_invoice_id)
  where tax_invoice_id is not null;

alter table public.deal_tax_invoices enable row level security;
revoke all on public.deal_tax_invoices from anon, authenticated;
grant select, insert, update, delete on public.deal_tax_invoices to service_role;

create trigger deal_tax_invoices_touch_updated
  before update on public.deal_tax_invoices
  for each row execute function public.set_updated_at();

-- 기존 received 라인의 최초 세금계산서 연결만 허용하면서 이후에는 다시 봉인한다.
create or replace function public.deal_revenue_lines_enforce_seal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_receipts bigint;
  v_invoice_deal uuid;
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

  if old.tax_invoice_id is not null
     and new.tax_invoice_id is distinct from old.tax_invoice_id then
    raise exception 'LINE_TAX_INVOICE_IMMUTABLE: invoice grouping cannot be changed';
  end if;

  if old.tax_invoice_id is not null
     and new.status = 'cancelled'
     and old.status <> 'cancelled' then
    raise exception 'INVOICE_LINE_NO_CANCEL: issue a correction tax invoice';
  end if;

  if new.tax_invoice_id is not null then
    select deal_id into v_invoice_deal
      from public.deal_tax_invoices where id = new.tax_invoice_id;
    if v_invoice_deal is null or v_invoice_deal <> new.deal_id then
      raise exception 'LINE_TAX_INVOICE_DEAL_MISMATCH';
    end if;
  end if;

  if old.status = 'received' then
    if old.tax_invoice_id is null
       and new.tax_invoice_id is not null
       and new.status = old.status
       and new.deal_id = old.deal_id
       and new.line_type = old.line_type
       and new.title = old.title
       and new.quantity is not distinct from old.quantity
       and new.unit_price is not distinct from old.unit_price
       and new.supply_amount = old.supply_amount
       and new.vat_amount = old.vat_amount
       and new.due_date is not distinct from old.due_date
       and new.invoice_issued_at is not distinct from old.invoice_issued_at
       and new.received_at is not distinct from old.received_at
       and new.memo is not distinct from old.memo then
      return new;
    end if;
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

  if new.status = 'invoiced' and new.tax_invoice_id is null then
    raise exception 'INVOICED_REQUIRES_TAX_INVOICE: use a tax invoice group';
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

-- 기존 발행·수금 완료 라인은 거래처 계약과 발행일별로 헤더를 1건씩 소급 생성한다.
insert into public.deal_tax_invoices (
  deal_id,
  issued_on,
  due_date,
  supply_amount,
  vat_amount,
  memo
)
select
  deal_id,
  invoice_issued_at,
  min(due_date),
  sum(supply_amount),
  sum(vat_amount),
  '기존 매출 항목에서 자동 소급 생성'
from public.deal_revenue_lines
where status in ('invoiced','received')
  and invoice_issued_at is not null
group by deal_id, invoice_issued_at;

update public.deal_revenue_lines line
set tax_invoice_id = invoice.id
from public.deal_tax_invoices invoice
where line.tax_invoice_id is null
  and line.status in ('invoiced','received')
  and line.invoice_issued_at = invoice.issued_on
  and line.deal_id = invoice.deal_id
  and invoice.memo = '기존 매출 항목에서 자동 소급 생성';

alter table public.deal_revenue_lines
  add constraint deal_lines_invoice_group_required
  check (status not in ('invoiced','received') or tax_invoice_id is not null)
  not valid;

alter table public.deal_revenue_lines
  validate constraint deal_lines_invoice_group_required;

create or replace function public.deal_tax_invoices_enforce_seal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'TAX_INVOICE_NO_DELETE: issued tax invoices are immutable';
  end if;

  if new.deal_id <> old.deal_id
     or new.issued_on <> old.issued_on
     or new.due_date is distinct from old.due_date
     or new.supply_amount <> old.supply_amount
     or new.vat_amount <> old.vat_amount then
    raise exception 'TAX_INVOICE_FINANCIALS_IMMUTABLE: issue a correction invoice';
  end if;

  return new;
end;
$$;

create trigger deal_tax_invoices_seal
  before update or delete on public.deal_tax_invoices
  for each row execute function public.deal_tax_invoices_enforce_seal();

-- 선택한 매출 확정 항목들을 한 트랜잭션에서 세금계산서 1건으로 묶는다.
create or replace function public.record_deal_tax_invoice(
  p_deal_id uuid,
  p_line_ids uuid[],
  p_issued_on date,
  p_due_date date,
  p_created_by uuid default null,
  p_external_reference text default null,
  p_memo text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_requested_count integer;
  v_line_count integer;
  v_supply bigint;
  v_vat bigint;
begin
  if p_due_date is not null and p_due_date < p_issued_on then
    raise exception 'TAX_INVOICE_DUE_BEFORE_ISSUE';
  end if;

  v_requested_count := coalesce(cardinality(p_line_ids), 0);
  if v_requested_count = 0 then
    raise exception 'TAX_INVOICE_LINES_REQUIRED';
  end if;

  if (select count(distinct id) from unnest(p_line_ids) as ids(id)) <> v_requested_count then
    raise exception 'TAX_INVOICE_DUPLICATE_LINES';
  end if;

  perform 1 from public.project_client_deals where id = p_deal_id for update;
  if not found then
    raise exception 'TAX_INVOICE_DEAL_NOT_FOUND';
  end if;

  perform 1
  from public.deal_revenue_lines
  where id = any(p_line_ids)
    and deal_id = p_deal_id
  for update;

  select count(*), sum(supply_amount), sum(vat_amount)
    into v_line_count, v_supply, v_vat
  from public.deal_revenue_lines
  where id = any(p_line_ids)
    and deal_id = p_deal_id
    and status = 'confirmed'
    and tax_invoice_id is null;

  if v_line_count <> v_requested_count then
    raise exception 'TAX_INVOICE_LINES_NOT_CONFIRMABLE';
  end if;

  insert into public.deal_tax_invoices (
    deal_id,
    issued_on,
    due_date,
    supply_amount,
    vat_amount,
    external_reference,
    memo,
    created_by
  ) values (
    p_deal_id,
    p_issued_on,
    p_due_date,
    v_supply,
    v_vat,
    nullif(btrim(p_external_reference), ''),
    nullif(btrim(p_memo), ''),
    p_created_by
  ) returning id into v_invoice_id;

  update public.deal_revenue_lines
  set
    tax_invoice_id = v_invoice_id,
    status = 'invoiced',
    invoice_issued_at = p_issued_on,
    due_date = p_due_date
  where id = any(p_line_ids);

  return v_invoice_id;
end;
$$;

revoke execute on function public.deal_tax_invoices_enforce_seal() from public, anon, authenticated;
revoke execute on function public.record_deal_tax_invoice(uuid, uuid[], date, date, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_deal_tax_invoice(uuid, uuid[], date, date, uuid, text, text) to service_role;
