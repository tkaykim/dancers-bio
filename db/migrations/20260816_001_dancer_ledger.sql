-- 댄서 잔액 원장 (1단계: 기록·조회만, 사용처 없음)
--
-- 배경: 지금 settlements는 "1행 = 1지급" 전제라 잔액을 표현할 수 없다.
-- 앞으로 워크샵·빌리지·비자를 잔액으로 결제하고 부분 출금도 하려면
-- 적립/차감을 줄 단위로 쌓는 원장이 필요하다.
--
-- ⚠ 이 단계는 **기존 동작을 바꾸지 않는다**. 현재 상태를 그대로 미러링만 하며,
--   잔액 = 기존 화면의 '출금 가능 금액'과 정확히 같아야 한다(대사로 검증).
--
-- ⚠ 세무 주의: 잔액을 자사 서비스 결제에 쓰기 시작하는 단계(spend 도입)에서는
--   "지급 시점"이 이체가 아니라 적립 시점이 되므로 원천징수 시점 재검토가 필요하다.
--   이 마이그레이션은 그 결정을 하지 않는다 — 금액은 이미 세후(net)로만 적립한다.

create table if not exists public.dancer_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  dancer_id uuid not null references public.dancers(id) on delete cascade,

  -- earn=적립(정산 확정) / withdraw=출금(실제 이체) / spend=자사 서비스 결제
  -- refund=결제 취소 환급 / adjust=담당자 보정
  entry_type text not null
    check (entry_type in ('earn', 'withdraw', 'spend', 'refund', 'adjust')),

  -- 부호 포함 금액(원). earn·refund는 양수, withdraw·spend는 음수, adjust는 양쪽.
  -- 잔액 = sum(amount).
  amount bigint not null,

  -- 출처 추적 — 어떤 정산/예약에서 나온 줄인지.
  ref_type text,
  ref_id uuid,

  memo text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 부호 규칙을 DB에서 강제 — 앱 실수로 적립이 음수가 되는 사고를 막는다.
alter table public.dancer_ledger_entries
  drop constraint if exists dancer_ledger_amount_sign;
alter table public.dancer_ledger_entries
  add constraint dancer_ledger_amount_sign check (
    (entry_type in ('earn', 'refund') and amount > 0)
    or (entry_type in ('withdraw', 'spend') and amount < 0)
    or (entry_type = 'adjust' and amount <> 0)
  );

-- 멱등성: 같은 출처에서 같은 종류의 줄은 하나만.
-- (정산 paid 처리가 두 번 호출돼도 출금이 두 번 잡히지 않게)
create unique index if not exists dancer_ledger_ref_uniq
  on public.dancer_ledger_entries (ref_type, ref_id, entry_type)
  where ref_type is not null and ref_id is not null;

create index if not exists dancer_ledger_dancer_idx
  on public.dancer_ledger_entries (dancer_id, created_at desc);

comment on table public.dancer_ledger_entries is
  '댄서 잔액 원장. 잔액=sum(amount). 금액은 항상 세후(실수령) 기준.';

-- ── RLS ───────────────────────────────────────────────────────────────
alter table public.dancer_ledger_entries enable row level security;

-- 본인 것만 조회. 쓰기는 서버 액션(service-role)에서만 — 잔액은 사용자가 만들 수 없다.
drop policy if exists dancer_ledger_select_own on public.dancer_ledger_entries;
create policy dancer_ledger_select_own on public.dancer_ledger_entries
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.dancers d
      where d.id = dancer_ledger_entries.dancer_id
        and d.profile_id = (select auth.uid())
    )
  );

-- ── 잔액 조회 ─────────────────────────────────────────────────────────
create or replace function public.dancer_balance(p_dancer_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(amount), 0)::bigint
  from public.dancer_ledger_entries
  where dancer_id = p_dancer_id;
$$;

comment on function public.dancer_balance(uuid) is
  '댄서 현재 잔액(원, 세후). RLS를 그대로 타므로 본인·관리자만 값을 얻는다.';
