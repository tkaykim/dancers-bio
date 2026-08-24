-- 스태프 정산 풀 Phase 1c-i — 재무·수집코드 분리 + PII 토큰 + 불변식 보강 (additive)
-- 설계 정본: docs/design-staff-settlement-pool.md §3.4~§3.8
-- 배경(실측 결함): projects_select RLS 공개 분기 때문에 발행된 모든 프로젝트의
-- client_revenue·expense_amount·settlement_collect_code 가 전체 공개 컬럼이었다.
-- 구 projects 컬럼은 코드 전환·대사 후 별도 마이그레이션에서 드랍한다(1c-iii).

-- ── 1. project_finances — 수주액·실비 (owner/admin 전용) ────────────────────
create table if not exists public.project_finances (
  project_id uuid primary key references public.projects(id) on delete cascade,
  client_revenue integer,
  expense_amount integer not null default 0,
  -- Phase 1 게이트: admin이 켠 프로젝트만 오너에게 풀 화면 개방(설계 §4.3)
  staff_pool_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.project_finances enable row level security;

drop policy if exists project_finances_rw on public.project_finances;
create policy project_finances_rw on public.project_finances
  for all
  using (
    is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    is_admin()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

comment on table public.project_finances is
  '프로젝트 수주액(공급가)·비인건 실비 — 공개 projects에서 분리(노출 결함 수정). 교통비 등 인건은 settlements role 행';

insert into public.project_finances (project_id, client_revenue, expense_amount)
select id, client_revenue, coalesce(expense_amount, 0)
from public.projects
where client_revenue is not null or coalesce(expense_amount, 0) > 0
on conflict (project_id) do nothing;

-- ── 2. project_settlement_collections — 수집 링크 (열거 차단) ────────────────
create table if not exists public.project_settlement_collections (
  project_id uuid primary key references public.projects(id) on delete cascade,
  collect_code text unique not null,
  collection_open boolean not null default false,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.project_settlement_collections enable row level security;

drop policy if exists project_settlement_collections_rw on public.project_settlement_collections;
create policy project_settlement_collections_rw on public.project_settlement_collections
  for all
  using (is_admin() or can_manage_project(project_id))
  with check (is_admin() or can_manage_project(project_id));

insert into public.project_settlement_collections (project_id, collect_code, collection_open)
select id, settlement_collect_code, settlement_collection_open
from public.projects
where settlement_collect_code is not null
on conflict (project_id) do nothing;

-- ── 3. payee_collect_tokens — 일회성 수취인 PII 수집 토큰 (opaque, 1회용) ────
create table if not exists public.payee_collect_tokens (
  id uuid primary key default gen_random_uuid(),
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  token_hash text not null unique,        -- 원문 토큰은 저장하지 않는다(sha256 hex)
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.payee_collect_tokens enable row level security;
-- 정책 없음 = service-role 전용. anon/authenticated 직접 접근 전면 차단.
revoke all on table public.payee_collect_tokens from anon, authenticated;

-- ── 4. paid 봉인 확장 — role·tax_mode·vat 지급 후 불변 (설계 §3.8) ──────────
create or replace function public.settlements_paid_terminal()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'PAID_TERMINAL: 입금완료된 정산은 삭제할 수 없습니다(지급 이력 보존).';
    end if;
    if old.status = 'requested' then
      raise exception 'REQUESTED_NO_DELETE: 출금신청된 정산은 삭제할 수 없습니다. 정산 취소를 사용하세요.';
    end if;
    if old.status = 'pending' and old.gross_amount is not null and old.gross_amount > 0 then
      raise exception 'FUNDED_NO_DELETE: 금액이 확정된 정산은 바로 삭제할 수 없습니다. 먼저 취소하세요.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      raise exception 'PAID_ENTRY: 정산을 입금완료 상태로 생성할 수 없습니다.';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status = 'paid' and old.status is distinct from 'paid'
     and old.status <> 'requested' then
    raise exception 'PAID_ENTRY: 입금완료는 출금신청(requested) 상태에서만 전이할 수 있습니다.';
  end if;

  if old.status = 'paid' then
    if new.status is distinct from 'paid' then
      raise exception 'PAID_TERMINAL: 입금완료된 정산은 상태를 되돌릴 수 없습니다. 보정은 adjust 원장으로 하세요.';
    end if;
    if new.gross_amount is distinct from old.gross_amount
       or new.withholding_rate is distinct from old.withholding_rate
       or new.dancer_id is distinct from old.dancer_id
       or new.role is distinct from old.role
       or new.tax_mode is distinct from old.tax_mode
       or new.vat_amount is distinct from old.vat_amount
       or new.paid_by is distinct from old.paid_by
       or new.paid_at is distinct from old.paid_at then
      raise exception 'PAID_TERMINAL: 입금완료된 정산의 금액·귀속·역할·세무·지급 기록은 수정할 수 없습니다. 보정은 adjust 원장으로 하세요.';
    end if;
  end if;
  return new;
end;
$function$;

-- ── 5. 세무 스냅샷 가드 — 수취인 tax_mode와 불일치 차단 + 확정 후 role·tax 불변 ─
create or replace function public.settlements_guard_role_tax()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payee_mode text;
begin
  -- 확정(gross 有) 후에는 role·tax_mode 를 바꿀 수 없다 — 과거 풀·세무 재분류 차단.
  if tg_op = 'UPDATE'
     and old.gross_amount is not null and old.gross_amount > 0 then
    if new.role is distinct from old.role then
      raise exception 'ROLE_LOCKED: 금액이 확정된 정산의 역할(role)은 바꿀 수 없습니다. 취소 후 다시 등록하세요.';
    end if;
    if new.tax_mode is distinct from old.tax_mode then
      raise exception 'TAX_MODE_LOCKED: 금액이 확정된 정산의 세무 유형은 바꿀 수 없습니다. 취소 후 다시 등록하세요.';
    end if;
    -- 부가세는 미지급(pending) 상태에서만 수정 가능(금액 잠금 규칙과 동일).
    if new.vat_amount is distinct from old.vat_amount and old.status <> 'pending' then
      raise exception 'VAT_LOCKED: 출금신청·입금완료 건의 부가세는 수정할 수 없습니다.';
    end if;
  end if;

  -- 세무 스냅샷은 수취인 프로필과 일치해야 한다(프로필 없음 = withholding).
  if tg_op = 'INSERT'
     or new.tax_mode is distinct from old.tax_mode
     or new.dancer_id is distinct from old.dancer_id then
    select payee_tax_mode into v_payee_mode
    from public.dancer_private_info where dancer_id = new.dancer_id;
    if new.tax_mode <> coalesce(v_payee_mode, 'withholding') then
      raise exception 'TAX_MODE_MISMATCH: 수취인의 세무 유형(%)과 다릅니다. 개인/사업자는 별도 수취인으로 분리하세요.',
        coalesce(v_payee_mode, 'withholding');
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.settlements_guard_role_tax() from public, anon, authenticated;

drop trigger if exists settlements_guard_role_tax on public.settlements;
create trigger settlements_guard_role_tax
  before insert or update on public.settlements
  for each row execute function public.settlements_guard_role_tax();

-- ── 6. invoice 보류 — 세금계산서 수취 전 earn 은 출금가능잔액에서 제외 (§3.3) ─
create or replace function public.dancer_available_balance(p_dancer_id uuid)
returns bigint
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    coalesce((select sum(amount) from public.dancer_ledger_entries
              where dancer_id = p_dancer_id), 0)
    - coalesce((select sum(amount) from public.withdrawal_requests
                where dancer_id = p_dancer_id and status = 'requested'), 0)
    - coalesce((select sum(s.gross_amount - floor(s.gross_amount * s.withholding_rate))
                from public.settlements s
                where s.dancer_id = p_dancer_id
                  and s.status = 'requested'
                  and s.gross_amount is not null), 0)
    -- 사업자(invoice) 건은 세금계산서를 받기 전까지 출금 보류(earn은 있으나 가용 제외).
    - coalesce((select sum(s.gross_amount + s.vat_amount)
                from public.settlements s
                where s.dancer_id = p_dancer_id
                  and s.tax_mode = 'invoice'
                  and s.status = 'pending'
                  and s.gross_amount is not null and s.gross_amount > 0
                  and s.tax_invoice_received_at is null), 0);
$function$;

revoke all on function public.dancer_available_balance(uuid) from public, anon, authenticated;
