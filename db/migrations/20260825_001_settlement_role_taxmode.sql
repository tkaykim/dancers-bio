-- 스태프 정산 풀 Phase 1a — additive 스키마 (설계 정본: docs/design-staff-settlement-pool.md §3)
-- ⚠ 유니크 (project,dancer)→(project,dancer,role) 교체는 이 파일에 없다.
--   role 인지 코드가 전면 배포·drain된 뒤 별도 마이그레이션(20260825_002)으로 적용한다(§8 1b).

-- ── settlements: 역할 차원 + 세무 스냅샷 ───────────────────────────────────
alter table public.settlements
  add column if not exists role text not null default 'dancer'
    constraint settlements_role_check
    check (role in ('dancer','travel','staff','referral','other'));

alter table public.settlements
  add column if not exists tax_mode text not null default 'withholding'
    constraint settlements_tax_mode_check
    check (tax_mode in ('withholding','invoice'));

-- invoice(사업자) 건: 원천 0%, 부가세는 별도 컬럼(지급액 = gross + vat_amount).
-- 풀 차감은 공급가(gross) 기준 — 부가세는 매입세액공제로 회수되므로 비용이 아니다.
alter table public.settlements
  add column if not exists vat_amount integer not null default 0
    constraint settlements_vat_nonnegative check (vat_amount >= 0),
  add column if not exists tax_invoice_received_at timestamptz;

alter table public.settlements
  add constraint settlements_invoice_zero_rate
    check (tax_mode <> 'invoice' or withholding_rate = 0),
  add constraint settlements_withholding_no_vat
    check (tax_mode = 'invoice' or vat_amount = 0);

comment on column public.settlements.role is
  '지급 성격: dancer(출연료)·travel(교통/연습비)=직접비, staff(운영/현장 인건)·referral(소개비)=풀 분배, other=예외';
comment on column public.settlements.tax_mode is
  '수취인 세무 프로필 스냅샷(확정 시 복사, 이후 불변): withholding=3.3% 원천, invoice=사업자(세금계산서·부가세 별도)';
comment on column public.settlements.vat_amount is
  'invoice 건 부가세(원). 실지급 = gross_amount + vat_amount. 풀 차감은 gross_amount(공급가)만';

-- ── 수취인 세무 프로필 (비공개 저장소 확장 — 기존 RLS 체계 그대로) ─────────
alter table public.dancer_private_info
  add column if not exists payee_tax_mode text not null default 'withholding'
    constraint dancer_private_info_payee_tax_mode_check
    check (payee_tax_mode in ('withholding','invoice')),
  add column if not exists business_registration_number text;

comment on column public.dancer_private_info.payee_tax_mode is
  '수취인 단위 고정 세무 유형. 개인(3.3%)과 사업자는 별도 수취인 레코드로 분리 — 원장 혼합 버킷 차단';

-- ── 원장 미러: invoice 건은 earn = gross + vat (이체될 현금 기준) ────────────
-- 기존 함수(20260817_001 계열)와 동일하되 v_net 계산에 tax_mode 분기만 추가.
-- withholding 행은 vat_amount=0 제약이라 기존 동작과 완전 동일(무해 변경).
create or replace function public.settlements_mirror_ledger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row settlements;
  v_net bigint;
  v_counts boolean;
  v_h1 int;
  v_h2 int;
begin
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtext(old.dancer_id::text));
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = old.id
       and entry_type in ('earn','withdraw');
    return old;
  end if;

  v_row := new;

  if tg_op = 'UPDATE' and old.dancer_id is distinct from new.dancer_id then
    v_h1 := hashtext(old.dancer_id::text);
    v_h2 := hashtext(new.dancer_id::text);
    perform pg_advisory_xact_lock(least(v_h1, v_h2));
    if v_h1 <> v_h2 then
      perform pg_advisory_xact_lock(greatest(v_h1, v_h2));
    end if;
  else
    perform pg_advisory_xact_lock(hashtext(v_row.dancer_id::text));
  end if;

  v_counts := v_row.gross_amount is not null
              and v_row.gross_amount > 0
              and v_row.status <> 'cancelled';

  if not v_counts then
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = v_row.id
       and entry_type in ('earn','withdraw');
    return null;
  end if;

  if v_row.tax_mode = 'invoice' then
    -- 사업자 지급: 원천 0, 부가세 포함 전달(대표 확정 2026-08-25).
    v_net := v_row.gross_amount + coalesce(v_row.vat_amount, 0);
  else
    v_net := v_row.gross_amount - floor(v_row.gross_amount * v_row.withholding_rate)::bigint;
  end if;

  insert into public.dancer_ledger_entries
    (dancer_id, entry_type, amount, ref_type, ref_id, memo)
  values (v_row.dancer_id, 'earn', v_net, 'settlement', v_row.id, '정산 금액 확정')
  on conflict (ref_type, ref_id, entry_type)
    where ref_type is not null and ref_id is not null
  do update set amount = excluded.amount, dancer_id = excluded.dancer_id;

  if v_row.status = 'paid' then
    insert into public.dancer_ledger_entries
      (dancer_id, entry_type, amount, ref_type, ref_id, memo, created_by)
    values (v_row.dancer_id, 'withdraw', -v_net, 'settlement', v_row.id,
            '출금(이체 완료)', v_row.paid_by)
    on conflict (ref_type, ref_id, entry_type)
      where ref_type is not null and ref_id is not null
    do update set amount = excluded.amount, dancer_id = excluded.dancer_id,
                  created_by = excluded.created_by;
  else
    delete from public.dancer_ledger_entries
     where ref_type = 'settlement' and ref_id = v_row.id and entry_type = 'withdraw';
  end if;

  return null;
end;
$function$;

-- 트리거 감시 컬럼에 tax_mode·vat_amount 추가 (수정 시 원장 재미러).
drop trigger if exists settlements_mirror_ledger on public.settlements;
create trigger settlements_mirror_ledger
  after insert or delete or update of status, gross_amount, withholding_rate, dancer_id, tax_mode, vat_amount
  on public.settlements
  for each row execute function public.settlements_mirror_ledger();
