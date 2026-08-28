# 설계: 프로젝트 매출채권(받을 돈) — 거래처·계약조건·청구·입금 기록

> 상태: **rev1.2 — rev1.1 라이브 + 복수 품목 세금계산서 구조는 로컬 검증 완료·운영 배포 전** (rev1 대표 4결정 → PR #180 구현·배포 2026-08-27 → rev1.2 계약 1건·계산서 1건·품목 N건 구조)
> 관련 정본: `design-staff-settlement-pool.md`(풀 산식의 수주액 입력이 이 모듈의 출력이 됨) · `design-settlement-collection.md` · 메모리 `project_deetz_settlement.md` · 메모리 `project_unified_finance_control_plane.md`(전사 재무 통제면)
> 계기: 지급(보낼 돈)은 role·원장·출금·다계좌이체까지 구축됐지만, **받을 돈은 `project_finances.client_revenue` 정수 1칸이 전부**. 실측: ndolt1 구도워크스 3,080만(공급가 2,800만+VAT) 입금 완료 건이 deetz·ERP 어디에도 채권으로 없음, The SMC 챌린지(업로드 인원×7만, cap 200)는 ERP에 프로젝트조차 없음. "누구한테 얼마 받기로 했는지"를 경영지원실이 확인할 수 있는 시스템이 없다.
> 검증: 스키마·데이터 = deetz(wvfm…)·ERP(totalmanagement)·grigo-artist 운영 DB 실측(2026-08-27).

---

## 0. 화면 용어 정본 (rev1.1 — 국내 ERP·회계 관례, 대표 지시 2026-08-27)

> "딜·청구 라인" 같은 개발 용어를 쓰지 않는다. 화면·오류 문구는 아래 표준 용어만 사용한다.
> DB 식별자(테이블·컬럼·상태 코드)는 영어 원안 유지 — 표시 계층에서만 번역한다.

| 내부 개념(DB)                                                                           | 화면 표준 용어                                                                                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| deal (`project_client_deals`)                                                           | **계약** (수주) — 계약 등록/계약 수정                                                                     |
| revenue line (`deal_revenue_lines`)                                                     | **매출 항목** — 매출 등록/매출 저장                                                                       |
| tax invoice (`deal_tax_invoices`)                                                       | **세금계산서** — 한 번의 발행에 포함된 여러 매출 항목의 묶음                                              |
| receipt (`deal_receipts`)                                                               | **수금** — 수금 등록/수금 내역                                                                            |
| line_id 없는 수금                                                                       | **가수금** (매출 항목 미배정)                                                                             |
| outstanding                                                                             | **미수금**                                                                                                |
| due_date                                                                                | **수금 예정일**                                                                                           |
| payment_terms                                                                           | **결제 조건**                                                                                             |
| expected_supply_amount                                                                  | **계약금액 (공급가액)**                                                                                   |
| supply/vat/total                                                                        | **공급가액 / 부가세 / 합계금액** ("VAT" 표기 금지)                                                        |
| status: draft/confirmed/invoiced/received                                               | **미확정 / 매출 확정 / 계산서 발행 / 수금 완료**                                                          |
| line_type: base/installment/unit_billing/option/expense_rebill/revenue_share/adjustment | **용역 대금 / 계약금·잔금 / 인원(수량) 정산 / 추가 용역 / 실비 청구 / 매출 배분(RS) / 조정(차감·에누리)** |
| 콘솔 네비 라벨                                                                          | **매출·수금** (페이지 제목: 매출·수금 관리(받을 돈))                                                      |
| 처리 순서 안내                                                                          | ① 계약 등록 → ② 매출 확정 → ③ 세금계산서 발행 → ④ 수금 등록 (미수금·연체 자동)                            |

## 1. 대표 인터뷰 확정 사항 (2026-08-27, deep-interview)

| #   | 축        | 결정                                                                                                                                                                                  |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 정본 위치 | **deetz에 기록·수량산정·마진 담당(운영 원장) + ERP/전사 재무콘솔에는 읽기모델 투영(후속 자동화)**. grigo-artist `revenues`와 대칭. 8/12 전사 설계(운영 원장=BU, 중앙=읽기모델)와 부합 |
| 2   | 추적 범위 | **청구·입금까지** — 계약조건·확정액 + 세금계산서 발행일·지급기일·입금일·입금액·미수 잔액. Clobe **자동** 대사는 Phase 2(수동 tx 참조 기입은 지금부터)                                 |
| 3   | 입력·노출 | **경영지원실(admin) 전용.** 안무가 오너는 기존 `client_revenue` 수기 입력 수준 유지. 오너 개방(멀티테넌트)은 이번 범위 제외                                                           |
| 4   | 계약 유형 | 정액 / 단가×수량 / +α 옵션(기본) + **분할 지급(계약금/잔금) / 최소보장+초과 단가 / 실비 재청구 / 매출 배분(RS%)** 전부 수용                                                           |

---

## 2. 개념 모델

```
딜(project_client_deals) = 계약 1건: 거래처 + 조건(산식) + 근거(계약서/메일)
   │  1:N
청구 라인(deal_revenue_lines) = 채권 1건: 금액 확정 단위 (계약금/잔금/업로드 N건×단가/옵션/실비/정정)
   │  N:1                          상태: draft → confirmed → invoiced → received (cancelled)
세금계산서(deal_tax_invoices) = 실제 발행 문서 1건: 발행일 + 품목 합계 + 참조번호
   │  1:N
입금(deal_receipts) = 입금 사실 append-only (부분입금·합산입금·환불 음수)
```

- **의무(청구 라인)와 사실(입금)을 분리한다.** 계약서상 분할은 라인으로, 실제 돈은 receipts로. 부분입금·합산입금이 자연 표현된다.
- **금액 규약**: 라인의 `supply_amount`는 **공급가액(VAT 제외)**, `vat_amount` 별도. 풀·손익은 공급가 기준, 현금흐름은 supply+vat. (스태프 풀 금액 규약 1과 동일 — ndolt1은 입금 30,800,000이 아니라 공급가 28,000,000이 풀의 출발점.)
- **연체는 저장 상태가 아니라 계산**: `due_date < today AND status IN ('confirmed','invoiced')` → 화면에서 D+N 표시. (전사 재무 통제면 규격과 동일)
- **1 프로젝트 : N 딜 허용** — 같은 클라이언트라도 담당자·계약이 다르면 딜 분리(The SMC 사례: 200명 트랙과 원샷크루 트랙은 별개 실행 건. 단 원샷크루 트랙은 GRIGO 손익이라 deetz가 아닌 ERP 소관 — §6.3 경계).
- 딜이 프로젝트 없이 생기면 **가벼운 프로젝트 1행을 만들어 연결**한다(정산 배치=프로젝트 전례와 동일 패턴). `project_id`는 NOT NULL 유지.

### 계약 유형 → 스키마 매핑

| 유형           | 실사례                               | 딜 설정                                                            | 라인 표현                                                       |
| -------------- | ------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| 정액           | ndolt1 2,800만                       | `pricing_model='fixed'`                                            | `base` 1행 (분할이면 `installment` N행)                         |
| 단가×수량      | The SMC 7만×검수통과 업로드, cap 200 | `per_unit` + unit_price·unit_label·quantity_cap                    | 수량 확정 시 `unit_billing` (차수별 복수 가능)                  |
| 최소보장+초과  | (대비) 최소 100명 보장+초과 단가     | `min_guarantee_plus_unit` + quantity_min 또는 min_guarantee_amount | 보장분 `base` + 초과분 `unit_billing`                           |
| +α 옵션        | 2차 활용·광고 집행 별도 협의         | 모델 무관                                                          | `option` 라인 추가                                              |
| 분할 지급      | 계약금/잔금, 마일스톤                | 모델 무관 + payment_terms                                          | `installment` N행, 각자 due_date                                |
| 실비 재청구    | 교통비·의상비 전가                   | 모델 무관                                                          | `expense_rebill` (지급측 travel 정산행과 자연 상쇄 → 풀 영향 0) |
| 매출 배분(RS%) | (대비) 상대 매출의 N%                | `revenue_share` + revenue_share_pct·base 서술                      | 정산 주기마다 `revenue_share` 라인, 산정 근거 memo 필수         |
| 감액·정정      | 검수 미달 감액 등                    | —                                                                  | `adjustment` 음수 라인 (확정 라인은 불변, §4)                   |

---

## 3. 데이터 모델 (additive 5테이블 — 기존 공개 테이블 무변경)

⚠ 공통 원칙: **`projects` 등 공개 테이블에 컬럼을 추가하지 않는다**(client_revenue 컬럼 노출 사고 전례). 금액은 전부 신규 private 테이블. 신규 금액 컬럼은 전부 **bigint**(기존 integer 21억 한계 회피).

### 3.1 `client_parties` — 거래처 마스터

```sql
create table public.client_parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- 정식 상호 (예: 주식회사 더에스엠씨그룹)
  business_registration_number text,           -- 사업자번호 숫자 10자리 (하이픈 제거 저장)
  aliases text[] not null default '{}',        -- 검색 별칭 ("The SMC","theSMC" — SM C&C 혼동 방지)
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
```

- 자유텍스트 드리프트 방지(ERP `financial_entries.client_name`이 자유텍스트라 대사 불가한 것의 교훈). 마스터 미등록 상태에서도 딜은 만들 수 있게 딜에 스냅샷 이름을 둔다.
- ⚠ The SMC(더에스엠씨그룹, 331-87-00356) ≠ SM C&C — aliases에 명시해 혼동 차단.

### 3.2 `project_client_deals` — 딜(계약 단위)

```sql
create table public.project_client_deals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  client_party_id uuid references public.client_parties(id),
  client_name text not null,                   -- 표시명 스냅샷(마스터 없이도 기록 가능)
  contact_name text, contact_email text, contact_phone text,  -- 이 딜의 창구(같은 회사라도 딜마다 다름)
  pricing_model text not null check (pricing_model in
    ('fixed','per_unit','min_guarantee_plus_unit','revenue_share','composite')),
  -- per_unit / 최소보장 파라미터
  unit_price bigint,
  unit_label text,                             -- '검수 통과 업로드 1건'
  quantity_cap integer,
  quantity_min integer,
  min_guarantee_amount bigint,
  -- revenue share 파라미터
  revenue_share_pct numeric(5,2),
  revenue_share_base text,                     -- 산정 기준 서술(정본은 계약서)
  -- 공통
  expected_supply_amount bigint,               -- 예상 총액(공급가) — 검토·파이프라인용, 확정은 라인
  vat_mode text not null default 'vat_excluded'
    check (vat_mode in ('vat_excluded','vat_included','tax_free')),
  payment_terms text,                          -- '세금계산서 발행일부터 30일 이내' 등
  contract_signed_at date,
  contract_doc_url text,                       -- 계약서 파일/Drive 링크
  agreement_basis text,                        -- 'NAVER WORKS mailId=6228' / 'DM+유선(8/14)' — 서면 근거 추적
  status text not null default 'active'
    check (status in ('negotiating','active','completed','cancelled')),
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_client_deals_project_idx on public.project_client_deals(project_id);
```

- `negotiating` 딜도 기록 → 견적·제안 단계 파이프라인 가시성(부수 효과). 확정 전에는 라인을 만들지 않거나 draft로만.
- 계약 당사자 법인은 항상 (주)그리고엔터테인먼트(deetz=브랜드)이므로 컬럼으로 두지 않는다. 필요 시 memo.

### 3.3 `deal_tax_invoices` — 세금계산서 헤더(발행 문서 단위)

```sql
create table public.deal_tax_invoices (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.project_client_deals(id),
  issued_on date not null,
  due_date date,
  supply_amount bigint not null,
  vat_amount bigint not null default 0,
  external_reference text,                    -- 홈택스 승인번호·외부 참조번호
  document_url text,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- 계약을 쪼개지 않고 **계약 1건에 세금계산서 N건**을 둘 수 있다.
- 한 번 발행하는 여러 비용 구성은 **세금계산서 헤더 1건에 매출 항목 N개**로 연결한다.
- 발행 금액은 연결할 매출 항목 합계로 DB가 계산하며, 생성 후 금액·발행일·계약 연결은 불변이다.

### 3.4 `deal_revenue_lines` — 청구 라인(채권 단위)

```sql
create table public.deal_revenue_lines (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.project_client_deals(id),
  line_type text not null check (line_type in
    ('base','installment','unit_billing','option','expense_rebill','revenue_share','adjustment')),
  title text not null,                         -- '잔금', '업로드 61건 × 70,000', '교통비 실비'
  quantity numeric,                            -- 단가형만
  unit_price bigint,
  supply_amount bigint not null,               -- 공급가. adjustment만 음수 허용
  vat_amount bigint not null default 0,
  status text not null default 'draft'
    check (status in ('draft','confirmed','invoiced','received','cancelled')),
  due_date date,                               -- 지급예정일(연체 판정 기준)
  invoice_issued_at date,                      -- 세금계산서 발행일
  tax_invoice_id uuid references public.deal_tax_invoices(id),
  received_at date,                            -- 수납 완료일(트리거가 receipts 합계로 세팅)
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (line_type = 'adjustment' or supply_amount >= 0),
  check (line_type not in ('unit_billing') or (quantity is not null and unit_price is not null))
);
create index deal_revenue_lines_deal_idx on public.deal_revenue_lines(deal_id);
```

- 상태 의미: `draft` 금액 미확정 / `confirmed` 청구 가능 확정 / `invoiced` 세금계산서 발행 / `received` 수납 완료(receipts 합계 ≥ supply+vat) / `cancelled`.
- `received`는 앱이 아니라 **DB 트리거가 receipts 합계로 판정·전환**(§4) — 상태와 돈이 어긋나지 않게.
- 전사 재무 통제면의 받을 돈 상태 규격(draft→confirmed→invoiced→received→reconciled)과 1:1 — `reconciled`는 Clobe 자동 대사(Phase 2)에서 추가.

### 3.5 `deal_receipts` — 입금 기록 (append-only)

```sql
create table public.deal_receipts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.project_client_deals(id),
  line_id uuid references public.deal_revenue_lines(id),  -- null=미배부(콘솔 경고 표시)
  amount bigint not null check (amount <> 0),  -- 환불·회수는 음수
  received_on date not null,
  method text,                                 -- 'bank_transfer' 등
  clobe_tx_id text,                            -- Clobe transactionId 수동 기입(Phase 2 자동 매칭 키)
  memo text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index deal_receipts_line_idx on public.deal_receipts(line_id);
```

---

## 4. 보안·불변식 (지급측 봉인과 대칭)

1. **RLS**: 신규 5테이블 전부 `enable row level security` + **정책 0개(default-deny)**. 접근은 requireAdmin 서버액션(service-role)만. 오너·공동관리자·일반 사용자 노출 없음(결정 3).
2. **권한 회수**: `revoke insert, update, delete, truncate on <5테이블> from anon, authenticated;` — 지급측 교훈("상태만 봉인은 부족 — 테이블 권한까지").
3. **receipts는 append-only**: UPDATE·DELETE 차단 트리거. 교정 = 음수 receipt 추가.
4. **라인 봉인 트리거**:
   - `invoiced` 이후 `supply_amount`·`vat_amount`·`quantity`·`unit_price`·`deal_id` 불변(세금계산서 발행액과 괴리 방지). 정정은 `adjustment` 라인 또는 수정세금계산서+새 라인.
   - `received` 라인은 상태 포함 전면 불변·삭제 불가. `cancelled`는 receipts 합계 0일 때만 허용.
   - receipts insert 시 같은 트랜잭션에서 라인 합계 재계산 → `received` 전환·`received_at` 세팅(멱등).
5. **계산서 원자성**: 계산서 기록 RPC가 선택된 `confirmed` 항목을 잠그고 합계를 계산해 헤더 1건을 만든 뒤, 같은 트랜잭션에서 모두 `invoiced`로 전환한다. 일부 항목만 연결되는 중간 상태는 허용하지 않는다.
6. **감사**: created_by 기록. 금액 변경 이력이 필요해지면 Phase 2에서 append-only 이벤트 로그(전사 규격 `finance_payment_events`형) 추가 — MVP는 updated_at+불변식으로 충분.

---

## 5. 수량 확정 UX (단가×수량 딜)

- 운영 데이터 집계는 **제안값**으로만 표시하고 **확정 수량은 사람이 입력**한다. 근거: The SMC 실사례 — 인정 수량이 "검수 통과 업로드 수"로 상대와의 검수 시트 합의에서 나옴(제출 92 → 검수 62 → 최종 인정은 별도 확정). 자동 확정은 분쟁 시 방어 불가.
- 딜 상세에 후보 집계 나란히 표시: `event_participants checked_in 수` / 유효 정산행 수(role=dancer, not cancelled) / `project_submissions` 수. 각 값과 확정 입력값의 차이를 표시.
- 확정 → `unit_billing` 라인 생성(`quantity × unit_price`, cap 초과 시 경고). 차수 분할 청구 가능(라인 여러 개).
- `composite` 계약은 단가가 다른 수량 항목을 최대 20행까지 한 번에 입력하며, 행별 공급가액과 부가세 및 전체 합계를 즉시 미리 본다.
- 혼합 일괄 등록은 서버가 각 행의 `quantity × unit_price`와 VAT를 다시 계산하고, 기존 미취소 수량과 신규 수량 합계가 계약 상한을 넘으면 차단한다.
- `expected_supply_amount`가 있으면 매출 확정 공급가액 합계와 일치·부족·초과 여부를 계약 카드에서 즉시 표시한다.
- 하나의 세금계산서에 여러 매출 항목이 포함되면 발행일과 수금 예정일을 한 번 입력하고, 선택 항목 전부를 명시적인 세금계산서 헤더 1건에 묶는다.
- 발행 처리는 외부 세금계산서 발행을 대신하지 않으며, 실제 발행 완료 확인 체크가 있어야 기록할 수 있다.

---

## 6. 기존 시스템 연결

### 6.1 스태프 풀 수주액 (expand-contract)

- 현행: 풀의 수주액 = `project_finances.client_revenue`(수기, admin/오너 입력).
- 전환 규칙: **딜이 있는 프로젝트는 `sum(deal_revenue_lines.supply_amount where status in ('confirmed','invoiced','received'))`가 수주액**, 딜이 없으면 legacy `client_revenue` 사용(오너 테넌트 프로젝트는 당분간 후자).
- Phase A에서는 콘솔에 두 값을 나란히 표시(불일치 경고)만, Phase C에서 풀 화면 소스 교체. `client_revenue` 컬럼 제거는 별도 결정(오너 입력 경로가 남아 있으므로 서두르지 않음).
- `expense_rebill` 라인은 수주액에 포함 — 같은 금액이 지급측(role=travel 등)·실비에 잡혀 자연 상쇄되므로 풀 왜곡 없음.

### 6.2 ERP/전사 재무콘솔 투영 (Phase D — 인터페이스 계약만 먼저 고정)

- 방식: orchestrator **pull**(전사 통제면 1단계 방식). deetz는 outbox 없이 read 전용 집계 뷰 또는 서버 API 제공.
- 규격: `finance_obligations`(direction='receivable', source_system='deetz', source_id=line id=멱등키, 상대방=client_name/party, gross=supply, tax=vat, 예정일=due_date, 상태 매핑 1:1).
- ERP `financial_entries`에 이중 수기 입력하지 않는다(정본=deetz, 중앙=읽기모델 — 결정 1).

### 6.3 BU 경계

- 이 모듈은 **deetz 손익 건 전용**. 같은 클라이언트라도 GRIGO 손익 건(예: The SMC 원샷크루 공식계정 1편 100만)은 ERP/grigo 레일로 — 여기 넣지 않는다.
- 워크샵·비자 등 **B2C 결제**(Toss/PayPal, `workshop_event_orders`)는 별도 레일 유지 — 이 모듈은 B2B 채권만.

### 6.4 Clobe (Phase 2)

- MVP: `deal_receipts.clobe_tx_id` 수동 기입(입금 확인 시 Clobe에서 transactionId 복사).
- Phase 2: Clobe 입금 후보 자동 제안(금액·일자·거래처 매칭) → 확인 시 receipt 생성 + `reconciled` 상태 추가. 자동 확정은 고신뢰 1:1만(전사 규격).

---

## 7. 백필 (Phase A 완료 기준 = 실데이터 2건이 조회 가능)

1. **구도워크스프로덕션** party 생성 → ndolt1 딜(fixed, expected 28,000,000, vat_excluded, 계약서 링크) → `base` 라인(supply 28,000,000, vat 2,800,000, invoiced→received) → receipt(2026-08-10, 30,800,000, Clobe tx id는 백필 시 Clobe 조회로 확정 기입).
2. **더에스엠씨그룹(331-87-00356)** party → 챌린지 프로젝트(`gvfbdr`) 딜(per_unit 70,000, unit_label='검수 통과 업로드 1건', quantity_cap 200, vat_excluded, payment_terms='세금계산서 발행일부터 30일 이내', contract_doc_url=발송 계약서, agreement_basis='finance@ mailId=6228', status active). 라인은 최종 인정 인원 확정 시 `unit_billing` confirmed로.
3. 검증: 풀 화면 수주액 28,000,000 불변(딜 합계 일치), 콘솔에서 미수 잔액·연체 계산 정상, 기존 화면 회귀 0.
4. 백필 후보 추가 확인(대표): `bnsqgh`(연애프로그램 미션 댄스 티칭 — 지급 80만은 기록돼 있으나 수주액 미상) 등 과거 건 소급 범위.

---

## 8. 구현 순서 (배포 게이트)

| Phase | 내용                                                                                                                                   | 게이트                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A     | 마이그레이션(4테이블+RLS+봉인 트리거) + 백필 2건 + 검증                                                                                | additive·코드 무관 — 적용 후 `npm run db:types` |
| B     | 서버액션(`actions/receivables.ts`) + `/admin/finance/receivables` 콘솔(목록·딜 상세·라인·입금·수량 힌트) + AdminNav '정산' 그룹에 추가 | typecheck·lint·build·admin E2E → PR             |
| C     | 풀 화면 수주액 소스를 딜 합계로 교체(expand-contract)                                                                                  | 풀 파일럿(ndolt1) 금액 1원 일치 재검증          |
| D     | Clobe 대사 자동화 · ERP 투영(orchestrator pull) · 미수 D+N 경보(9시 디제스트 연동)                                                     | 별도 설계                                       |

---

## 9. 열린 질문

1. RS% 딜의 상대 매출 확인 절차(정산서 수취 → 라인 confirmed) — 실딜 발생 시 구체화.
2. 과거 건 소급 백필 범위(bnsqgh 등) — 대표 확인.
3. `negotiating` 딜을 파이프라인(영업) 뷰로 확장할지 — 이번 범위 밖, 컬럼은 준비됨.
4. 멀티테넌트 오너 개방 시 노출 재설계(딜 존재 자체가 영업기밀) — 결정 3에 따라 이번 범위 제외.
5. The SMC 챌린지 최종 인정 수량·청구 시점 — 운영 확정 대기(확정 시 unit_billing 라인 생성이 첫 실전 사용).
