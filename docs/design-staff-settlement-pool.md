# 설계: 스태프·매니저 정산 풀 — 프로젝트 풀 → 역할별 분배

> 상태: **rev4 착수 승인 (2026-08-25 대표)** — rev3 합의본에 대표 승인 반영: ① 소개비=3.3% 확정 ② 사업자 건 부가세 포함 지급 규약 추가(§3.3) ③ 대표 확인 3건(합산 불변식·매니저 직접비 합계 노출·Phase 1 owner 게이트) 승인 ④ RLS 변경은 기존 동작 회귀 없이(§4.4)
> 관련 정본: `design-settlement-collection.md`(rev3, 댄서 셀프수집·멀티테넌트 기반) · 메모리 `project_deetz_settlement.md`
> 계기: ndolt1(알파드라이브원) 정산에서 댄서 지급은 시스템이 처리했지만 스태프비(정현수·김주성)·소개비(엄태웅)·회사 유보는 전부 시스템 밖 수기 계산이었다. 이 층을 시스템 안으로 넣는다.
> 검증: 스키마·RLS·트리거·RPC·라이브 데이터 = 운영 DB 실측(2026-08-25) / 코드 지점 = Claude·Codex 이중 확인(파일:줄 대조).

---

## 1. 대표 인터뷰 확정 사항 (2026-08-25, deep-interview 2라운드)

| # | 축 | 결정 |
|---|---|---|
| 1 | 적용 범위 | **1단계 내부**(deetz/그리고엔터 운영 프로젝트) 완성 → **2단계 테넌트 오너**(안무가·팀)에게 같은 풀 기능 개방. Phase 1의 오너 풀 접근은 admin이 켠 프로젝트만(`staff_pool_enabled` 게이트) |
| 2 | 풀 산정 | **마진 풀 자동 가시화 + 분배 금액은 수기 확정.** 비율은 추천 템플릿(표시만) — 자동 분배 없음 |
| 3 | 겸직 | **댄서이면서 스태프인 사람 지원 필수** (한 프로젝트에 출연료 행 + 스태프비 행 공존) |
| 4 | 스태프 여정 | **혼합** — 반복 참여 스태프는 댄서와 동일한 셀프서비스(계정·잔액·출금신청), 일회성 수취인(소개자 등)은 백오피스 처리 |
| 5 | 가시성 | **본인 몫만.** 풀·수주액·회사 유보 = 프로젝트 **owner 또는 admin** 전용(공동관리자 제외). 매니저·스태프는 본인 정산만 |
| 6 | 확정 권한 | **대표 단독 확정**(내부 단계). 테넌트 단계에서는 오너가 자기 프로젝트 확정 |
| 7 | 세금 | **기본 3.3% 원천징수 + 사업자(세금계산서 수취) 옵션 필수.** tax_mode는 수취인 단위 고정(§3.3) |
| 8 | 회사 몫 | **잔여 = 회사 유보 자동 표시** (입력 라인 아님, 풀 − 분배 합계) |

---

## 2. 개념 모델

```
클라이언트 수주액 (공급가액, 부가세 별도)
   │
   ├─ 직접비  ──────────────  댄서 출연료(role=dancer) + 교통비(role=travel) + 비인건 실비(project_finances.expense_amount)
   │
   ▼
분배 가능 풀(pool) = 수주액 − 직접비
   │
   ├─ 분배  ────────────────  스태프비(role=staff) + 소개비(role=referral)   ← 수기 확정
   │
   ▼
회사 유보 = 풀 − 분배 합계   ← 자동 계산, 입력 없음
```

- **금액 규약 1**: 수주액(`client_revenue`)은 **공급가액(부가세 제외)**. ndolt1 기준 — 입금 30,800,000이 아니라 공급가 28,000,000이 출발점. 부가세는 납부분이라 풀이 아니다.
- **금액 규약 2**: `expense_amount`는 **비인건 실비만**(대관·물품 등). 사람에게 나가는 돈(교통비 포함)은 전부 role 있는 정산행 — 이중차감 방지. (운영 실측: `expense_amount>0` 프로젝트 현재 0건 — 기존 데이터 정합 문제 없음.)
- **집계 규약**: `status='cancelled'`만 제외하고 pending·requested·paid 전부 포함(확정된 비취소 채무 = 비용). role별 합계는 `coalesce(sum(...) filter (...), 0)`.
- **모든 지급 단위는 기존 그대로 `settlements` 1행** — 풀은 별도 원장이 아니라 role별 집계다. 돈의 진실은 계속 `dancer_ledger_entries`(세후) 하나.
- 파일럿 = ndolt1: 28,000,000 − (댄서 22,000,000 + 이원영 300,000 + 교통비 미정) = 풀 5,700,000 − 교통비 → 정현수 2,000,000 · 김주성 1,000,000 · 엄태웅 500,000 · 회사 유보 = 잔여.

---

## 3. 데이터 모델 (additive)

### 3.1 `settlements.role` — 역할 차원

```sql
alter table public.settlements
  add column role text not null default 'dancer'
    check (role in ('dancer','travel','staff','referral','other'));
```

- `dancer` 출연료(직접비) / `travel` 교통·연습비(직접비) / `staff` 운영·현장 인건(분배) / `referral` 소개비(분배) / `other` 예외.
- **백필**: 전 행 default `dancer` → ndolt1의 gross null·self_collected 수집 행(교통비 대상) `travel`, 이원영 300,000 행 `staff`.
- `settlements_mirror_ledger`는 `UPDATE OF status, gross_amount, withholding_rate, dancer_id`에만 발화(실측) → role 백필 UPDATE는 원장 부작용 없음.
- **role은 첫 gross 확정 이후 불변**(§3.8 봉인) — 지급·확정 후 재분류로 과거 풀이 바뀌는 것 차단.

### 3.2 겸직 지원 — 유니크 제약 확장 + 합산 불변식

현행 `(project_id, dancer_id)` 유니크가 동일 정의로 2개 실재(인덱스 `settlements_project_dancer_uniq` + 제약 `settlements_project_id_dancer_id_key`, 실측). 둘 다 내리고:

```sql
create unique index settlements_project_dancer_role_uniq
  on public.settlements(project_id, dancer_id, role);
```

- 효과: 출연료+스태프비 겸직, 주승현·박민정형 "교통비+출연료 한 행 합산" 문제의 구조적 해소.
- **합산 불변식(⏳ 대표 확인 대기)**: 한 프로젝트 × 한 수취인 × 한 role = **1행 합산**(복수 내역은 memo). 같은 role 세분 라인(`allocation_kind`)은 실수요 확인 후 Phase 2.
- **취소행 정책**: 유니크는 cancelled 행에도 걸리므로, 같은 사람·role 재등록은 신규 insert가 아니라 **cancelled 행 재활성(pending 복귀)** — 기존 `addSettlementDancerAction` 재활성 패턴을 role 인지로 확장.
- ⚠ 핵심 위험(교차검증 수렴): 제약 교체는 한 트랜잭션이면 구 코드(default 'dancer')의 셀프제출 멱등을 계속 보장한다. 진짜 위험은 **staff/referral 행이 생긴 뒤** 구 코드의 `(project_id,dancer_id).maybeSingle()`이 다중행 오류·오행 수정을 내는 것 → **배포 순서(§8)가 방어선**: role 인지 코드 전면 배포 후에만 유니크 교체·staff 쓰기 활성화.

### 3.3 세금 — tax_mode는 **수취인 단위 고정**, 정산행에는 불변 스냅샷

- **혼합 버킷 차단**: 원천징수(3.3%) 잔액과 invoice 잔액이 한 원장에 섞이면 출금이 어느 돈인지 판별 불가 → **한 수취인 레코드 = 한 tax_mode**. 개인 김주성(3.3%)과 김주성의 사업자는 **별도 수취인 레코드**. 출금 FIFO/버킷 설계 자체를 회피.
- settlement 확정 시 수취인 tax_mode를 `settlements.tax_mode`로 복사하고, **불일치 insert/update는 DB 트리거로 차단**. 스냅샷은 첫 gross 확정 이후 불변.
- invoice: 원천 0%(`check (tax_mode <> 'invoice' or withholding_rate = 0)`). **부가세 규약(대표 확정 2026-08-25)**: `gross_amount`=공급가액, `vat_amount`(신설, 기본 gross×10%, 면세 업체는 0 수정 가능) — **실지급(이체액) = gross + vat_amount(부가세 포함 전달)**, 원장 earn도 gross+vat(이체될 현금 기준). **풀 차감은 gross(공급가)만** — 부가세는 매입세액공제로 회수되는 돈이라 비용이 아니다.
- **invoice 보류(hold) 규칙**: `tax_invoice_received_at`(settlements 컬럼, 세금계산서 건별 수취 확인) 이전에는 해당 earn을 **출금가능잔액에서 제외**(`dancer_available_balance` 확장). 수취 완료분·미수취분 공존 시 allocation 없이 부분 출금을 통제하기 위함.
- 기타소득 8.8%(소개비)는 세무사 확인 후 rate 값 추가로 수용 가능한 구조 — 이번 범위 제외.

### 3.4 수취인 세무 프로필 (`dancer_private_info` 확장)

```sql
alter table public.dancer_private_info
  add column payee_tax_mode text not null default 'withholding'
    check (payee_tax_mode in ('withholding','invoice')),
  add column business_registration_number text;   -- invoice 수취인만
```

- 비공개 저장(기존 dancer_private_info RLS 체계 그대로 — service_role 전용 조회 유지).
- invoice 수취인의 지급정보 검증은 주민번호 대신 사업자번호(§5.3).

### 3.5 `project_finances` — 금액 컬럼을 공개 테이블에서 분리 (🚨 기존 결함 수정)

**실측 결함**: `projects_select` RLS의 `status <> 'draft' AND deleted_at IS NULL` 공개 분기 때문에, **발행된 모든 프로젝트의 `client_revenue`·`expense_amount`가 컬럼 조회로 전체 공개**(RLS는 행 단위라 컬럼을 못 가림). 이 기획과 무관하게 지금도 새는 중.

```sql
create table public.project_finances (
  project_id uuid primary key references projects(id) on delete cascade,
  client_revenue integer,
  expense_amount integer not null default 0,
  updated_at timestamptz not null default now()
);
-- RLS select/update: (해당 프로젝트 owner_id = auth.uid()) OR is_admin()  ← 공동관리자 제외
```

- `setProjectFinanceAction`은 service-role 업데이트가 아니라 **사용자 클라이언트 + 이 RLS**로 전환(심층방어).
- 구 컬럼은 백필·대사 후 expand-contract로 제거(§8 1c-iii) — Phase 1 종료까지는 deprecated로 남겨도 됨.

### 3.6 수집 링크 저장소 분리 (`project_settlement_collections`)

**실측 결함(교차검증 발견)**: `settlement_collect_code`·`collection_open`도 공개 projects 행의 컬럼이라 **코드 열거 가능** → 초대받지 않은 로그인 사용자가 열린 프로젝트에 본인 정산행을 제출 가능(제출 액션은 로그인+코드만 검증, 실측). 공유 링크의 의미는 "받은 사람이 접근"이지 "전체 공개 열거"가 아니다.

```sql
create table public.project_settlement_collections (
  project_id uuid primary key references projects(id) on delete cascade,
  collect_code text unique not null,
  collection_open boolean not null default false,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
-- RLS: owner OR is_admin. 공개 페이지(/settle/[code])와 제출 액션은 이미 service-role code lookup(실측)이라 구조 유지.
```

- 코드 회전(rotation) 지원 — 유출 시 재발급.

### 3.7 일회성 PII 수집 토큰 (`payee_collect_tokens`)

- 기존 `/fit` HMAC 토큰은 **만료·nonce·소비 상태가 없는 결정적 토큰**(실측: `quick-token.ts` — service key HMAC, dancer_id로 항상 동일)이라 주민번호 수집에 재사용 금지.
- 신규: random opaque 토큰 발급 → **DB에는 hash만** 저장(recipient dancer_id 스코프, `expires_at`·`used_at`·`revoked_at`) → PII 저장과 토큰 소비를 **한 트랜잭션** → 기존 PII prefill 금지(마스킹 표시만).

### 3.8 불변식 보강

- `settlements_paid_terminal` 불변 필드 집합에 **`role`·`tax_mode` 추가** + §3.3 스냅샷 불일치 차단 트리거 + 첫 gross 확정 후 role·tax_mode 변경 차단.
- 풀 집계는 **뷰가 아니라 `requireAdmin()`/owner 게이트 서버액션의 service-role 집계**(기존 관리자 화면 관행). security_invoker 뷰는 projects 공개 RLS 위에서 admin 전용성을 보장하지 못한다(교차검증 확정) — `v_project_pool` 뷰는 만들지 않는다.

### 3.9 일회성 수취인 = 비활성 수취인 레코드 (이원영 전례의 표준화)

- 계정 없는 수취인(엄태웅류)은 `dancers` 행 생성: `is_active=false`·공개 목록/검색 제외를 **표준 생성 액션**으로 고정. 개인/사업자는 별도 레코드(§3.3).
- `settlements.dancer_id NOT NULL`(실측) 구조 유지 — 별도 staff_settlements 테이블은 원장 미러·출금 경로를 이중화하므로 만들지 않는다(교차검증 합의).

---

## 4. 권한·가시성 (3중 방어)

**실측 현행**: `settlements_manage`(ALL)=`can_manage_project` / `settlements_select`=`can_manage_project OR can_act_as_dancer` / `settlements_event_participant_select`=`can_view_event_participant`(viewer·client_viewer·이벤트 스태프·채널 멤버까지 허용). 소유자 정산 콘솔·지원자 콘솔은 **service-role 조회라 RLS 우회**(실측).

### 4.1 RLS (심층 방어)

```
settlements_select  → can_act_as_dancer(dancer_id)                                  -- 본인 행: role 무관
                    OR (can_manage_project(project_id) AND role in ('dancer','travel'))
                    OR is_admin()
settlements_manage  → (can_manage_project(project_id) AND role in ('dancer','travel'))
                    OR is_admin()
settlements_event_participant_select → 기존 조건 AND role in ('dancer','travel')     -- viewer 우회로 차단
```

- `is_admin()` 운영 DB 실재·정의 확인 완료(`profiles.is_admin` 조회, SECURITY DEFINER·STABLE). `can_manage_project(p_id)` 시그니처 확인 완료.

### 4.2 앱 레이어 (1차 방어 — service-role은 RLS를 안 탄다)

- 소유자 정산 콘솔(`projects/[id]/settlements`)·지원자 콘솔(`applicant-portfolio`)의 settlements 조회 쿼리에 **`role in ('dancer','travel')` 필터를 직접** 추가.
- staff·referral의 조회·입력·수정 = 풀 화면(§6)에서만.

### 4.3 재무·풀 권한 — owner ≠ manager (실측 결함 수정 포함)

- **실측 결함**: 기존 콘솔이 공동관리자(매니저)에게 수주액·실비·마진을 노출하고 `setProjectFinanceAction`도 canManageProject 가드라 매니저가 금액 수정 가능 — 결정 5·6 위반.
- **변경**: 재무 열람/수정·풀 화면 = `owner_id = auth.uid() OR is_admin()`. `project_managers`는 제외.
- **Phase 1 게이트**: owner 접근은 admin이 켠 프로젝트만(`projects.staff_pool_enabled` boolean 또는 finances 행의 플래그) — 내부 단계 범위 통제. Phase 3에서 게이트 제거(전 테넌트 오너 개방).
- `/me/settlements`·`/w/[code]`: 본인 행 그대로 + **role 라벨**("출연료"/"교통비"/"스태프"/"소개비").
- 매니저에게 dancer·travel 합계(직접비 규모)는 보임 — 수주액·풀이 없으면 마진 역산 불가라 수용(✅ 대표 승인 2026-08-25).

### 4.4 RLS 회귀 방지 절차 (대표 지시 2026-08-25: "되던 것도 안 되는 불상사" 금지)

- 정책 변경 전 현행 정책 전문을 스냅샷(`pg_policy` 덤프)하고 **즉시 롤백 SQL**을 마이그레이션 파일에 주석으로 동봉.
- 정책 변경 직후 **여정별 회귀 체크리스트 전수 실행**: 댄서 본인 `/me/settlements`·`/w/[code]` 조회 / 수집 링크 `/settle/[code]` 제출 / 매니저 지원자 콘솔 정산 패널 / 소유자 정산 콘솔 / 관리자 코크핏·장부 CSV / 이벤트 참가자 뷰 / 출금신청·이체파일 생성.
- RLS 변경은 코드 배포와 분리해 단독 적용(원인 격리) — 문제 시 롤백 SQL 즉시 실행.

---

## 5. 지급 여정

### 5.1 반복 스태프 (deetz 계정 보유 — 정현수·김주성형)
변경 없음: `pending`(=잔액 충전) → 본인 잔액 출금신청 → 다계좌이체 파일 → `mark_withdrawal_paid`. **지급의 정본은 settlement status가 아니라 잔액 출금 경로**(신규 경로에서 settlement는 pending에 머무름 — 8/17 봉인 구조). 불변식 그대로 통과, 손대지 않는다.

### 5.2 일회성 수취인 (계정 없음 — 엄태웅형)
1. §3.9 표준 액션으로 비활성 수취인 레코드 생성.
2. §3.7 일회용 토큰 링크로 계좌·주민번호(사업자면 사업자번호) 수집.
3. 대표가 풀 화면에서 금액 확정(`pending` → 원장 earn).
4. **대리 출금 = RPC 신설 없이 기존 `request_withdrawal` 재사용** — 함수 본문에 caller 대조가 없고 EXECUTE 전면 revoke로 service-role 전용임을 실측 확인. `requireAdmin()` 서버액션에서 호출, 대리 사유는 생성 직후 `withdrawal_requests.memo` 기록. (⚠ DB `is_admin()` 게이트 wrapper는 service-role 호출에서 `auth.uid()`=null → false — 함정 명시.) 이후 기존 잔액 이체파일 → `mark_withdrawal_paid` 공용.

### 5.3 사업자 수취인 (`tax_mode=invoice`)
- 실지급 = gross(원천 0). 다계좌이체 파일 C열=gross.
- **강제 지점 = 출금·이체파일 레이어**(settlement readiness 트리거 아님 — 신규 경로에서 settlement는 requested로 안 가므로 그 트리거가 invoice를 통제하지 못함, 교차검증 확정): `payout-validation`·출금신청·가용잔액·이체파일 검증에 분기 — invoice 수취인은 주민번호 대신 `business_registration_number` 필수, **`tax_invoice_received_at` 없는 earn은 출금가능잔액 제외**(§3.3 hold).

---

## 6. 풀 화면 (Phase 1 핵심 신규, `/admin/projects/[id]/pool`)

- 게이트: §4.3 (owner OR admin, Phase 1은 enabled 프로젝트만).
- **상단 카드**: 수주액(공급가 입력→`project_finances`) · 직접비 합계(dancer+travel 확정액+expense) · 분배 가능 풀 · 분배 합계 · **회사 유보(잔여 자동)**.
- **분배 섹션**: 행 추가(수취인 검색+일회성 신규 생성) · 금액 입력 · role(staff/referral) · 수취인 tax_mode 표시 · 세후 실지급 미리보기. 입력 상태 키는 dancerId가 아니라 **settlement id**(겸직 시 키 충돌 — 교차검증 발견).
- **추천 템플릿(표시만)**: ndolt1 실적 기반 — 풀 대비 운영 PM 30~35% · 모집 15~20% · 소개 5~10% · 회사 유보 40~50%. 자동 계산 없음(결정 2).
- **지급 현황**: status 기반 paid/pending 폐기 → **role별 비취소 확정액(세전) 합계 + 수취인별 원장 잔액(참고)**. 잔액에는 `전체 잔액 · 프로젝트 미귀속 참고값` 라벨 명시(원장은 전 프로젝트·spend·refund 합산 전역 잔액), 같은 수취인 복수 role이면 잔액은 **수취인 단위 1회만** 표시. per-settlement 지급 추적(출금 allocation)은 Phase 2.
- 기존 "정산 금액 (세전)" 라벨·3.3% 안내 원칙(수수료 아님·국세청 세금) 재사용.

---

## 7. 장부·세무 출력

- `/admin/settlements/ledger` CSV에 `role`·`tax_mode`(스냅샷)·사업자번호·세금계산서 수취일 컬럼 추가.
- **원천세 신고 목록 = `tax_mode='withholding'` 행만.** invoice 행은 별도 "세금계산서 수취 대장"(수취일 관리).
- grigo-artist outbox 연동(기존 합의안)은 sync payload에 role 전달 추가 — 스태프비의 grigo `expenses` 반영 여부는 연동 구현 시 결정.

---

## 8. 단계 계획 (배포 순서 = 교차검증 합의, expand-contract)

**Phase 1 — 내부 완성 (ndolt1 파일럿 포함)**
- **1a**: `role`·`tax_mode` 등 additive 컬럼 + **전 코드 role 인지화**(§9.1) 배포. staff 쓰기는 비활성 유지. (`types.ts`는 현재 any placeholder — 실제 타입 재생성은 전 레포에 타입 오류를 대량 노출시키는 별도 정비라 이 트랙에서 분리, Phase 2 정비 항목. ⚠ db:types 리다이렉트 함정 유의.)
- **1b**: 정산 쓰기 서버액션(단건·일괄 금액입력·직접 추가·수집 제출) **서버측 게이트** — UI 숨김이 아니라 액션 강제 → 구 인스턴스 drain 확인 → 유니크 교체(§3.2) → 게이트 해제.
- **1c-i**: `project_finances`·수취인 세무 프로필·수집 링크 저장소·PII 토큰 테이블 additive 생성 + 기존 값 백필.
- **1c-ii**: 재무 쓰기 잠시 게이트 → 신테이블 읽기·쓰기 코드 전환 배포.
- **1c-iii**: drain·백필 대사 후 `projects`의 구 금액·수집 컬럼 제거(또는 Phase 1 종료까지 deprecated 유지).
- **1c-iv**: RLS·앱 필터(§4) + 풀 화면(§6) + 일회성 수취인(§5.2) + invoice 분기·hold(§5.3) + 봉인 확장(§3.8) 활성화.
- **1d**: **파일럿** — ndolt1에 정현수 2,000,000(staff)·김주성 1,000,000(staff)·엄태웅 500,000(referral) 등록, 교통비 행 role=travel 전환, **풀·원장·출금가능액 3자 대사**(풀 5,700,000 − 교통비, 유보=잔여). 실이체는 승인 게이트.

**Phase 2 — 운영 고도화**: 비인건 직접비 라인아이템(`project_expense_items`) · 출금 allocation(per-settlement 지급 추적) · `allocation_kind` · 원천세 신고 export · 프로젝트/월별 정산서.

**Phase 3 — 테넌트 개방 (rev3 §9와 함께 결정)**: `staff_pool_enabled` 게이트 제거(owner 권한 구조는 이미 §4.3에 준비됨) · 자금원천 분리·수수료 모델 · grigo-artist role 전달.

---

## 9. 리스크·잔여 항목

### 9.1 (project_id, dancer_id) 단일행 가정 — 전수 수정 목록 (Claude·Codex 이중 확인)
- `settlements.ts` :296·:431·:547 — `.maybeSingle()` 3곳(금액 단건/일괄/직접추가).
- `applicant-portfolio.ts` :176 — 지원자 시트 정산 조회 `.maybeSingle()`.
- `w/[code]/page.tsx` :125 — 출금 링크 화면 단행 조회.
- `OwnerSettlementConsole.tsx` :60·:399 — 입력·선택·dirty 상태 dancerId 키잉 → settlement id 키.
- `settlement-roster.ts` :163(pastProjects 행수=인원수 오집계)·:203(projectRoster role 무관 제외).
- 안전 확인(수정 불요): `resolve.ts` :52(.limit(1) identity), `buildTransferFileAction`·paid 액션(id 집합 기준).
- 캐스팅 수락은 settlement 자동 생성 없음(정정) — 유입 경로는 수집 제출·직접 추가·금액 입력 3종.

### 9.2 잔여 결정·확인
- ✅ 대표 승인 완료(2026-08-25): 합산 불변식 / 매니저 직접비 합계 노출 수용 / Phase 1 owner 게이트 / **소개비 = 3.3% 사업소득 확정**.
- 일회성 수취인 PII(주민번호·사업자정보·토큰 감사기록) 보관·파기 기간.
- grigo-artist sync에 staff 행 포함 여부(§7).
