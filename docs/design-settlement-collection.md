# 설계: deetz 정산 시스템 (멀티테넌트) — 구글폼 흡수 + grigo-artist 청사진

> 상태: **설계안 (검토 대기)** · 2026-06-28 (rev3 — deetz 자체 멀티테넌트 정산으로 전환)
> 관련 정본: `project_deetz_settlement.md` · `reference_dancersbio_private_info.md` · `project_deetz_platform_roadmap.md` · `project_grigo_artist_dancer_sns.md`
> 계기: Renan 안무가 구글폼(`[RENAN] 참여 댄서 정산 시스템`) 흡수 → **다른 댄스팀·안무가도 쓰는 정산 플랫폼**으로 productize.

---

## 1. 목표

deetz에 **누구나(안무가·댄스팀) 자기 프로젝트의 정산을 돌릴 수 있는 정산 시스템**을 구축한다.
- 구글폼(댄서 지급정보 수기 수집)을 deetz 셀프 입구로 흡수.
- 안무가 수익 모델(수주액→배분→마진→월정산)은 grigo-artist(brvmk)에 **이미 실가동 중인 검증된 청사진**(172 프로젝트·145 수주·51 월정산서)을 따른다 — 단, grigo 내부 장부와 별개로 deetz는 **멀티테넌트 제품**으로 구현.

### 두 시스템 관계 (혼동 방지)
| | grigo-artist (brvmk) | deetz (wvfm…) |
|---|---|---|
| 성격 | grigo **내부** 안무가 수익 장부 | **플랫폼 제품** (외부 팀·안무가용) |
| 강점 | 수주액·배분율·마진·월정산서·원천징수 (돈 두뇌) | 댄서 727 로그인·PII 금고(주민번호·계좌)·다계좌이체 실지급·셀프 입구 |
| 약점 | 댄서 셀프 입구 無·계좌 0·직원만 로그인(14) | 수익·배분·마진 레이어 無 |
| 본 설계 | **청사진으로 참조** (재구현 아님) | **여기에 정산 시스템 구축** |

> ⚠ grigo-artist는 무료 티어라 미사용 시 자동 일시중지됨(2026-06-28 paused→복구 확인). 만약 향후 deetz↔grigo 연동을 건다면 유료 전환/주기 핑 필요.

---

## 2. 테넌트 모델 (이미 깔린 뼈대 활용)

deetz는 멀티테넌트 1차 구조가 **이미 존재**(미배선):
- `teams`(27)·`team_members`(48, `lead_profile_id`=팀장) — 댄스팀 엔티티 실재.
- `projects.owner_id`(=현재 소유 profile) + `owner_dancer_id`/`owner_team_id`(칸만 있고 현재 0=미배선) + `allow_team_apply`.
- `project_managers`(7, 라이브) — 공동관리자. `canManageProject()` 게이트 존재.

→ **테넌트 = 프로젝트 소유자**(안무가=owner profile/dancer, 또는 팀=owner_team). 정산은 프로젝트에 종속되므로, **소유자/매니저만 자기 프로젝트 정산을 운영**(RLS = canManageProject 확장). 슈퍼관리자는 전체.

⚠ 현재 정산 코크핏(`/admin/settlements`)·다계좌이체는 **슈퍼관리자 전용** → 멀티테넌트화하려면 **소유자 스코프 콘솔**이 핵심 신규 작업(아래 §5.4).

---

## 3. 돈 모델 (grigo-artist 청사진 → deetz)

```
클라이언트 ──수주액──▶ 프로젝트(소유=안무가/팀)
                          │  배분(소유자가 결정: 정액 또는 %)
            ┌─────────────┼──────────────┐
            ▼             ▼               ▼
        댄서A 배분     댄서B 배분      소유자/회사 마진
        (settlement)  (settlement)   (수주액 − Σ배분 − 실비)
```
- **수주액**(client revenue) = grigo `revenues` 대응. deetz 신규.
- **배분**(split) = grigo `split_rules.dancer_pct` / `dancer_project_payout`. deetz는 **소유자가 댄서별 금액 또는 %로 입력**.
- **댄서 지급** = deetz 기존 `settlements`(project_id,dancer_id,gross_amount,withholding 3.3%) 그대로.
- **마진** = grigo `project_totals.net_profit` 대응. deetz 신규(뷰 계산).
- **(후순위) 월 정산서** = grigo `monthly_statements`(소유자/댄서 월합·원천징수) — 로드맵.

---

## 4. 스키마 (additive, grigo 명명 차용)

### 4.1 프로젝트 수익·소유 배선
```sql
alter table public.projects
  -- 수익 레이어
  add column client_revenue   integer,            -- 클라이언트 수주액
  add column expense_amount    integer default 0,  -- 실비(촬영·교통 등)
  -- 댄서 지급정보 셀프 수집 링크
  add column settlement_collect_code text unique,  -- /settle/<code>
  add column settlement_collection_open boolean not null default false;
-- 소유 배선: owner_dancer_id/owner_team_id (이미 존재) 를 실제 채우도록 생성 액션 수정
-- 마진 = client_revenue − Σ settlements.gross_amount − expense_amount  → 뷰 v_project_settlement_totals
```

### 4.2 배분 규칙 (선택 — % 자동배분 쓸 때만)
```sql
create table public.settlement_splits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  dancer_id  uuid not null references dancers(id),
  pct numeric,            -- 수주액 대비 %  (정액이면 settlements.gross 직접)
  note text,
  created_at timestamptz not null default now(),
  unique(project_id, dancer_id)
);  -- RLS = canManageProject(project_id) or is_admin()
```
> MVP는 4.2 생략 가능 — 소유자가 `settlements.gross_amount`를 댄서별로 직접 입력하면 충분. %자동배분은 2차.

### 4.3 settlements — 셀프 제출 출처 + 멱등
```sql
alter table public.settlements
  add column origin text not null default 'manager'   -- 'manager' | 'self_collected'
    check (origin in ('manager','self_collected')),
  alter column gross_amount drop not null;            -- 셀프제출 시점엔 금액 미정(소유자가 후기입)
create unique index settlements_project_dancer_uniq
  on public.settlements(project_id, dancer_id);       -- 구글폼 "중복입력" 멱등
```

### 4.4 dancer_private_info — 변경 없음
RRN·은행·계좌·예금주·bank_code 이미 존재. 제출 시 upsert만.

---

## 5. 흐름 (4 actor)

### 5.1 소유자(안무가/팀) — 프로젝트 + 수익 + 수집링크
- 프로젝트 생성(소유=본인/팀) → 수주액·실비 입력 → **"정산 수집 링크"** 발급(`settlement_collect_code`, `ShareButton` 패턴) → `deetz.kr/settle/<code>` 배포.

### 5.2 댄서 — 지급정보 셀프 제출 (`/settle/<code>`, 로그인 필수)
1. 로그인 게이트(미가입→가입 후 합류=deetz 풀 성장) → `dancer_id` 식별.
2. 폼(**금액칸 없음**): 활동명·은행/계좌/예금주(BankPicker)·주민번호🔒·연락처 (있으면 prefill).
3. 제출: `dancer_private_info` upsert + `settlements` upsert(project_id,dancer_id, origin='self_collected', gross=null, status='pending'). 재제출=갱신(멱등).
4. `/me/settlements`에서 본인 정산 누적 확인(흩어진 시트 → 한 곳).

### 5.3 소유자 — 배분 금액 기입
- 본인 프로젝트 콘솔에서 댄서별 **gross 기입**(또는 %로 자동배분=4.2). 마진 실시간.

### 5.4 운영자/소유자 — 지급 ⚠ 멀티테넌트 핵심
- **소유자 스코프 정산 콘솔**(신규) — 자기 프로젝트 정산만. gross 있는 건 다계좌이체 파일(`buildTransferFileAction`)·일괄 입금완료(`markSettlementPaid`)·3.3% 장부 재사용.
- 실지급 주체 정책: (가) 회사(경영지원실) 일괄 대행 vs (나) 소유자 본인 집행 — **정책 결정 필요**(§8). 현 다계좌이체는 GRIGOent 법인계좌 기준이라, 외부 팀이면 자금원천이 다름.

---

## 6. grigo-artist 테이블 → deetz 매핑

| grigo-artist | deetz |
|---|---|
| `projects`(client·code) | `projects`(+`client_revenue`) |
| `revenues`(amount·dancer_pct) | `projects.client_revenue` + `settlement_splits.pct` |
| `expenses` | `projects.expense_amount` (MVP 단일값) |
| `split_rules` | `settlement_splits` (선택) |
| `dancer_project_payout`(projected_payout) | `settlements.gross_amount` |
| `settlements`(payout_amount·status) | `settlements`(기존) + `origin` |
| `project_totals.net_profit` | 뷰 `v_project_settlement_totals` |
| `monthly_statements`(withholding) | (로드맵) 소유자별 월정산 뷰 |
| `dancers.bank_info` | `dancer_private_info`(분리·RLS·RRN) ← deetz가 우월 |

---

## 7. 구글폼 약점 → 흡수 후
| 구글폼 약점 | 흡수 후 |
|---|---|
| 주민번호·계좌 평문 시트 | `dancer_private_info` RLS 분리(anon REVOKE+2중 잠금) |
| "중복입력" 수기 | unique(project_id,dancer_id) 멱등 |
| 시트 흩어짐 | 댄서별=`/me/settlements`, 소유자별=프로젝트 콘솔 |
| 수주액·마진 안 보임 | 수익 레이어 + 마진 뷰 |
| 입금/세무 수기 | 다계좌이체 + 3.3% 원천징수 + CSV 장부 |
| 한 안무가 전용 | **멀티테넌트**(any 팀·안무가) |

---

## 8. 구현 슬라이스 (승인 후)

**MVP (Renan 1팀으로 E2E)**:
1. 스키마 §4.1·§4.3 + `npm run db:types`.
2. `/settle/<code>` 댄서 셀프 제출(금액칸 없음, 멱등 upsert) + 로그인 가드.
3. 소유자 콘솔: 수집링크 발급 + 댄서별 gross 입력 + 마진 뷰.
4. 지급: 기존 다계좌이체·입금완료를 **소유자 스코프**로 노출(or 회사 대행).
5. E2E: 테스트 댄서(`reference_deetz_e2e_account`)로 제출→배분→(모의)입금. 실지급·실주민번호=승인 게이트.

**2차**: `settlement_splits` %자동배분 · `owner_team_id` 팀 소유 배선 · 소유자별 월정산서 · 자금원천(외부 팀 계좌) 분리.

## 9. 미해결 / 정책 결정
- **실지급 주체**: 회사 일괄 대행 vs 소유자 본인 집행(외부 팀은 GRIGOent 법인계좌 아님 → 자금원천·정산수수료 모델 필요).
- **테넌트 격리 RLS**: 정산·PII가 소유자 스코프로 새지 않게(`canManageProject` 확장 + `dancer_private_info` 노출 범위 — 매니저는 키/연락처까지만 허용 규칙과 충돌 점검).
- 정산 배치(project) 공개 피드 누출 점검([[reference_deetz_private_rls_leak]]).
- 주민번호 신규 수집 보관·파기 정책(개인정보).
- gross NOT NULL 제거의 기존 이체/장부 영향(null 제외 가드).
- (장기) grigo 내부 안무가는 grigo-artist 정본 유지 vs deetz로 통합? — 별도 결정.
