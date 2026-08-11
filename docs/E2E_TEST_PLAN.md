# mydancersbio E2E 테스트 계획

> 대상: Next.js 16 App Router + Supabase (Auth/Postgres/Storage/RLS). 서버 액션 기반, 모바일 우선, 한국어 UI.
> 작성일: 2026-05-11
> 본 문서는 QA용 E2E 시나리오 인벤토리이며, 각 항목은 독립적으로 실행 가능한 테스트 케이스 단위로 작성한다.

---

## 0. 공통 사전 조건 / 환경

- 테스트 계정 풀 (최소 6개)
  - `admin@test` — `is_admin=true`
  - `creator@test` — `can_create_project=true`, 댄서 프로필 보유
  - `dancer@test` — 댄서 프로필 보유, creator 권한 없음
  - `dancer2@test` — 다른 댄서, 팀 리드
  - `dancer3@test` — 팀 멤버
  - `new@test` — 가입 직후 (프로필/댄서 없음)
- Supabase 환경
  - `confirm email` 설정값 명시 (ON/OFF에 따라 가입 후 흐름이 달라짐)
  - Storage 버킷: `profile-photos`, `team-photos` 권한 정상
  - RLS 정책 활성 상태
- 시드 데이터
  - 공개 댄서 `/d/babysleek`
  - 공개 프로젝트 1건 (status=open, public)
  - 비공개 프로젝트 1건 (visibility=private)
  - 마감 임박 프로젝트 1건 (deadline < 7일)
- 디바이스/뷰포트
  - 모바일 (375×812) — 기본
  - 데스크탑 (1280×800) — 레이아웃 확인용

---

## 1. 인증 (Auth)

### 1.1 회원가입
- [ ] **AUTH-001** 정상 가입: 유효한 이메일/비밀번호/표시이름 → `/onboarding/create` 이동
- [ ] **AUTH-002** 중복 이메일 → "이미 가입된 이메일입니다." 메시지 노출
- [ ] **AUTH-003** 비밀번호 8자 미만 → zod 검증 메시지
- [ ] **AUTH-004** display_name 51자 이상 → 검증 실패
- [ ] **AUTH-005** display_name 공백/특수문자만 → 검증
- [ ] **AUTH-006** 이메일 형식 오류 → 검증
- [ ] **AUTH-007** Supabase confirm-email ON일 때 메일 도착 및 미인증 상태 동작 확인
- [ ] **AUTH-008** 가입 직후 `/me` 접근 시 권한 배지 노출 (`/verify-instagram` 안내)

### 1.2 로그인
- [ ] **AUTH-010** 정상 로그인 → 세션 쿠키 발급, `/me`로 이동
- [ ] **AUTH-011** 잘못된 비밀번호 → 일반 에러 메시지 (계정 존재 노출 금지)
- [ ] **AUTH-012** 존재하지 않는 이메일 → 동일한 일반 에러
- [ ] **AUTH-013** 미들웨어 세션 리프레시: 로그인 상태에서 정적 자원 외 라우트 이동 시 쿠키 갱신

### 1.3 로그아웃
- [ ] **AUTH-020** `/me`에서 로그아웃 → `/`로 이동, 세션 종료
- [ ] **AUTH-021** 로그아웃 후 보호된 라우트 직접 진입 → `/login` 또는 적절한 리다이렉트

### 1.4 미구현 항목 (회귀 영역 표시)
- 비밀번호 재설정 UI 없음 — 추후 추가 시 케이스 작성
- 소셜 로그인 없음
- 이메일 인증 전용 UI 없음

### 1.5 랜딩 페이지
- [ ] **AUTH-030** 비로그인 상태 `/` → `시작하기`, `로그인` CTA 표시
- [ ] **AUTH-031** 로그인 상태 `/` → `/me` 리다이렉트
- [ ] **AUTH-032** `/d/babysleek` 샘플 링크 동작

---

## 2. 온보딩 / 댄서 프로필 생성

- [ ] **OB-001** `/onboarding/create` 접근: 로그인 필요 (`requireUser`)
- [ ] **OB-002** 이미 댄서 프로필 존재 시 `/me/portfolio` 리다이렉트
- [ ] **OB-003** 위저드 정상 완료: stage_name, korean_name, slug, gender, location, genres, specialties, social_links, profile_img 업로드 → 생성 성공
- [ ] **OB-004** slug 중복 → 사용자 친화 에러
- [ ] **OB-005** profile_img 5MB 초과/지원 안 되는 mime → 거절
- [ ] **OB-006** 필수 필드 미입력 검증
- [ ] **OB-007** 생성 직후 `approval_status=pending`인지 확인, `/dancers`에 노출 안 됨

---

## 3. 프로필 (계정 레벨)

### 3.1 `/me`
- [ ] **PROF-001** 헤더 (아바타 + display_name) 노출
- [ ] **PROF-002** `can_create_project=false && is_admin=false` → 인스타그램 인증 배지 표시
- [ ] **PROF-003** `ProfileEditForm`: display_name, bio 수정 → `updateProfileAction` 성공
- [ ] **PROF-004** 메뉴 게이팅
  - 댄서 프로필 있음 → "포트폴리오", "팀" 메뉴 표시
  - `can_create_project=true` → "프로젝트 개설" 메뉴 표시
  - `is_admin=true` → "관리자 콘솔" 메뉴 표시

---

## 4. 포트폴리오 / 댄서 페이지

### 4.1 본인 편집 `/me/portfolio`
- [ ] **PORT-001** 프로필 정보 수정 (`upsertDancerProfileAction`)
- [ ] **PORT-002** 프로필 사진 업로드/교체 (Storage RLS: 경로 prefix=dancer_id 확인)
- [ ] **PORT-003** social_links 다중 입력
- [ ] **PORT-004** 거절 사유(reject_reason) 노출 (관리자가 거절한 경우)
- [ ] **PORT-005** 승인 상태별 노출 차이 (pending/approved/rejected)

### 4.2 경력 관리 `/me/portfolio/careers`
- [ ] **CAR-001** 경력 추가 (`addCareerAction`): type, title, date, link, role, description
- [ ] **CAR-002** 경력 수정 (`updateCareerAction`)
- [ ] **CAR-003** 경력 삭제 (`deleteCareerAction`)
- [ ] **CAR-004** 공개/비공개 토글 (`setCareerVisibilityAction`)
- [ ] **CAR-005** `is_representative` 대표 경력 지정
- [ ] **CAR-006** YouTube/Vimeo 링크 → `parseVideoUrl` 썸네일 정상 표시
- [ ] **CAR-007** 잘못된 비디오 URL 처리

### 4.3 공개 댄서 페이지 `/d/[slug]`
- [ ] **PUB-001** 비로그인 사용자도 열람 가능
- [ ] **PUB-002** approved 댄서만 노출, pending/rejected는 직접 URL 접근 시 처리(404 또는 안내) 확인
- [ ] **PUB-003** 프로젝트 오너 로그인 상태에서 진입 → `SendProposalDialog` 노출
- [ ] **PUB-004** 본인 페이지 진입 시 제안 다이얼로그 노출 안 됨

### 4.4 공개 팀 페이지 `/t/[slug]`
- [ ] **PUB-010** 동일 — 팀 단위 제안 다이얼로그 노출 조건 확인

### 4.5 공개 프로필 `/u/[id]`
- [ ] **PUB-020** 일반 사용자 공개 페이지 렌더링

---

## 5. 인스타그램 인증 (creator 권한 게이트)

### 5.1 사용자 측 `/verify-instagram`
- [ ] **IG-001** 비로그인 → 차단
- [ ] **IG-002** 이미 `can_create_project || is_admin` → `/me` 리다이렉트
- [ ] **IG-003** 코드 요청 (`requestInstagramVerification`) → 코드/만료시각 생성
- [ ] **IG-004** 만료된 코드 표시 처리
- [ ] **IG-005** 거절 사유 노출 (이전 거절 이력)
- [ ] **IG-006** 인스타그램 핸들 형식 검증

### 5.2 관리자 측 `/admin/verifications`
- [ ] **IG-010** 승인 (`approveInstagramVerificationAction`) → 사용자 `can_create_project=true`, `instagram_verified_at` 설정, `is_verified_badge=true`
- [ ] **IG-011** 거절 (사유 입력) → 사용자에게 사유 노출
- [ ] **IG-012** 승인 후 사용자가 `/projects/new` 진입 가능

---

## 6. 프로젝트 (캐스팅 공고)

### 6.1 피드 `/feed`
- [ ] **PRJ-001** 공개·open·미삭제 프로젝트만 노출
- [ ] **PRJ-002** 마감 <7일 → `FeaturedCard` 강조
- [ ] **PRJ-003** 비공개 프로젝트는 비노출
- [ ] **PRJ-004** 빈 상태 처리

### 6.2 생성 `/projects/new`
- [ ] **PRJ-010** 권한 없음 (creator 아님) → 인스타 인증 안내 CTA만 표시
- [ ] **PRJ-011** 정상 생성: title(≤120), description(10–2000), visibility, genre_id, region, pay, recruitment_count, deadline, sessions[], publish_now
- [ ] **PRJ-012** `publish_now=false` → status=draft
- [ ] **PRJ-013** `publish_now=true` → status=open
- [ ] **PRJ-014** title 121자 → 검증
- [ ] **PRJ-015** description 9자/2001자 → 검증
- [ ] **PRJ-016** recruitment_count 0/1000 → 검증
- [ ] **PRJ-017** pay_type=negotiable일 때 pay_amount 무시/허용 동작
- [ ] **PRJ-018** sessions 다중 추가/삭제, 시간 순서 검증
- [ ] **PRJ-019** application_deadline 과거일 → 검증
- [ ] **PRJ-020** allow_team_apply=true/false 토글
- [ ] **PRJ-021** 관리자 `owner_id_override` 사용 가능, 일반 유저는 무시/거절
- [ ] **PRJ-022** RLS 거절 (42501) → "프로젝트 개설 권한이 없습니다."

### 6.3 상세 `/projects/[id]`
- [ ] **PRJ-030** 공개 프로젝트 비로그인 열람
- [ ] **PRJ-031** 비공개 프로젝트: 신청자/오너만 열람
- [ ] **PRJ-032** 오너 진입: `AgreedPayEditor`, 마감(`closeProjectAction`), 삭제(`deleteProjectAction`) 버튼
- [ ] **PRJ-033** 비오너 진입: `ApplyForm` 표시
- [ ] **PRJ-034** 삭제(소프트) 후 `/feed`/리스트에서 비노출, 직접 URL 404 처리
- [ ] **PRJ-035** close 후 status=closed, 지원 차단
- [ ] **PRJ-036** `setAgreedPayAction` — 합의 금액 저장

### 6.4 지원자 관리 `/projects/[id]/applicants` (오너 전용)
- [ ] **PRJ-040** 비오너 접근 차단
- [ ] **PRJ-041** 개인/팀 지원자 모두 노출, 상태별 색상
- [ ] **PRJ-042** 수락 (`decideApplicationAction` → accepted)
- [ ] **PRJ-043** 거절 (rejected)
- [ ] **PRJ-044** 이미 결정된 지원의 재결정 동작
- [ ] **PRJ-045** 빈 목록 상태

---

## 7. 지원 / 제안 (applications 통합 테이블)

### 7.1 지원 (apply)
- [ ] **APP-001** 개인 지원: 댄서 프로필 필요, 정상 → status=pending
- [ ] **APP-002** 본인 프로젝트에 지원 시도 → 차단
- [ ] **APP-003** status≠open인 프로젝트 지원 → 차단
- [ ] **APP-004** allow_team_apply=false인데 팀으로 지원 → 차단
- [ ] **APP-005** 팀 지원: 팀 리드만 가능
- [ ] **APP-006** 댄서 프로필 없는데 개인 지원 → 차단
- [ ] **APP-007** 중복 지원 (23505) → "이미 지원하셨습니다."

### 7.2 지원 철회
- [ ] **APP-010** status=pending일 때 본인/팀리드만 `withdrawApplicationAction`
- [ ] **APP-011** accepted/rejected 상태에서 철회 시도 → 차단
- [ ] **APP-012** 철회 후 status=withdrawn, 재지원 가능 여부 정책 확인

### 7.3 다이렉트 제안 (direct_proposal)
- [ ] **PROP-001** 오너만 `SendProposalDialog` 노출
- [ ] **PROP-002** 비open 프로젝트 → 제안 불가
- [ ] **PROP-003** 본인에게 제안 → 차단
- [ ] **PROP-004** 본인 팀에 제안 → 차단
- [ ] **PROP-005** allow_team_apply=false인데 팀 대상 제안 → 차단
- [ ] **PROP-006** 중복 제안 (23505) 처리
- [ ] **PROP-007** 정상 발송 → 수신자 inbox에 노출

### 7.4 제안 수신/응답 `/proposals`
- [ ] **PROP-010** 본인 inbox만 노출
- [ ] **PROP-011** 수락 (`respondToProposalAction` → accepted): `contact_revealed_at` 설정, 연락처 노출
- [ ] **PROP-012** 거절 (declined)
- [ ] **PROP-013** BottomTabBar 배지: pending direct_proposal 개수와 일치
- [ ] **PROP-014** 응답 후 배지 감소

### 7.5 내 지원 내역 `/applications`
- [ ] **APP-020** pending/accepted/rejected/withdrawn 그룹별 노출
- [ ] **APP-021** pending 항목에 철회 버튼
- [ ] **APP-022** 빈 상태

---

## 8. 팀

### 8.1 목록/생성 `/me/teams`, `/me/teams/new`
- [ ] **TEAM-001** 댄서 프로필 없음 → 온보딩 리다이렉트
- [ ] **TEAM-002** 팀 생성: slug 유니크, 이름, 설명, 아바타
- [ ] **TEAM-003** 아바타 5MB/허용 mime(jpeg/png/webp/gif) 검증
- [ ] **TEAM-004** slug 중복 사용자 친화 에러

### 8.2 편집 `/me/teams/[id]`
- [ ] **TEAM-010** 리드만 편집 가능
- [ ] **TEAM-011** `updateTeamAction` 정상 동작
- [ ] **TEAM-012** 멤버 추가 (`addTeamMemberAction`) — 이메일 조회 (`lookupProfileByEmailAction`)
- [ ] **TEAM-013** 존재하지 않는 이메일 처리
- [ ] **TEAM-014** 멤버 중복 추가 차단
- [ ] **TEAM-015** 멤버 제거 (`removeTeamMemberAction`)
- [ ] **TEAM-016** 리드 이양 (`transferTeamLeadAction`) — 기존 리드 권한 회수
- [ ] **TEAM-017** 팀 해체 (`disbandTeamAction`) — `is_active=false`
- [ ] **TEAM-018** 비활성 팀은 지원/제안 흐름에서 제외

### 8.3 관리자 팀 승인 `/admin/teams`
- [ ] **TEAM-020** 승인 (`approveTeamAction`) → `approval_status=approved`
- [ ] **TEAM-021** 거절 (`rejectTeamAction`)
- [ ] **TEAM-022** approved && is_active 팀만 `/dancers` 팀 탭에 노출

---

## 9. 디렉토리 / 검색 `/dancers`

- [ ] **DIR-001** 댄서 탭: approved && is_active만 노출
- [ ] **DIR-002** 팀 탭: 동일 조건
- [ ] **DIR-003** `?q=` 검색 (이름/slug 등)
- [ ] **DIR-004** 빈 검색 결과 상태
- [ ] **DIR-005** display_order 정렬 반영 (관리자가 설정한 경우)

---

## 10. 관리자 콘솔 (`is_admin` 게이트)

- [ ] **ADM-001** 비관리자 접근 → notFound
- [ ] **ADM-010** `/admin` 대시보드 카운터: users, pendingVerifs, projects, applications, dancers/pendingDancers, teams/pendingTeams
- [ ] **ADM-020** `/admin/users` 검색, `CreatorToggle` (`setCanCreateProjectAction`) ON/OFF 반영
- [ ] **ADM-030** `/admin/dancers` 승인/거절 (`approveDancerAction`/`rejectDancerAction`), `setDancerDisplayOrderAction`
- [ ] **ADM-040** `/admin/teams` 승인/거절
- [ ] **ADM-050** `/admin/verifications` 인스타 승인/거절 (사유 포함)
- [ ] **ADM-060** `/admin/settlements`에서 `pending` 또는 `requested` 건의 상세를 열고 2단계 확인 후 취소 → 대기열에서 제외
- [ ] **ADM-061** `paid` 건에는 정산 취소 버튼이 노출되지 않고 서버 액션 직접 호출도 거절
- [ ] **ADM-062** 취소와 입금완료가 동시에 요청되면 먼저 반영된 상태만 유지되고 늦은 요청은 상태 변경 오류 반환
- [ ] **ADM-063** 취소된 건은 `/me/settlements`와 `/w/[code]`에서 노출되지 않음
- [ ] **ADM-064** `전체 선택 (N명)`이 금액·계좌가 준비된 `pending`/`requested` 건만 선택하고 표시 인원수와 실제 선택 수가 일치
- [ ] **ADM-065** 전체 선택 해제 후 다계좌이체 파일·일괄 입금완료 버튼이 비활성화

---

## 11. 파일 업로드 / Storage

- [ ] **FILE-001** 프로필 사진 업로드 (dancer_id prefix 경로)
- [ ] **FILE-002** 팀 사진 업로드 (team_id/user_id prefix)
- [ ] **FILE-003** 다른 사용자의 prefix로 업로드 시도 → RLS 차단
- [ ] **FILE-004** 5MB 초과 거절
- [ ] **FILE-005** 허용 외 mime 거절 (예: .exe, .svg)
- [ ] **FILE-006** 사진 교체 시 이전 파일 정리 정책 확인

---

## 12. 권한 / RLS 회귀 매트릭스

| 시나리오 | 비로그인 | 일반유저 | creator | admin | 오너 |
|---|---|---|---|---|---|
| `/feed` 조회 | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/projects/new` | 차단 | 게이트 | ✅ | ✅ | - |
| `/projects/[id]` public | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/projects/[id]` private | 차단 | 신청자만 | 신청자만 | ✅ | ✅ |
| `/projects/[id]/applicants` | 차단 | 차단 | 차단 | 차단(or ✅?) | ✅ |
| `decideApplicationAction` | 차단 | 차단 | 차단 | 차단 | ✅ |
| `/admin/*` | 차단 | 404 | 404 | ✅ | - |
| 다이렉트 제안 발송 | 차단 | 차단 | 차단 | ✅ | ✅ |

- [ ] **RLS-001~** 각 셀별 케이스 작성 (위 표 기준)
- [ ] **RLS-010** 액션 단 RLS 42501 → 한국어 메시지 변환 확인

---

## 13. UI/UX 횡단 점검

- [ ] **UI-001** 모바일 max-width 28rem 레이아웃 유지
- [ ] **UI-002** BottomTabBar: pending 제안 배지 정확도
- [ ] **UI-003** 폼 검증 메시지: zod 첫 이슈만 노출
- [ ] **UI-004** 로딩/제출 중 더블 클릭 방지
- [ ] **UI-005** 한국어 라벨 일관성 (STATUS/PAY_TYPE/SESSION_TYPE/VISIBILITY/APPLICATION_STATUS)
- [ ] **UI-006** 빈 상태 일러스트/카피
- [ ] **UI-007** 에러 토스트/배너 일관성
- [ ] **UI-008** 뒤로가기/리프레시 후 상태 유지

---

## 14. 회귀 시나리오 (End-to-End 흐름)

### 14.1 신규 사용자 → 댄서 지원 → 수락
1. 신규 가입 → 온보딩 댄서 프로필 생성 → 관리자 승인
2. `/feed`에서 공개 프로젝트 발견
3. 개인 지원 → 오너가 수락
4. `/applications` accepted 그룹에 노출

### 14.2 신규 creator → 프로젝트 개설 → 제안 → 수락
1. 가입 → 인스타 인증 요청 → 관리자 승인
2. `/projects/new` 생성 (publish_now=true)
3. `/d/[slug]`에서 댄서에게 다이렉트 제안
4. 댄서가 `/proposals`에서 수락 → 연락처 노출

### 14.3 팀 단위 지원
1. 댄서 A가 팀 생성 → 관리자 승인 → 멤버 추가
2. allow_team_apply=true 프로젝트에 팀으로 지원
3. 오너 수락 → 팀에 결과 반영

### 14.4 프로젝트 라이프사이클
draft → open → (지원 수령) → close → 합의금 입력 → 소프트 삭제

### 14.5 관리자 거절 흐름
- 댄서 거절 → 사용자 `/me/portfolio`에서 사유 확인 → 재신청
- 팀 거절 → 동일
- 인스타 인증 거절 → `/verify-instagram`에서 사유 확인 → 재요청

---

## 15. 미구현 영역 (테스트 대상 아님, 회귀 시 추가)

- 비밀번호 재설정
- 소셜 로그인
- 이메일 인증 전용 UI
- 인앱 알림 페이지 (배지만 존재)
- 결제
- 메시징 (제안 수락 후 연락처 노출이 유일한 컨택 수단)

---

## 부록 A. 핵심 서버 액션 매핑

| 액션 | 파일 |
|---|---|
| `signupAction`, `loginAction`, `logoutAction` | `src/app/actions/auth.ts` |
| `createDancerProfileAction`, `upsertDancerProfileAction` | `src/app/actions/portfolio.ts` |
| `addCareerAction`, `updateCareerAction`, `setCareerVisibilityAction`, `deleteCareerAction` | `src/app/actions/careers.ts` |
| `updateProfileAction` | `src/app/actions/profile.ts` |
| `requestInstagramVerification`, `approveInstagramVerificationAction`, `rejectInstagramVerificationAction` | `src/app/actions/verification.ts` |
| `createProjectAction`, `closeProjectAction`, `deleteProjectAction`, `setAgreedPayAction` | `src/app/actions/projects.ts` |
| `applyToProjectAction`, `withdrawApplicationAction`, `decideApplicationAction`, `sendDirectProposalAction`, `respondToProposalAction` | `src/app/actions/applications.ts` |
| `createTeamAction`, `updateTeamAction`, `addTeamMemberAction`, `removeTeamMemberAction`, `transferTeamLeadAction`, `disbandTeamAction`, `lookupProfileByEmailAction`, `approveTeamAction`, `rejectTeamAction` | `src/app/actions/teams.ts` |
| `approveDancerAction`, `rejectDancerAction`, `setDancerDisplayOrderAction`, `setCanCreateProjectAction` | `src/app/actions/admin.ts` |
| `cancelSettlementAction`, `markSettlementPaidAction`, `markSettlementsPaidAction`, `buildTransferFileAction` | `src/app/actions/settlements.ts` |

## 부록 B. 가드 / 미들웨어

- `src/middleware.ts` — 세션 쿠키 리프레시
- `src/lib/auth/guard.ts` — `getUser`, `requireUser`, `requireProfile`, `requireCreator`
- 레이아웃 `(app)/layout.tsx` — `requireUser` 일괄 적용
