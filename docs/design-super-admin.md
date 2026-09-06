# 슈퍼관리자 권한 설계 정본

작성일: 2026-09-06.
구현 환경: Next.js 16 App Router, React 19, Supabase.
로컬 구현과 정적 검증을 완료했으며, 운영 DB 마이그레이션 적용과 배포는 별도 작업이다.

## 0. 권한 모델과 범위

전역 재무 화면과 작업은 슈퍼관리자에게만 허용한다.
운영 관리자는 승인 큐·공고·수집·프로그램·시스템 등 기존 운영 기능을 계속 사용한다.

| 등급 | `is_admin` | `is_super_admin` | 접근 범위 |
| --- | --- | --- | --- |
| 슈퍼관리자 | true | true | 운영 기능과 전역 재무 기능 |
| 운영 관리자 | true | false 또는 미설정 | 운영 기능 |
| 일반 사용자 | false | false | 기존 본인·프로젝트 권한 |
| 비정상 조합 | false | true | 슈퍼관리자로 인정하지 않음 |

판정식은 `profile.is_admin && profile.is_super_admin === true`다.
`null`이나 누락된 슈퍼관리자 값은 권한을 부여하지 않는다.
권한 부여 UI는 제공하지 않으며 SQL로만 부여·회수한다.

프로젝트 권한 함수 `can_manage_project()`와 프로젝트 풀의 `canManagePool`은 유지한다.
프로젝트 소유자·공동관리자의 직접비 정산 등록, 금액 수정, 정산 수집 링크 발급·마감도 유지한다.
운영 관리자는 `can_manage_project()`에 포함되므로 프로젝트의 `dancer`·`travel` 정산 행에 계속 접근한다.
이번 변경은 프로젝트 운영 전체를 막는 권한 분리가 아니다.

## 1. DB 마이그레이션

파일: `db/migrations/20260906_002_super_admin.sql`.
운영 적용 담당자는 Claude이며, 이 구현 작업에서는 파일만 작성했다.

### 등급과 판정 함수

- `profiles.is_super_admin`은 `boolean not null default false`다.
- `public.is_super_admin()`은 `STABLE SECURITY DEFINER` 함수이며 `search_path`는 `public, pg_temp`로 고정한다.
- DB 판정도 현재 `auth.uid()`의 `is_admin`과 `is_super_admin`이 모두 true일 때만 참이다.
- 초기 부여 대상은 대표 계정 `a182002f-5646-4757-8270-8f6e1b2b4d3d` 한 명이다.
- 기존 `is_admin` 값은 수정하지 않는다.

### 새 등급의 직접 변경 방지

2026-09-06 운영 스키마 조회에서 `profiles_update_self`와 `profiles_admin_all`이 행 단위 수정을 허용하고, `anon`·`authenticated`에 테이블 쓰기 권한이 있음을 확인했다.
이 상태에서 열만 추가하면 운영 관리자가 브라우저에서 `is_super_admin`을 직접 true로 바꿀 수 있다.

`protect_super_admin_flag()`와 `profiles_protect_super_admin_flag` 트리거가 이 우회를 막는다.
`anon`·`authenticated`는 true 값을 가진 새 행을 삽입하거나 기존 행의 슈퍼관리자 값을 변경할 수 없다.
SQL 운영자·service_role의 부여·회수와 일반 프로필 필드 수정은 유지한다.
이 보호는 새 등급 필드에만 적용하며 기존 운영 권한 정책을 재설계하지 않는다.

### RLS 정책

기존 정책은 운영 DB의 `pg_policies`에서 읽기 전용으로 확인했다.
마이그레이션은 아래 여섯 정책의 `is_admin()` 분기만 `is_super_admin()`으로 바꾸고, 변경 전 조건을 SQL 주석에 남긴다.
정책은 동일한 이름과 명령 종류로 재생성하며 전체 마이그레이션은 한 트랜잭션으로 처리한다.

| 테이블 | 정책 | 보존하는 조건 |
| --- | --- | --- |
| `settlements` | `settlements_select` | `can_act_as_dancer(dancer_id)`, 프로젝트 관리 권한과 `dancer`·`travel` 역할 조건 |
| `settlements` | `settlements_manage` | USING·WITH CHECK의 프로젝트 관리 권한과 직접비 역할 조건 |
| `dancer_ledger_entries` | `dancer_ledger_select_own` | 댄서의 `profile_id = auth.uid()` |
| `withdrawal_requests` | `withdrawal_requests_select_own` | 댄서의 `profile_id = auth.uid()` |
| `dancer_rate_cards` | `rate_cards_select` | 본인·매니저 조회와 승인된 댄서의 공개 단가 조회 |
| `dancer_rate_cards` | `rate_cards_write` | USING·WITH CHECK의 본인·매니저 조건 |

`project_settlement_collections`, `project_finances`, `settlements_event_participant_select` 정책과 프로젝트 권한 함수는 변경하지 않는다.
생성 타입 파일 `src/lib/supabase/types.ts`도 변경하지 않는다.
새 열은 명시적 타입 캐스팅·인터섹션으로 다루며 `npm run db:types`는 실행하지 않는다.

배포 전에 마이그레이션을 적용해야 한다.
`getProfile()`이 새 열을 조회하므로 열이 없는 DB에 코드부터 배포하면 프로필 조회가 실패한다.

## 2. 인증 가드

| 파일 | 구현 |
| --- | --- |
| `src/lib/auth/super-admin.ts` | 외부 의존성 없는 `isSuperAdmin(profile)` 판정 함수 |
| `src/lib/auth/guard.ts` | 새 열 조회·반환 타입 추가, `isSuperAdmin` 재수출, `requireSuperAdmin()` 추가 |
| `src/lib/auth/super-admin.test.ts` | 기본 네 조합과 누락·null 값의 거부 검증 |

`requireSuperAdmin()`은 `requireProfile()`로 로그인된 프로필을 얻고 권한을 검사한다.
슈퍼관리자가 아니면 `/admin?super_required=1`로 이동하며, 통과하면 프로필을 반환한다.
로그인하지 않은 사용자는 기존 로그인 리다이렉트를 따른다.
`requireAdmin()`의 동작은 그대로 유지한다.

## 3. 페이지와 API

### 슈퍼관리자 전용 페이지

| URL | 파일 | 검사 위치 |
| --- | --- | --- |
| `/admin/payments` | `src/app/(app)/admin/payments/page.tsx` | 결제 장부 조회 전 |
| `/admin/settlements` | `src/app/(app)/admin/settlements/page.tsx` | 정산·출금 큐 조회 전 |
| `/admin/settlements/ledger` | `src/app/(app)/admin/settlements/ledger/page.tsx` | 지급 장부 조회 전 |
| `/admin/finance/receivables` | `src/app/(app)/admin/finance/receivables/page.tsx` | 매출·수금 조회 전 |
| `/admin/rate-cards` | `src/app/(app)/admin/rate-cards/page.tsx` | 댄서별 단가 조회 전 |
| `/admin/fee-reports` | `src/app/(app)/admin/fee-reports/layout.tsx` | 기존 클라이언트 페이지를 감싸는 서버 레이아웃 |

각 검사에는 `requireSuperAdmin()`을 사용한다.
신고 페이지의 클라이언트 구현은 유지하고 데이터 API에서도 별도로 권한을 검사한다.

`src/app/api/admin/fee-reports/route.ts`의 GET은 `getProfile()`과 `isSuperAdmin()`으로 검사한다.
거부하면 HTTP 403과 `슈퍼관리자만 실행할 수 있습니다.`를 반환한다.
신고 목록 조회와 증빙 다운로드용 signed URL 발급은 검사 이후에만 실행한다.

`src/app/api/fee-reports/route.ts`와 `src/app/api/fee-reports/upload-url/route.ts`는 신고 제출·업로드 경로이므로 유지한다.
확인한 `src/app/api/fee-reports/**`에는 별도의 관리자 조회·다운로드 경로가 없다.

### 대시보드와 사용자 목록

`src/app/(app)/admin/page.tsx`는 다음 동작을 담당한다.

- 슈퍼관리자일 때만 `settlements`·`withdrawal_requests`의 출금 대기 건수를 조회한다.
- 통합 결제 장부와 정산·출금 처리 카드는 슈퍼관리자에게만 표시한다.
- 기존 운영 카드·통계는 유지한다.
- `?super_required=1`이면 상단에 `이 메뉴는 슈퍼관리자만 볼 수 있습니다.`를 표시한다.

`src/app/(app)/admin/users/page.tsx`는 목록 조회에 새 열을 포함한다.
`is_super_admin`이 true인 사용자에게 기존 `Tag tone="warn"` 스타일의 `super admin` 배지를 추가한다.
권한을 부여하는 버튼이나 액션은 추가하지 않는다.

## 4. 서버 액션 경계

모든 서버 액션은 화면의 메뉴 표시 여부와 별개로 자체 권한을 검사한다.
기존 `requireAdmin()` 기반 전역 재무 액션은 `requireSuperAdmin()`으로 전환한다.
혼합 경로는 기존 본인·프로젝트 권한을 먼저 보존하고 전역 관리자 예외만 슈퍼관리자로 제한한다.

### `src/app/actions/settlements.ts`

다음 액션은 슈퍼관리자 전용이다.

- `sendWithdrawalRequestEmailAction`: 출금 신청 안내 발송.
- `cancelSettlementAction`: 미지급 정산 취소.
- `markSettlementPaidAction`, `markSettlementsPaidAction`: 단건·일괄 지급 완료 기록.
- `requestSettlementInfoAction`: 정산 정보 입력 요청.
- `buildTransferFileAction`: 이체 파일 생성.

`savePayoutAccountAction`과 `saveResidentNumberAction`은 본인 입력을 유지하고 타인 정보의 관리자 대리 입력만 슈퍼관리자로 제한한다.
`setSettlementAmountAction`, `setSettlementAmountsBulkAction`, `addSettlementDancerAction`의 프로젝트 권한 검사는 유지한다.
프로젝트 직접비 외 역할에 대한 기존 운영 관리자 검사와 `setProjectFinanceAction`의 소유자·운영 관리자 검사도 유지한다.
수집 링크 액션 `setSettlementCollectionAction`과 본인 제출 액션 `submitSettlementCollectionAction`은 유지한다.

### `src/app/actions/withdrawals.ts`

`markWithdrawalPaidAction`, `buildBalanceTransferFileAction`, `markWithdrawalsPaidBulkAction`은 슈퍼관리자 전용이다.
출금 알림 수신자도 `is_admin = true`와 `is_super_admin = true`를 모두 만족해야 한다.
본인 출금 신청 `requestPartialWithdrawalAction`과 신청 취소 `cancelMyWithdrawalAction`은 유지한다.
이 파일에는 별도의 관리자 승인·거절 액션이 없다.

### `src/app/actions/payment-operations.ts`

다음 네 액션 모두 슈퍼관리자 전용이다.

- `requestPaymentOperationAction`
- `approvePaymentOperationAction`
- `rejectPaymentOperationAction`
- `reconcilePaymentOperationAction`

기존 2인 승인, 직접 실행 허용목록, 환불 계산, 멱등 처리, 재대사 로직은 유지한다.
2인 승인 경로의 요청자와 승인자는 모두 슈퍼관리자여야 한다.

### `src/app/actions/receivables.ts`

다음 열 개 액션 모두 슈퍼관리자 전용이다.

- `createClientPartyAction`
- `createDealAction`, `updateDealAction`
- `createLineAction`, `createMixedUnitLinesAction`
- `recordTaxInvoiceAction`
- `updateLineAction`, `setLineStatusAction`, `deleteLineAction`
- `addReceiptAction`

### `src/app/actions/rate-cards.ts`

`upsertRateCardAction`과 `deleteRateCardAction`이 사용하는 대상 댄서 판정에서 관리자 예외를 `isSuperAdmin()`으로 바꾼다.
본인 댄서와 `dancer_managers`의 매니저 권한은 유지한다.

### 유지하는 프로젝트 풀

`src/app/actions/staff-pool.ts`, `src/lib/settlement-pool.ts`, `src/app/actions/staff-messages.ts`는 변경하지 않는다.
프로젝트 풀의 운영 권한은 이 문서의 전역 재무 화면 권한과 별도로 유지한다.

## 5. 관리자 메뉴

`src/app/(app)/admin/layout.tsx`에서 `isSuperAdmin(profile)`을 계산한다.
그 값을 `superAdmin: boolean` prop으로 `AdminSidebarNav`와 `AdminTopNav`에 전달한다.

`src/components/admin/AdminNav.tsx`는 데스크톱과 모바일에 같은 필터를 적용한다.
재무 항목에는 `superOnly` 표시를 두고 슈퍼관리자에게만 렌더한다.

| 항목 | href | 표시 대상 |
| --- | --- | --- |
| 페이 산정 | `/tools/rate-check` | 모든 관리자 |
| 통합 결제 장부 | `/admin/payments` | 슈퍼관리자 |
| 정산 처리 | `/admin/settlements` | 슈퍼관리자 |
| 지급 장부 | `/admin/settlements/ledger` | 슈퍼관리자 |
| 매출·수금 | `/admin/finance/receivables` | 슈퍼관리자 |

운영 관리자에게 페이 산정만 남으면 그룹 제목을 `도구`로 표시한다.
슈퍼관리자에게는 기존 `정산` 제목을 유지한다.
기존 메뉴에 없던 댄서별 단가 항목은 추가하지 않는다.
`/tools/rate-check` 페이지 이동은 별도 PR에서 처리하며 이 변경에서는 메뉴 href를 맞춘다.

## 6. 변경 파일과 검증

변경 파일별 역할은 위 1~5장의 표와 액션 목록을 정본으로 삼는다.
총 변경 파일은 마이그레이션 1개, 인증·테스트 3개, 관리자 페이지·레이아웃 9개, 메뉴 1개, 액션 5개, API 1개, 이 문서 1개다.
기존 신고 클라이언트 페이지, 신고 제출·업로드 API, 프로젝트 풀 파일은 수정하지 않았다.

2026-09-06 로컬 검증 결과:

| 검증 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | 통과 |
| 변경된 TS·TSX 파일 대상 `npx eslint -- ...` | 통과 |
| `npx tsx --test src/lib/auth/super-admin.test.ts` | 4건 통과, 실패 0건 |

PowerShell 실행 정책이 `npx.ps1`을 차단하므로 같은 명령을 `npx.cmd`로 실행했다.
ESLint 범위는 사용자 지시에 따라 변경 파일로 한정했다.
운영 DB에서는 기존 정책과 트리거·권한만 읽기 전용으로 확인했다.
마이그레이션 적용 후의 DB 권한 회귀 검증과 로그인 브라우저 검증은 아직 수행하지 않았다.
`npm run db:types`와 git commit은 실행하지 않았다.

공유 기능 정본 `C:\Users\tkay\.claude\CAPABILITY_MAP.md`의 갱신은 현재 작업 공간 쓰기 허용 범위 밖이라 남아 있다.
해당 정본에는 이 문서 경로와 함께 로컬 구현 완료·운영 적용 전 상태를 반영해야 한다.
