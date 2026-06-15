-- 최소 정산레이어: 공고(프로젝트)×댄서 단위 확정 정산금액 + 출금신청 상태머신.
-- 흐름: 관리자/매니저가 세전 정산금액 등록(pending) → 댄서가 계좌 등록 후 출금신청(requested)
--       → 담당자가 실제 통장에서 이체 후 '이체 완료 처리'(paid). 앱은 금전 이체를 직접 하지 않고 기록만 한다.
-- 원천징수 3.3%는 표시·기록용 기본율(소득세 3% + 지방소득세 0.3%). 실제 세무처리는 담당자 오프라인.

-- 댄서 입금 계좌 (민감정보 → 기존 dancer_private_info에 합침: 본인+관리자만 RLS 접근)
alter table public.dancer_private_info
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text;

do $$ begin
  create type settlement_status as enum ('pending','requested','paid','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dancer_id uuid not null references public.dancers(id) on delete cascade,
  gross_amount integer not null check (gross_amount >= 0),         -- 세전 확정 정산금액 (원)
  withholding_rate numeric(5,4) not null default 0.0330            -- 원천징수율 (기본 3.3%)
    check (withholding_rate >= 0 and withholding_rate < 1),
  status settlement_status not null default 'pending',
  memo text,
  requested_at timestamptz,                                        -- 댄서 출금신청 시각
  paid_at timestamptz,                                             -- 담당자 이체완료 처리 시각
  paid_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, dancer_id)
);
create index if not exists settlements_project_idx on public.settlements(project_id);
create index if not exists settlements_dancer_idx on public.settlements(dancer_id);
create index if not exists settlements_status_idx on public.settlements(status);

-- updated_at 자동 갱신
create or replace function public.touch_settlements_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists settlements_touch_updated_at on public.settlements;
create trigger settlements_touch_updated_at
  before update on public.settlements
  for each row execute function public.touch_settlements_updated_at();

alter table public.settlements enable row level security;
grant select, insert, update, delete on public.settlements to authenticated;

-- 조회: 프로젝트 관리권한자(소유자·슈퍼관리자·공동관리자) 또는 본인 댄서.
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select using (
    public.can_manage_project(project_id) or public.can_act_as_dancer(dancer_id)
  );

-- 등록·수정·삭제(금액 관리): 프로젝트 관리권한자만.
-- (댄서의 출금신청 / 담당자의 이체완료 처리는 서버액션에서 service-role로 안전 게이트.)
drop policy if exists settlements_manage on public.settlements;
create policy settlements_manage on public.settlements
  for all using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));
