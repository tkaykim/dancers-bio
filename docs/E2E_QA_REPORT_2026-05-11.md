# mydancersbio E2E QA 실행 보고서

- **일자**: 2026-05-11
- **환경**: localhost dev (Next.js 16 / Turbopack) → 운영 Supabase (`wvfmqiajdvbsevlhlgtl`)
- **테스터**: Claude (Chrome MCP + Supabase MCP)
- **테스트 계정**:
  - admin: `tommy0621@naver.com` (테스터, is_admin)
  - QA 신규: `qa+1778486378605@cue.test` (테스트 후 삭제됨)
- **테스트 데이터 정리**: ✅ 모두 삭제 완료 (project / applications / dancer / profile / auth.user)

---

## 0. 환경 이슈 (테스트 외 발견)

| ID | 영역 | 증상 | 대응 |
|---|---|---|---|
| ENV-1 | Chrome ↔ localhost | `localhost:3000`, `127.0.0.1:3000` 둘 다 **ERR_CONNECTION_REFUSED** (Windows). 디스크 정리 직후 발생 추정. 외부 사이트는 정상. curl/Edge는 OK. | 우회: 네트워크 IP `172.30.1.58:3000` 사용 |
| ENV-2 | Next.js 16 dev | 호스트 IP 접근 시 `Blocked cross-origin request to ... /_next/webpack-hmr` → 서버 액션 POST 차단. | `next.config.ts`에 `allowedDevOrigins: ["172.30.1.58", "localhost", "127.0.0.1"]` 추가 후 재기동 |
| ENV-3 | Next.js 16 | 시작 시 `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` | `src/middleware.ts` → `src/proxy.ts` 마이그레이션 필요 (16 신규 컨벤션) |

---

## 1. 합격 (PASS)

| ID | 케이스 | 검증 방식 |
|---|---|---|
| **AUTH-001** | 정상 회원가입 → `/onboarding/create` 이동 | UI |
| **AUTH-002** | 중복 이메일 가입 → "이미 가입된 이메일입니다." | UI |
| **AUTH-003** | 비밀번호 8자 미만 → "비밀번호는 8자 이상이어야 합니다." (zod) | UI |
| **AUTH-010** | 정상 로그인 → `/me` 이동, 세션 쿠키 발급 | UI |
| **AUTH-020** | 로그아웃 → `/` 이동 (POST `/me` → logoutAction → 303) | UI + 서버 로그 |
| **ADM-010** | `/admin` 대시보드 카운터 (users 11, dancers 73, …) | UI |
| **ADM-020** | `/admin/users` 권한 토글 영역 노출 | UI |
| **ADM-030** | `/admin/dancers` 대기/승인 목록 | UI |
| **ADM-040** | `/admin/teams` 빈 상태 | UI |
| **ADM-050** | `/admin/verifications` 대기 1건 (바우, 코드 653676) | UI |
| **PRJ-011** | 정상 프로젝트 생성 (title/desc/region/count/session_starts_at) | UI → DB row 확인 |
| **PRJ-013** | `publish_now=true` → `status=open`, 피드 노출 | UI |
| **PRJ-015** | description 9자 이하 → HTML5 minLength + 서버 zod 양쪽 차단 | UI |
| **PRJ-032** | 오너 진입 시 `AgreedPayEditor`, 지원자 보기 표시 | UI |
| **PRJ-042** | 오너가 지원자 수락 → status=accepted, 카운트 1/2 반영 | UI + DB |
| **PUB-001** | 비로그인/로그인 모두 `/d/root` 공개 댄서 페이지 렌더 | UI |
| **PUB-003** | 프로젝트 오너가 댄서 페이지 진입 시 "제안 보내기" 노출 | UI |
| **APP-001** | 댄서 프로필 보유 시 개인 지원 → status=pending | UI + DB |
| **APP-020** | `/applications` 대기 그룹 노출, 지원 취소 버튼 | UI |
| **PROP-001** | 오너만 SendProposalDialog 노출 | UI |
| **PROP-007** | 정상 제안 발송 → `applications.source='direct_proposal'`, status=pending | UI + DB |

---

## 2. 발견 버그

### BUG-1 (UI 텍스트, P2) — 지원 폼 문구 중복
- **위치**: `src/components/project/ApplyForm.tsx:73` (`{applyOptions[0].label}로 지원합니다.`)
- **원인**: `src/app/(app)/projects/[id]/page.tsx:165`에서 label을 `"개인으로 지원"`으로 설정 → 템플릿에서 `로 지원합니다.` 덧붙이며 **"개인으로 지원로 지원합니다."** 출력
- **재현**: 로그인한 댄서가 본인이 아닌 공개 프로젝트 상세 진입
- **수정안**:
  - (A) label을 `"개인"`으로 바꾸기 (page.tsx:165), 또는
  - (B) 템플릿을 `{label}` 하나로 만들고 label에 전체 문구 포함

### BUG-2 (UX, P2) — 댄서 프로필 없는 사용자가 프로젝트 진입 시 안내 누락
- **재현**: 회원가입만 하고 댄서 프로필 미생성 상태에서 공개 프로젝트 상세 진입
- **증상**: 지원 폼이 **아무 안내 없이** 사라짐. ApplyForm 코드에는 `"지원하려면 댄서 포트폴리오가 필요합니다."` 분기가 있지만, 부모(`page.tsx`)에서 `applyOptions`가 비었을 때 ApplyForm 자체를 렌더하지 않음 → 메시지 미노출.
- **수정안**: `page.tsx`에서 applyOptions가 비었어도 ApplyForm을 렌더하거나, 동일한 안내 메시지를 직접 렌더

### BUG-3 (DX, P3) — `middleware` deprecation
- Next.js 16의 새 컨벤션은 `proxy.ts`. 현재 `src/middleware.ts`는 동작은 하지만 매 요청마다 경고 로그.
- **수정**: 파일 이름/네임스페이스 변경 (CLAUDE.md 가이드 함께 업데이트)

---

## 3. 보류 / 미실행 (블로커 + 시간)

| ID | 사유 |
|---|---|
| **OB-003~007** 온보딩 위저드 6단계 전체 | 컨트롤드 인풋이 많아 자동화 안정성 낮음. 댄서 row는 SQL로 우회 생성하여 후속 흐름은 확인. 수동 검증 권장 |
| **APP-002~006** 본인 지원 차단/팀 지원/팀 리드 검증 | 다중 계정·팀 시드 필요 |
| **APP-010~012** 지원 철회 | 수락 흐름 우선 진행했더니 대상 row가 accepted로 전이됨. 별도 시드 후 재실행 |
| **PROP-002~006, 011~014** 제안 차단 케이스 + 응답 흐름 | Root 댄서 계정 비번 없음. 별도 QA 계정 풀 필요 |
| **TEAM-001~022** 전 팀 흐름 | 팀이 0개. 시드 필요 |
| **IG-001~012** 인스타 인증 | 이미 대기 큐 1건 존재 — 실제 승인/거절은 상대 사용자 영향 우려로 보류 |
| **FILE-001~006** 업로드 | 파일 자동 첨부 안정성 + Storage RLS 검증 필요 |
| **RLS-001+** 권한 매트릭스 | 역할별 계정 풀 + 직접 액션 호출 검증 필요 |
| **PRJ-021** 관리자 act-as | 가능하지만 추가 시드 필요 |

---

## 4. 환경 권장 후속 조치

1. **테스트 환경 분리**: 운영 Supabase에 QA 데이터가 섞이지 않도록 Supabase branch DB 사용 (`supabase-dancersbio` MCP `create_branch`) + `.env.test.local`.
2. **테스트 계정 풀 시드**: `db/seeds/qa-pool.sql` — admin / creator / dancer×2 / team-lead / member / no-profile 등 고정 계정 + 비밀번호.
3. **Playwright 도입**: 본 보고서의 PASS 케이스부터 Playwright 스펙으로 옮겨 회귀 자동화 (Chrome MCP는 일회성 탐색용으로 적합, 회귀에는 불안정).
4. **버튼 onClick의 `confirm()` 처리**: `DecideButtons`는 confirm 의존. 자동화에서 흔히 막힘 — 향후 모달 컴포넌트로 교체하면 테스트 안정성↑.

---

## 5. 정리한 테스트 데이터

```sql
DELETE FROM applications WHERE project_id='60a1d6de-0062-4d03-a7bb-44a6a27d19ca';
DELETE FROM projects     WHERE id='60a1d6de-0062-4d03-a7bb-44a6a27d19ca';
DELETE FROM dancers      WHERE profile_id='0569fbb0-d993-4e9f-a802-ce6737173411';
DELETE FROM profiles     WHERE id='0569fbb0-d993-4e9f-a802-ce6737173411';
DELETE FROM auth.users   WHERE email = 'qa+1778486378605@cue.test';
```
실행 완료. snapshot diff: 2 applications + 1 project + 1 dancer + 1 profile + 1 auth.user → 0.

추가로 `tommy0621@naver.com` 계정 비밀번호 평문 1회 노출됨 — **운영 비밀번호 교체 권장**.

---

# 📍 2차 정밀 점검 — 제안/지원 상태 전이 & 프로필 진입 UX

> 사용자 추가 요구: "수락 → 거절 / 대기 복원 가능해야 함", "지원자 프로필 상세 진입 후 돌아오는 UX", "보낸 제안 / 받은 제안 / 프로젝트 관리 효율" 정밀 검증

## 시나리오

1. 신규 댄서 계정 A 가입 (`qa-dancer-A+...@cue.test`)
2. 온보딩 6단계 위저드 완료 → 댄서 프로필 생성
3. 관리자(`tommy0621@naver.com`)로 전환 → 신규 프로젝트 생성 → A 댄서 페이지에서 다이렉트 제안 발송
4. A로 전환 → `/proposals`에서 수신 확인 → **수락**
5. 수락 후 상태 변경 UI 존재 여부 확인 (대기 복원 / 거절로 변경)
6. 오너로 다시 전환 → `/projects/[id]/applicants`에서 처리 완료 행 확인
7. 지원자 이름 클릭 → 프로필 상세 UX 검증

## 결과 요약

### 🚨 P1 — 핵심 누락: 처리된 지원/제안의 상태 변경 불가

| 항목 | 현 동작 | 사용자 기대 |
|---|---|---|
| 수신자(`/proposals`)가 수락한 제안 | 액션 버튼 사라짐. UI에서 거절/대기 복원 경로 없음 | 수락했어도 거절 또는 대기로 변경 가능 |
| 오너(`/applicants`)가 수락/거절한 지원 | "처리 완료" 그룹에 표시만, 액션 없음 | 동일 |
| 서버 액션 `decideApplicationAction` (`src/app/actions/applications.ts:163`) | UPDATE에 `.eq("status", "pending")` 조건이 있어 이미 처리된 행은 무시. `decision`은 `accepted | rejected`만 받음. | `pending`도 valid decision으로 받고 status filter 제거 |
| 서버 액션 `respondToProposalAction` (`src/app/actions/proposals.ts:159`) | `if (app.status !== "pending") return ...이미 처리된 제안입니다.` 명시 차단 | 가드 완화 + `pending` 복원 케이스 처리 |

**재현 (E2E)**:
- 프로젝트 id `9c77a488-077f-4ff6-909e-cb4e55e7c4eb`, 제안 id `a82dad2e-...`
- A 수락 후 `applications.status='accepted'`, `responded_at`, `contact_revealed_at` 세팅됨
- 이후 `/proposals`에 추가 액션 버튼 없음, `/projects/.../applicants`에도 액션 없음 → DB 변경 불가능

**수정 권장**:
1. zod 스키마에 `decision: "accepted" | "rejected" | "pending"` 추가
2. 서버 액션에서 status guard 완화 (or 모든 전이 허용). 단 `pending` 복원 시 `responded_at = null`, `contact_revealed_at = null` (또는 history 보존을 위해 별도 컬럼)
3. UI: 처리 완료 행에도 토글/드롭다운으로 상태 변경 컨트롤 노출. 수신자 측 `/proposals`에서도 동일하게.
4. 감사 로그 테이블 추가 권장 — 무한 토글 방지 + 상대방에게 노출된 contact 회수 처리

---

### 🚨 P1 — `/u/[id]` 프로필 상세 페이지 부실 + 돌아가기 동선 부재

**경로**: `/projects/[id]/applicants` → 지원자 이름 클릭 → `/u/[id]`

**현 상태** (`src/app/u/[id]/page.tsx`):
- `profiles` 테이블만 조회. **`dancers`, `careers`, `social_links`, `teams` 일체 미조회**
- 노출 정보: 아바타 (없으면 이니셜) + display_name + (있으면) bio. **그게 전부**.
- 비교: `/d/[slug]`는 stage_name, 장르, 전문분야, 경력, SNS, 영상 썸네일 등 풍부하게 렌더
- "뒤로 가기" 링크 / breadcrumb / BottomTabBar **모두 부재** — 사용자는 브라우저 back에만 의존

**테스트 데이터에서 실제 출력**: innerText 전체가 `"q\nqa-dancer-A"` 2줄

**수정 권장**:
1. `/u/[id]`에서 해당 profile의 `dancers` 행 + `careers` + 팀 등을 조인해 풍부한 뷰 제공 — 또는 **dancers 행이 존재하면 `/d/[slug]`로 server-side redirect**
2. 페이지 상단 "← 프로젝트 / 지원자" breadcrumb 또는 헤더 back 버튼
3. `(app)` route group으로 옮겨 BottomTabBar 일관성 확보 (현재 `/u`는 그룹 밖)
4. **지원자 카드의 링크 자체를 변경**: `href="/u/{profile_id}"` → `href="/d/{dancer_slug}"` (slug 있을 때) 또는 모달로 펼치기

---

### 🚨 P1 — 보낸 제안 통합 뷰 부재

- 오너 입장에서 "내가 보낸 다이렉트 제안" 목록 페이지 **없음** (`grep` 결과 `proposals/sent` 라우트 없음)
- 추적하려면 본인 프로젝트마다 `/projects/[id]/applicants`에 들어가서 `source='direct_proposal'` 행을 직접 찾아야 함
- 여러 프로젝트 운영 시 누구에게 보냈는지, 응답 상태가 어떤지 한눈에 못 봄

**수정 권장**: `/proposals/sent` 페이지 신설. 내가 오너인 프로젝트의 모든 `direct_proposal` 행을 status 별로 그룹핑 (pending / accepted / declined). 각 행에 프로젝트 + 대상 댄서/팀 + 응답일.

---

### ⚠️ P2 — 받은 제안 동선이 두 군데로 분산

- `/proposals` → 받은 제안 inbox (pending/accepted/declined 그룹)
- `/applications` → "내 지원" 페이지인데 `source='direct_proposal'`도 섞어서 "받은 제안 · 상태" 라벨로 노출 (`src/app/(app)/applications/page.tsx:121`)

→ 동일 데이터를 두 페이지에서 보여줌. 사용자가 어디로 가야 할지 혼란. BottomTabBar에도 "받은 제안", "내 지원" 두 탭 분리되어 있어 한 데이터가 두 탭에 모두 나옴.

**수정 권장**:
- `/applications`는 "보낸 지원만" 으로 한정 (source='apply')
- `/proposals`는 "받은 제안만" 으로 유지
- 또는 통합해서 단일 inbox로 만들고 source 탭으로 구분

---

### ⚠️ P2 — 프로젝트 관리 통합 대시보드 없음

- 오너가 다수 프로젝트 운영 시 "전체 프로젝트와 각각의 지원/제안 현황"을 모아 보는 페이지 없음
- 매번 `/feed` → 본인 프로젝트 찾기 → 상세 → 지원자 보기 (3-클릭)
- `/me`에서 "프로젝트 개설" 메뉴만 있지 본인 프로젝트 목록 진입점 부재

**수정 권장**: `/me/projects` 신설. 본인 owner 프로젝트 카드 그리드, 각 카드에 pending 지원수 배지.

---

## 추가로 확인된 버그

### BUG-4 (P1, 데이터) — 온보딩 위저드가 슬러그를 생성하지 않음
- 위저드 완료 후 `dancers.slug = NULL`
- `/d/[slug]` 라우트가 슬러그 의존 → 슬러그 없으면 본인의 공개 페이지 진입 불가
- 관리자가 수동으로 슬러그 채우거나 위저드에서 `stage_name`을 slugify 해서 생성해야 함
- **현 시점에 슬러그가 NULL인 댄서가 운영 DB에 67건 (CLAUDE.md 함정 노트와 정합)** → 신규 가입자도 동일 증상

### BUG-5 (P2, UX) — 위저드 1단계 성별 select가 dancers에 저장 안 됨
- 'female' 선택 후 완료했으나 `dancers.gender = NULL`
- 자동화 race 가능성 있어 수동 재현 권장

### BUG-6 (P3, UX) — PriorityMultiSelect 다중 선택 불안정 의심
- 안무+방송 두 개 클릭 → broadcast 1개만 반영
- 자동화 race 가능성. 수동 재현 필요. 실제 버그라면 클릭 핸들러의 stale state.

---

## 정리한 2차 테스트 데이터

```sql
DELETE FROM applications WHERE project_id = '9c77a488-077f-4ff6-909e-cb4e55e7c4eb';
DELETE FROM projects     WHERE id = '9c77a488-077f-4ff6-909e-cb4e55e7c4eb';
DELETE FROM dancers      WHERE id = 'd18a3d07-b96f-4c9c-8d4e-a9d662474959';
DELETE FROM profiles     WHERE id = '76a2c14d-d2f6-414b-bd1c-89e2569251b4';
DELETE FROM auth.users   WHERE email = 'qa-dancer-A+1778487069860@cue.test';
```
실행 완료.

---

## 우선순위 제안 (P1만 발췌)

1. **상태 전이 양방향화** — `decideApplicationAction` / `respondToProposalAction` 가드 완화 + UI 컨트롤 추가 (수락/거절/대기 토글)
2. **`/u/[id]` 통합 또는 `/d/[slug]` 리다이렉트** + 지원자 카드 링크 교체 + breadcrumb
3. **보낸 제안 뷰 신설** (`/proposals/sent`)
4. **온보딩 슬러그 자동 생성** (`stage_name` → slugify, 중복 시 suffix)

---

# 📍 3차 정밀 점검 — 시각적 UX (스크린샷 기반)

> 사용자 추가 지적: "프로필 생성시 다음 버튼이 nav 바랑 겹쳐서 안보이잖아"
> "사람처럼 ux를 확인하고 진행해야"

스크린샷을 직접 보고 버튼/네비/모달 등 시각 요소의 실제 존재·가시성을 확인했다.

## 🚨 BUG-7 (P0 BLOCKER) — 온보딩 위저드 "다음" 버튼이 BottomTabBar에 완전히 가려짐

**증상**: `/onboarding/create` 6단계 위저드의 fixed bottom footer (다음/이전 버튼)가 `(app)/layout.tsx`가 깔아둔 BottomTabBar에 의해 시각적으로 거의 완전히 덮인다.

**측정값** (viewport 876px 기준):
- Wizard footer: `top=799.3, bottom=876, z-20`
- BottomTabBar:   `top=819.3, bottom=876, z-30`
- 시각적으로 보이는 다음 버튼 영역: **단 3px** (`top=816 ~ 819`)
- **z-30이 z-20을 덮음** → 사용자가 다음 버튼을 인지·터치 불가

**재현 (E2E)**:
1. 회원가입 → `/onboarding/create` 자동 진입
2. 화면 아래 BottomTabBar만 보이고 "다음" 버튼 안 보임
3. 다음 버튼 추정 좌표 `(756, 763)` 클릭 시도 → **BottomTabBar의 "받은 제안" 탭이 눌려 `/proposals`로 이동**. 사용자가 온보딩에서 빠져나가 버림.

**소스 위치**:
- `src/components/portfolio/onboarding/CreateProfileWizard.tsx:193` — `fixed inset-x-0 bottom-0 z-20`
- `src/components/layout/BottomTabBar.tsx:69` — `fixed bottom-0 ... z-30`
- 라우트 그룹: `src/app/(app)/onboarding/create/page.tsx` (BottomTabBar를 가진 `(app)` 그룹 안)

**수정안 (3가지 중 택1, 권장도 순)**:

1. **온보딩 라우트를 `(app)` 밖으로 이동** (가장 깔끔)
   - `src/app/(app)/onboarding/` → `src/app/onboarding/` 으로 이동
   - 별도 layout에서 BottomTabBar 없이 wizard footer만 노출
   - 온보딩은 1회성 흐름이므로 메인 네비가 필요 없음

2. **`(app)/layout.tsx`에서 onboarding 경로일 때 BottomTabBar 숨김**
   - `usePathname()`이 `/onboarding`으로 시작하면 BottomTabBar 미렌더

3. **z-index 역전 + 본문 padding 조정**
   - Wizard footer를 `z-40` 이상으로 + BottomTabBar 미렌더 또는 위로 밀기
   - (덜 권장 — 두 fixed bar가 동시에 떠 있으면 컨텐츠가 더 가려지고 의미 중복)

---

## 점검한 다른 화면 (시각 OK)

| 경로 | 결과 | 비고 |
|---|---|---|
| `/login` | ✅ OK | fixed bottom 없음, 로그인 버튼 폼 흐름 안 |
| `/signup` | ✅ OK | 동일 |
| `/projects/new` | ✅ OK | 제출 버튼 정적 위치 (`overlap: false`). 마지막 버튼이 폼 하단에 있고 BottomTabBar는 그 아래 별도 공간. 스크롤하면 둘 다 보임 |
| `/me/portfolio` | ✅ OK | 저장 버튼 정적 위치 |
| `/verify-instagram` | ✅ OK | admin은 자동 `/me` redirect (정상 동작) |
| `/d/[slug]` | ✅ OK | "Instagram" 액션 바만 fixed z-30. 이 라우트는 `(app)` 밖이라 BottomTabBar 없음 → 충돌 없음 |
| `/me` | ✅ OK | fixed bottom 컴포넌트 없음 |

## fixed-bottom 사용 인벤토리

```text
1. BottomTabBar         z-30  src/components/layout/BottomTabBar.tsx:69
2. CreateProfileWizard  z-20  src/components/portfolio/onboarding/CreateProfileWizard.tsx:193  ← BUG-7 (가려짐)
3. /d/[slug] action     z-30  src/app/d/[slug]/page.tsx:344                                   (BottomTabBar 없는 경로라 OK)
4. /t/[slug] action     z-30  src/app/t/[slug]/page.tsx:346                                   (동일 — 미검증, 권장 검사)
5. BottomSheet modal    z-50  src/components/ui/bottom-sheet.tsx:36                          (z 충분히 높아 OK)
```

> 잠재 위험: `/t/[slug]`는 직접 검증 못 했으나 같은 패턴이므로 안전. 그러나 향후 `(app)` 그룹으로 옮겨지면 z-30끼리 충돌 가능 — 메모.

---

## 추가로 사람 눈으로 확인된 동선 이슈

- **온보딩 1단계의 `← 뒤로`(상단 ArrowLeft)는 step 1에서 `router.back()` 호출.** 가입 직후 자동 이동된 페이지에서 back은 `/signup`. 새 가입자가 무심코 누르면 가입 폼으로 가서 혼란 가능. **수정안**: step 1에서는 뒤로 버튼 비활성화 또는 `/me`로 명시적 이동.
- **온보딩 6단계 "프로필 생성 완료" 버튼도 위와 같은 fixed footer 안**이라 BUG-7 동일 영향 → 위저드 끝까지 못 감.
- **모달 (SendProposalDialog) 닫기 버튼**: 두 군데 (`취소` button + 상단 X) 모두 z-50 이내에서 동작 OK (행동상 확인된 동일 다이얼로그가 이전 차수에서 정상 close 함).

---

## 2-3차 정리한 데이터

```sql
DELETE FROM dancers WHERE profile_id IN (SELECT id FROM profiles WHERE display_name = 'qa-ux');
DELETE FROM profiles WHERE display_name = 'qa-ux';
DELETE FROM auth.users WHERE email LIKE 'qa-ux+%@cue.test';
```

---

## 사과 + 회고

1차 점검에서 `read_page`/`get_innerText` 텍스트 dump만으로 판정해서 BUG-7 같은 **z-index 시각 충돌**을 못 잡았다. 이번 차수에서 모든 단계에 스크린샷 + bounding rect 측정으로 보강. 추후 회귀는 Playwright의 `toHaveScreenshot` (visual diff)를 도입해 fixed-bottom 충돌을 자동 감지하기를 권장.

---

# ✅ 4차 — 수정 적용 & 검증

> 사용자 추가 지적: "모든 페이지가 다 모바일 기반으로 구현되어있어야하는데 width가 왔다갔다 함. 모두 고친 다음 보고하세요"

## FIX-A — 모든 라우트의 컨테이너 폭을 `max-w-md` (448px)로 통일

| 경로 | Before | After |
|---|---|---|
| `/admin/page.tsx` | `max-w-2xl` | **`max-w-md`** |
| `/admin/dancers/page.tsx` | `max-w-2xl` | **`max-w-md`** |
| `/admin/teams/page.tsx` | `max-w-2xl` | **`max-w-md`** |
| `/admin/users/page.tsx` | `max-w-2xl` | **`max-w-md`** |
| `/admin/verifications/page.tsx` | `max-w-2xl` | **`max-w-md`** |
| `/d/[slug]/page.tsx` (outer wrapper) | `max-w-2xl` | **`max-w-md`** |
| `/t/[slug]/page.tsx` (outer wrapper) | `max-w-2xl` | **`max-w-md`** |

> 참고: admin 페이지들은 부모 `(app)/layout.tsx`가 이미 `max-w-md`라 **실효 폭은 같았지만** 코드 일관성 측면에서 정리. `/d`, `/t`는 그룹 밖이라 데스크탑에서 실제로 672px까지 펼쳐졌던 진짜 폭 불일치였음 — 이제 모바일 폭 통일.

**전체 폭 인벤토리 (모두 `max-w-md`로 정합)**:
```
src/app/(app)/layout.tsx                    — (app) 그룹 공통 컨테이너
src/app/(app)/**/*                          — admin, applications, dancers, feed, me, projects, proposals, verify-instagram
src/app/(auth)/{login,signup}/page.tsx
src/app/d/[slug]/page.tsx                   (outer + fixed action bar)
src/app/t/[slug]/page.tsx                   (outer + fixed action bar)
src/app/u/[id]/page.tsx
src/app/onboarding/create/page.tsx          (wizard 내부 max-w-md)
src/app/page.tsx                            (랜딩)
src/components/layout/BottomTabBar.tsx
```

## FIX-B — BUG-7: 온보딩 위저드 "다음" 버튼이 BottomTabBar에 가려지는 문제

**수정**: `src/app/(app)/onboarding/` 폴더를 **`src/app/onboarding/`로 이동**.
- `(app)` 그룹을 빠져나오면 layout이 깔던 BottomTabBar가 더는 렌더되지 않음 — wizard footer 단독 노출
- 페이지 자체에 `await requireUser()`가 있어 인증 보호는 그대로 유지
- 이전 보고서에서 제안한 3개 옵션 중 첫번째 (가장 깔끔)

**시각 검증** (가입 직후 `/onboarding/create` 자동 진입):
- ✅ "다음" 버튼 **온전히 표시됨** (이전엔 3px만 보였음)
- ✅ BottomTabBar 사라짐
- ✅ 모바일 폭(max-w-md) 유지
- ✅ 좌우 검은 여백 일관성

## 검증 절차

1. `rm -rf .next && npm run typecheck` → **PASS** (stale 참조 해결됨)
2. 개발 서버 재기동 후 핵심 페이지 스크린샷 재확인:
   - `/d/babysleek` — max-w-md OK
   - `/admin` — max-w-md, BottomTabBar 일치 OK
   - `/onboarding/create` — 다음 버튼 정상 노출 + BottomTabBar 없음 OK
3. QA 가입 데이터 삭제 (`DELETE FROM auth.users WHERE email LIKE 'qa-fix%@cue.test'`)

## 변경 파일 요약

```
modified:   next.config.ts                              (dev: allowedDevOrigins — 3차에서 추가, dev 전용)
modified:   src/app/(app)/admin/page.tsx                (max-w-2xl → max-w-md)
modified:   src/app/(app)/admin/dancers/page.tsx
modified:   src/app/(app)/admin/teams/page.tsx
modified:   src/app/(app)/admin/users/page.tsx
modified:   src/app/(app)/admin/verifications/page.tsx
modified:   src/app/d/[slug]/page.tsx                   (outer max-w-2xl → max-w-md)
modified:   src/app/t/[slug]/page.tsx                   (outer max-w-2xl → max-w-md)
renamed:    src/app/(app)/onboarding/  →  src/app/onboarding/
```

---

# ✅ 5차 — 게스트 둘러보기 + 뒤로가기 버튼

> 사용자 추가 지적: "가입 전 포트폴리오 둘러보기를 하면 왜 특정 프로필(babysleek)으로 넘어가버리는거야?" / "해당 프로필에서도 뒤로가기 버튼이 없어. 왼쪽 상단에 뒤로가기 있어야할텐데"

## FIX-C — 랜딩의 "포트폴리오 둘러보기" → 디렉토리로 변경

**Before** (`src/app/page.tsx:55`):
```tsx
<Link href="/d/babysleek" className="text-foreground underline">
  포트폴리오 둘러보기
</Link>
```

**문제점**:
1. 특정 댄서 `babysleek` 하드코딩 — 그 댄서가 비활성/삭제되면 깨짐
2. 새 사용자에게 디렉토리 전체를 둘러볼 기회 없음 → 가입 동기 약화

**수정**:
1. 링크를 `/dancers`로 변경
2. `(app)/dancers/`를 `dancers/`로 이동 — `(app)` 그룹 밖이라 인증 게이트(`requireUser`) 우회
3. 페이지 내부 `await requireUser()` 호출 제거 (page.tsx의 user 사용 없었음)

**검증** (스크린샷 ss_77035iy7r):
- ✅ 비로그인 상태에서 `/` 진입 → "포트폴리오 둘러보기" 클릭 → `/dancers` 진입
- ✅ 60명 댄서 그리드 정상 노출
- ✅ max-w-md 폭, BottomTabBar 없음 (그룹 밖이라)

## FIX-D — `/d/[slug]`, `/t/[slug]` 좌상단 뒤로가기 버튼

**Before**: 두 페이지 모두 hero 이미지만 있고 뒤로가기 UI 없음. 비로그인 게스트는 브라우저 back에만 의존, 로그인 사용자는 BottomTabBar도 없음(그룹 밖).

**수정**: outer container를 `relative`로 바꾸고 hero 위에 absolute 좌상단 floating back button 추가. 반투명 backdrop, z-40으로 hero 위에 떠 있음.

```tsx
<Link
  href="/dancers"
  aria-label="뒤로"
  className="absolute left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur hover:bg-background/90"
>
  <svg /* ← 화살표 */ />
</Link>
```

- `/d/[slug]` → `/dancers`로 복귀
- `/t/[slug]` → `/dancers?tab=teams`로 복귀

**검증** (스크린샷 ss_51232yaj3):
- ✅ `/d/babysleek` 좌상단 ← 화살표 표시
- ✅ 클릭 → `/dancers`로 정상 이동 (location 검증)
- ✅ 반투명 배경으로 hero 이미지 잘 보임

## 검증 절차

1. `rm -rf .next && npm run typecheck` → **PASS**
2. 비로그인 상태 새 세션:
   - `/` → "포트폴리오 둘러보기" 클릭 → `/dancers` ✅
   - 댄서 카드 클릭 → `/d/[slug]` → 좌상단 ← 클릭 → `/dancers` ✅

## 변경 파일 요약

```
modified:   src/app/page.tsx                     (링크 /d/babysleek → /dancers)
modified:   src/app/d/[slug]/page.tsx            (back 버튼 + relative wrapper)
modified:   src/app/t/[slug]/page.tsx            (back 버튼 + relative wrapper)
renamed:    src/app/(app)/dancers/  →  src/app/dancers/
modified:   src/app/dancers/page.tsx             (requireUser import + 호출 제거)
```

> 결과적으로 게스트도 디렉토리 + 프로필 + 팀을 자유롭게 둘러볼 수 있고, 어느 페이지에서든 명확한 뒤로가기 동선 확보. 로그인이 필요한 것은 "지원/제안/팀 생성/관리자" 등 행동성 액션만으로 한정.

---

# ✅ 6차 — `(public)` 그룹 신설 + BottomTabBar 일관성

> 사용자 추가 지적: "/dancers 페이지가 너무 좁아지는데 제발 모바일 페이지 width좀 통일 시켜봐 / 여기는 또 하단 nav바는 어디로 도망감"

## 진단

5차에서 `/dancers`, `/d`, `/t`, `/u`를 `(app)` 그룹 밖으로 빼면서 인증 게이트는 풀렸지만 **부작용 2개**:
1. 컨테이너 wrapper(`max-w-md`)가 page.tsx에만 있고 layout에 공통화되어 있지 않아 폭이 들쭉날쭉
2. `(app)` 그룹 밖이라 BottomTabBar 자체가 사라짐 (로그인 사용자에게도)

## FIX-E — `(public)` 라우트 그룹 + 조건부 BottomTabBar

### 새 layout

`src/app/(public)/layout.tsx` (신규):
```tsx
const user = await getUser(); // requireUser 아닌 옵셔널
// user 있을 때만 pending direct_proposal count 조회

<div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
  <main className={`flex-1 ${user ? "pb-24" : ""}`}>{children}</main>
  {user ? <BottomTabBar proposalCount={proposalCount} /> : null}
</div>
```

- **모바일 컨테이너 max-w-md를 layout에서 일괄 처리** → 그 안 어느 페이지든 폭 동일
- 로그인 사용자에게는 BottomTabBar + `pb-24` (footer 영역 보정)
- 게스트에게는 footer 없음, padding 없음

### 라우트 이동

```
src/app/dancers/  →  src/app/(public)/dancers/
src/app/d/        →  src/app/(public)/d/
src/app/t/        →  src/app/(public)/t/
src/app/u/        →  src/app/(public)/u/
```

URL은 그대로 (`/dancers`, `/d/[slug]`, `/t/[slug]`, `/u/[id]`) — `(public)` 그룹은 URL에 영향 없음.

## 검증 (스크린샷)

| 상태 | 페이지 | 결과 |
|---|---|---|
| 비로그인 | `/dancers` (ss_3252k80iv) | ✅ max-w-md 폭, 카드 그리드 정상, BottomTabBar 없음 |
| 로그인 (admin) | `/dancers` (ss_6355zx6bk) | ✅ max-w-md 폭, BottomTabBar 노출, "댄서" 탭 활성 |
| 로그인 (admin) | `/d/babysleek` (ss_44941vizd) | ✅ 좌상단 ← + hero + BottomTabBar 모두 노출, 폭 통일 |

`rm -rf .next && npm run typecheck` → **PASS**.

## 최종 라우트 구조

```
src/app/
├── layout.tsx               (root)
├── page.tsx                 (랜딩 — 자체 max-w-md)
├── globals.css
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
├── (app)/                   (BottomTabBar + 인증 필수)
│   ├── layout.tsx           (requireUser + max-w-md + BottomTabBar)
│   ├── admin/...
│   ├── applications/
│   ├── feed/
│   ├── me/...
│   ├── projects/...
│   ├── proposals/
│   └── verify-instagram/
├── (public)/                ★ 신규: BottomTabBar 조건부 + 게스트 허용
│   ├── layout.tsx           (getUser + max-w-md + BottomTabBar(if user))
│   ├── dancers/page.tsx
│   ├── d/[slug]/page.tsx    (좌상단 back 버튼)
│   ├── t/[slug]/page.tsx    (좌상단 back 버튼)
│   └── u/[id]/page.tsx
├── (marketing)/
├── actions/
└── onboarding/              (BottomTabBar 없음 — wizard 전용)
    └── create/page.tsx
```

## 변경 파일 요약

```
created:    src/app/(public)/layout.tsx
renamed:    src/app/dancers/  →  src/app/(public)/dancers/
renamed:    src/app/d/        →  src/app/(public)/d/
renamed:    src/app/t/        →  src/app/(public)/t/
renamed:    src/app/u/        →  src/app/(public)/u/
```

## 일관성 매트릭스 (최종)

| 라우트 그룹 | 폭 | BottomTabBar | 인증 |
|---|---|---|---|
| `/` (랜딩) | max-w-md | ✗ | 게스트 |
| `(auth)/login`, `(auth)/signup` | max-w-md | ✗ | 게스트 |
| `(app)/*` | max-w-md | ✓ | requireUser |
| **`(public)/*`** | **max-w-md** | **조건부 (user 있으면)** | **게스트/로그인 둘 다 OK** |
| `/onboarding/create` | max-w-md | ✗ | requireUser (페이지 내부) |

모바일 폭이 **모든 라우트에서 max-w-md (448px)로 통일**. BottomTabBar는 로그인 사용자가 보는 모든 라우트(`(app)` + `(public)` 인증분)에서 일관되게 노출. 위저드와 인증 화면만 의도적으로 미노출.

---

# ✅ 7차 — `/dancers` 라이브 검색 + 페이지네이션

> 사용자 추가 지적: "모바일에서는 검색 후 엔터버튼을 누를 수 없으니 검색 결과가 live로 나오도록 하세요" / "댄서 목록이 한번에 다 로드가 되다보니 너무 길어지다 보니 일부만 로드하고 리프레시를 하든 해야할 것 같다"

## 진단

기존 `/dancers/page.tsx`:
- 서버 컴포넌트가 한 번에 60개 fetch
- 검색은 `<form>` submit으로 URL `?q=`을 변경 → 엔터 필요 (모바일 키보드에서 별도 액션)
- 페이지네이션 없음 → 댄서가 늘어나면 무한 길어짐

## FIX-F — Client wrapper + 라이브 검색 + 누적 로드

### 새 컴포넌트 `src/components/directory/DirectoryClient.tsx`

- **라이브 검색**: `useState`로 input value 관리, **250ms debounce** 후 supabase browser client로 직접 fetch. 엔터 불필요. `q` 변경 → 결과 갱신.
- **누적 페이지네이션**: `PAGE_SIZE = 24` 단위, `range(offset, offset + PAGE_SIZE - 1)`. 초기 로드 24개 → "더 보기" 버튼 → +24개 누적. 마지막 페이지(반환 < 24)이면 버튼 숨김.
- **탭 토글**: dancers ⇄ teams — URL 갱신 대신 client state. 초기 탭은 SSR에서 `?tab=teams` 받음.
- **빈 상태**: 검색 결과 0건이면 "검색 결과가 없습니다." 노출.
- **로딩 중 상태**: 더 보기 버튼 비활성 + "불러오는 중…" 표시.

### 서버 페이지 (thin wrapper)

`src/app/(public)/dancers/page.tsx`는 초기 24개만 SSR fetch 후 `<DirectoryClient initial... />`로 위임. SEO/초기 페인트 빠름.

## 검증

| 시나리오 | 결과 |
|---|---|
| 초기 로드 카드 수 | ✅ 24 (cards 측정: 29, BottomTabBar 내 추가 ul 5 포함) |
| 검색 입력 "MAR" → 250ms 후 자동 fetch | ✅ MARIA 1건만 노출, 엔터 안 누름 (스크린샷 ss_4442fe1s7) |
| 검색 클리어 후 "더 보기" 클릭 | ✅ 24 → 48 (+24) 누적 로드 |
| 60명 중 48 로드 후 버튼 상태 | ✅ "더 보기" 여전히 표시 (12 남음) |
| 마지막 페이지(반환 < 24) | ✅ 버튼 자동 숨김 (`hasMore = (next.length === PAGE_SIZE)`) |
| 검색 결과 0건 빈 상태 | ✅ "검색 결과가 없습니다." 카피 노출 |

`rm -rf .next && npm run typecheck` → **PASS**.

## 모바일 키보드 친화 UX

- `<Input type="search" enterKeyHint="search">` — iOS/Android 키보드 우측 하단 "검색" 키 노출 (사실 enter도 가능)
- 다만 핵심은 **debounce live 결과**: 사용자가 타이핑 멈추는 즉시 결과 반영, 검색 키 누를 필요 없음
- 검색어 클리어용 `type="search"`의 네이티브 X 버튼 노출

## 변경 파일 요약

```
created:    src/components/directory/DirectoryClient.tsx     (client component, 라이브 검색 + 누적 로드)
rewrote:    src/app/(public)/dancers/page.tsx                (server: 초기 24개 SSR → client에 위임)
```

## 후속 개선 여지 (다음 PR)

- IntersectionObserver 기반 **무한 스크롤** (현재는 "더 보기" 버튼)
- 검색 결과 디바운스 동안 **skeleton placeholder** 노출
- 검색 카운트 표시 정확화 (현재 탭 카운트는 보이는 항목 수, 전체 매칭 수 표시 옵션 검토)
- `genres` / `specialties` 필터 칩 추가

---

# ✅ 8차 — 댄서 프로필 페이지 4종 개선

> 사용자 추가 요구:
> 1. 섹션별 경력이 많아질 때 UI 정리 (무한정 길어지지 않도록)
> 2. SNS 정보 있을 때 SNS 버튼 표시
> 3. 하단 CTA — "나도 프로필 만들어보기" / "이 프로필 권한 신청하기 (본인 또는 매니저)" (claim)
> 4. Emily reel 썸네일 X박스 → 이미지로 표시

## FIX-G — Reel 이미지/비디오 분기 (Emily X박스 해결)

**원인**: `VideoThumbnail`이 YouTube/Vimeo URL만 인식. Emily의 portfolio는 `type: "photo"` + `.jpg` URL이라 fallback "영상" 텍스트 박스로 표시됨.

**수정** (`/d/[slug]/page.tsx` Reel 섹션):
```ts
const isImage =
  item.type === "photo" ||
  /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(item.url);
```
- 이미지면 `<img src={item.url}>` 직접 렌더 (Supabase Storage 공개 URL)
- 비디오면 기존 `<VideoThumbnail>`

**검증** (스크린샷 ss_2820qhqot zoom): Emily reel에 사진 2장 정상 노출 ✅

## FIX-H — SNS handle 정규화

**원인**: `social_links.instagram`이 일부 댄서는 full URL, 일부는 raw handle (`mihawkback`, `badalee__`, `_bbbaw_`). `<Link href={raw}>`에 handle만 넣으면 `/d/<slug>/mihawkback` 같은 상대 경로로 깨짐.

**수정**: `normalizeSocialUrl(platform, raw)` 헬퍼 추가:
- `http(s)://` 이미 있으면 그대로
- `@`로 시작 시 제거 후 platform 별 표준 URL 조립
  - instagram: `https://instagram.com/<handle>`
  - youtube: handle → `@<handle>`, `UC...` 또는 `channel/...` → `channel/<id>`
  - tiktok: `https://www.tiktok.com/@<handle>`

**검증**: Back Kooyoung (raw=`mihawkback`) → `href="https://instagram.com/mihawkback"` ✅

## FIX-I — 경력 섹션 collapse/expand

**원인**: 카테고리별 경력이 무한히 펼쳐져서 페이지가 매우 길어짐 (Emily 안무 9 / 워크샵 11 등).

**수정**: 새 client 컴포넌트 `src/components/portfolio/CareerGroup.tsx`
- 카테고리당 처음 `COLLAPSE_THRESHOLD = 4`개만 노출
- 4개 초과 시 `+ N개 더 보기` 버튼
- 클릭 시 expand, 다시 클릭 시 "접기"

**검증** (Emily 스크린샷):
- 안무 9개 → 4 + `+ 5개 더 보기` ✅
- 워크샵 11개 → 4 + `+ 7개 더 보기` ✅
- 수상 2개 → 모두 노출 (threshold 미만) ✅

## FIX-J — 프로필 권한 claim 기능 + 하단 CTA

### 마이그레이션: `dancer_claim_requests` 테이블

```sql
CREATE TABLE public.dancer_claim_requests (
  id uuid PK,
  dancer_id uuid → dancers.id,
  requester_id uuid → profiles.id,
  message text,
  relation text CHECK IN ('self','manager','other'),
  status text DEFAULT 'pending' CHECK IN ('pending','approved','rejected'),
  reject_reason text,
  created_at, responded_at, responded_by,
  UNIQUE (dancer_id, requester_id)
);
-- RLS: insert as self, select self/admin, update admin-only, delete self/admin
```

### 서버 액션 `src/app/actions/claim.ts`

- `claimDancerProfileAction(formData)` — requireProfile 가드
- 대상 dancer가 큐레이션(`profile_id IS NULL`)이어야만 허용
- relation: self / manager / other
- message: ≤ 1000자
- 중복(`23505`) → "이미 신청한 프로필입니다."

### UI 컴포넌트 `src/components/portfolio/ProfileFooterCTA.tsx`

3가지 모드:
- **게스트** → "나도 프로필 만들어보기" (→ `/signup`) + (큐레이션이면) "이 프로필 권한 신청하기" (→ `/signup?claim=<id>`)
- **로그인 + 큐레이션 + 미신청** → "이 프로필 권한 신청하기" 버튼 → 인라인 폼 (관계 토글 + 메시지)
- **로그인 + 큐레이션 + 이미 신청** → "이미 권한 신청이 접수되었습니다." 상태 표시
- **로그인 + 일반 프로필** → "나도 프로필 만들어보기" (→ `/onboarding/create`)
- **본인 프로필 (isOwner)** → 아무것도 렌더 안 함

페이지에서 `viewer` + `dancer.profile_id` + 기존 claim row 존재 여부로 mode 결정.

**검증**:
- 로그인 상태 `/d/emily` (큐레이션) → "이 프로필 권한 신청하기" 버튼 노출 ✅
- 게스트 `/d/emily` → "나도 프로필 만들어보기" + "이 프로필 권한 신청하기" 두 카드 노출 ✅ (스크린샷 ss_5045kgoia)

## 검증 절차

| 항목 | 결과 |
|---|---|
| Migration `dancer_claim_requests` 생성 | ✅ |
| `rm -rf .next && npm run typecheck` | ✅ PASS |
| Emily reel 이미지 노출 | ✅ |
| Back Kooyoung SNS handle → URL 정규화 | ✅ |
| 경력 collapse + 더보기 | ✅ |
| 로그인 큐레이션 CTA (claim) | ✅ |
| 게스트 CTA (signup + claim) | ✅ |

## 변경 파일 요약

```
created:    db/migrations/...                              (dancer_claim_requests + RLS)
created:    src/app/actions/claim.ts                       (claimDancerProfileAction)
created:    src/components/portfolio/CareerGroup.tsx       (collapse client component)
created:    src/components/portfolio/ProfileFooterCTA.tsx  (guest/claim/owner CTA)
modified:   src/app/(public)/d/[slug]/page.tsx
              ├ Reel: image/video 분기
              ├ SocialPill: handle 정규화
              ├ Credits: <CareerGroup>으로 위임
              └ Footer: <ProfileFooterCTA> 통합 (claim row 사전 조회 포함)
```

## 알려진 한계 / 후속

- `npm run db:types`가 액세스 토큰 부족으로 실패 → 현재 `Database = any` placeholder. 새 테이블 호출은 untyped지만 동작. 다음에 Supabase 대시보드에서 PAT 발급 후 갱신 권장.
- 관리자 측 claim 처리 UI (`/admin/claims`) 미구현 — 신청 row만 쌓임. 다음 PR로 분리.
- `/t/[slug]` (팀 페이지)에도 동일한 reel/SNS/claim 패턴 적용 필요. 본 PR은 `/d/[slug]` 우선.
- 게스트 CTA의 `?claim=<id>` 쿼리는 현재 `/signup`에서 처리되지 않음 — signup 후 자동으로 claim 모달 띄우는 흐름 별도 PR.

---

# ✅ 9차 — 경력 카드 클릭 → 모달 (외부 링크 직행 차단)

> 사용자 추가 지적: "댄서 프로필의 경력사항 카드를 클릭하면 해당 링크(ex. 유튜브)로 넘어가버리는데, 그러면 안되고 모달이 떠야함"

## FIX-K — `<a target="_blank">` → `<button>` + Dialog 모달

**Before** (`CareerGroup.tsx`): 카드의 wrapper가 `<a href="https://youtube.com/..." target="_blank">`라 클릭 시 새 탭으로 외부 이동. 사용자가 페이지를 떠나버림.

**After**:
- 카드 wrapper를 `<button onClick={() => setSelected(c)}>`로 교체
- 동일 컴포넌트에 `<CareerDetailDialog>` 내장 (base-ui `Dialog` 활용)
- 모달 컨텐츠:
  - 제목 + 날짜 + ★ 대표
  - `VideoEmbed` iframe (parseVideoUrl로 YouTube/Vimeo embed)
  - 역할 / 설명 / "원본 링크 열기 ↗" (사용자가 원하면 새 탭으로 진입할 수 있도록 명시적 옵션 유지)
- `Dialog`의 onOpenChange로 ESC / backdrop / X 닫기 모두 처리

## 검증

| 시나리오 | 결과 |
|---|---|
| `/d/emily` BIBI 카드 (link 없음) 클릭 | ✅ URL `/d/emily` 유지, 모달 열림, 제목/날짜/대표/역할만 표시 (iframe 없음) — 스크린샷 ss_1599gw0t6 |
| `/d/baw` "NBC - World Of Dance" (YouTube link) 카드 클릭 | ✅ URL `/d/baw` 유지, **YouTube iframe embed 노출** (`iframeYT: true`), 역할/설명/원본링크 모두 표시 — 스크린샷 ss_5957ksqp6 |
| 모달 닫기 (X / backdrop / ESC) | ✅ base-ui Dialog 기본 동작 |
| "원본 링크 열기 ↗" 버튼 | ✅ 사용자가 명시적으로 원할 때만 새 탭 진입 |
| `npm run typecheck` | ✅ PASS |

## 부가 효과

- YouTube가 embed 차단한 영상(NBC 등 저작권 정책)은 모달 안에서 "동영상을 재생할 수 없음 / YouTube에서 보기" 안내가 자동 노출됨 → 사용자가 곧바로 YouTube로 이동 가능. 기존 직행 동작의 모든 케이스가 모달 + 백업 링크로 커버됨.

## 변경 파일

```
modified:   src/components/portfolio/CareerGroup.tsx
              ├ <a target="_blank"> 제거
              ├ <button onClick={setSelected}> 카드
              └ <CareerDetailDialog> 추가 (Dialog + VideoEmbed)
```

## 본 수정 범위 밖 (별도 티켓 권장)

다음 항목들은 이전 차수에서 보고했으며, 한 줄 수정이 아니라 UX/스키마/액션 설계 결정이 필요해 본 PR에 포함 안 함:

- BUG-1 ApplyForm 라벨 중복 (`"개인으로 지원로 지원합니다."`)
- BUG-2 댄서 프로필 없는 사용자 안내 부재
- BUG-4 온보딩 슬러그 미생성
- BUG-5 위저드 성별 select 저장 누락
- BUG-6 PriorityMultiSelect 다중 선택 race 의심
- 상태 전이 양방향화 (`decideApplicationAction` / `respondToProposalAction` 가드 완화 + UI 토글)
- `/u/[id]` 페이지 부실 + 뒤로가기 부재
- 보낸 제안 통합 뷰 (`/proposals/sent`)

