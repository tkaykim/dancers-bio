-- 구글폼 흡수 = deetz 멀티테넌트 정산 MVP
-- 적용: Supabase MCP apply_migration (prod 적용 완료 2026-06-28). 이 파일은 정본 기록.
-- 설계: docs/design-settlement-collection.md

-- 1) projects: 댄서 지급정보 셀프 수집 링크 + (수익 레이어) 수주액·실비
alter table public.projects
  add column if not exists settlement_collect_code text unique,
  add column if not exists settlement_collection_open boolean not null default false,
  add column if not exists client_revenue integer,
  add column if not exists expense_amount integer;

comment on column public.projects.settlement_collect_code is '댄서 지급정보 셀프 수집 링크 코드 (/settle/<code>)';
comment on column public.projects.settlement_collection_open is '수집 링크 활성화 여부 (false=마감, 제출 거부)';
comment on column public.projects.client_revenue is '클라이언트 수주액(원) — 마진 계산용';
comment on column public.projects.expense_amount is '실비(원) — 마진 계산용';

-- 2) 수집 코드 생성기 (기존 gen_project_survey_code 미러, 혼동없는 7자리)
create or replace function public.gen_project_settlement_collect_code(p_len integer default 7)
returns text language plpgsql as $$
declare
  alphabet text := '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..p_len loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    perform 1 from public.projects where settlement_collect_code = code;
    if not found then
      return code;
    end if;
  end loop;
end $$;

-- 3) settlements: 셀프 제출 출처 + 금액 미정 허용(셀프제출 시점엔 소유자가 금액 미입력) + 멱등(중복입력 방지)
alter table public.settlements
  add column if not exists origin text not null default 'manager'
    check (origin in ('manager','self_collected'));
comment on column public.settlements.origin is 'manager=매니저가 생성 / self_collected=댄서가 수집링크로 셀프 제출';

alter table public.settlements alter column gross_amount drop not null;

create unique index if not exists settlements_project_dancer_uniq
  on public.settlements(project_id, dancer_id);
