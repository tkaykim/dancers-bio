# 설계: deetz UI 다국어 전환 (ko · en · ja) — rev3

> 상태: **기획 완료 · Codex(gpt-6-astra) 교차검증 4라운드 합의 · 구현 착수 대기** · 2026-09-11
> 관련 정본: 메모리 `project_deetz_i18n.md`(전략 제안 2026-09-03) · `CAPABILITY_MAP.md` "deetz 다국어(i18n) 현황" · `reference_deetz_canonical.md`
> 범위: **화면 고정 문구(UI chrome)의 영어·일본어 전환과 언어 전환 UX.** 이용자가 쓴 글(공고 본문·자기소개)의 자동 번역과 외국인 지급은 이 문서 범위 밖이다.
> 목표 품질: 영어·일본어를 고른 이용자가 범위 안의 화면에서 한국어 UI 문구를 보지 않고, hydration 오류와 레이아웃 깨짐 없이 가입부터 지원·프로필 관리까지 끝낸다.

---

## 0. 결론 요약

- 언어는 `ko | en | ja` 세 개이고, 결정은 미들웨어 최상단 한 곳에서 한다.
- 미들웨어는 두 값을 낸다. **요청 언어**(`?lang=` → 쿠키 `deetz_lang` → `Accept-Language` → `ko`)와, 거기에 운영 경로 강제 `ko`와 플래그 `UI_LOCALES`를 적용한 **UI 언어**다.
- 전역 문구(셸·피드·공고·인증·내 계정)는 UI 언어를 쓰고, 이미 라이브인 기능 사전(비자·워크숍·빌리지·프로그램·간편접수·영상제출)은 요청 언어를 쓴다. 그래서 플래그를 닫아도 기능의 영어·일본어는 사라지지 않는다. 단 `/apply`·`/submit`은 공고 본문 언어가, `/visa/case/[token]`은 저장된 케이스 언어가 요청 언어보다 먼저다(§3.2 예외).
- 로그인 사용자의 `profiles.preferred_lang`은 로그인·전환 시점에 쿠키로 복사한다. 미들웨어는 DB를 읽지 않는다.
- 루트 레이아웃이 UI 언어를 읽어 `<html lang>`, 폰트, 메타데이터, `LocaleProvider`를 정한다. 그 결과 모든 라우트가 요청 시 렌더가 된다.
- 문구는 기존 `src/lib/i18n` 사전 구조를 네임스페이스 모듈로 확장한다. 외부 i18n 라이브러리는 도입하지 않는다. 클라이언트는 필요한 네임스페이스만 직접 import한다.
- `en`·`ja` 사전은 `ko` 키 집합으로 타입이 고정되어 키가 빠지면 컴파일이 실패한다.
- 한국어 누출은 ESLint 규칙, 단위 테스트, Playwright 언어 스윕 세 겹으로 막고, 스윕은 "한글 0자"에 더해 "기대 언어가 실제로 나오는가"까지 본다.
- 범위 안 한국어 문자열은 약 2,240개 구간(P1 약 1,710, P2 약 530)이다.
- 롤아웃은 `UI_LOCALES`로 `ko` → `ko,en` → `ko,en,ja` 순서로 연다. Vercel 환경변수는 재배포해야 반영되므로 롤백도 환경변수 변경 후 재배포 또는 이전 배포 복귀다.

---

## 1. 목표와 비목표

### 1.1 목표
- 외국인 이용자 여정(랜딩 → 가입 → 온보딩 → 피드 → 공고 상세 → 지원 → 내 지원 → 프로필 관리 → 알림 설정)의 모든 고정 문구를 영어·일본어로 제공한다.
- 한 번 고른 언어가 모든 화면과 기능(비자·워크숍·빌리지 포함)에서 유지되고, 로그인 계정에도 저장된다.
- 서버 렌더와 클라이언트 렌더의 언어가 항상 같아 hydration 경고가 나지 않는다.
- 영어의 긴 문장과 일본어 글꼴이 레이아웃을 깨뜨리지 않는다.

### 1.2 비목표 (이번 범위 밖)
- 공고 본문·자기소개·경력·채팅 같은 이용자 작성 글의 번역. 별도 설계(`content_translations`)로 진행한다.
- 관리자(`/admin`), 운영 보드(`/ops`·`/ndol`·`/channels`), 클라이언트 보드(`/cast`, `/review`), 정산 콘솔(소유자·관리자용)의 번역. 한국어 운영자만 쓴다.
- 약관·개인정보처리방침·데이터 삭제 안내의 번역. 법률 검토가 필요하므로 영문 안내 문구 한 줄만 붙인다.
- SEO용 언어별 URL(`/en/...`, `/ja/...`)의 전면 도입. 랜딩과 공개 페이지의 경로 접두는 P2로 미룬다.
- 외국인 지급·정산 정책. `project_deetz_foreign_payout.md` 별도 건이다.

---

## 2. 현재 상태 (2026-09-11 실측, Codex 재확인 포함)

### 2.1 코드

| 영역 | 실측 | 설계에 주는 의미 |
|---|---|---|
| i18n 뼈대 | `src/lib/i18n/{locale,messages,mail-messages,project-locale,server,interpolate}.ts`. `Locale = "ko" \| "en"`(`locale.ts:24`). `messages.ts` ko 128키, `mail-messages.ts` ko 68키, ko/en 타입 고정. 적용 범위는 `/apply`·`/submit`·지원 결과 메일뿐이며 **일본어는 없다** | 이 구조를 3개 국어·네임스페이스로 확장한다. `ja` 추가 196키 |
| 언어 판별 | `detectLocaleFromText`(한글 비중 < 0.1 → en) · `localeFromAcceptLanguage`(ko/en) · `resolveLocale`(본문 > Accept-Language > ko). `interpolate.ts:11`은 `vars`가 없으면 즉시 반환하고 13행 `name in vars`는 상속 속성도 인정한다 | 본문 우선 규칙은 `/apply`·`/submit`에만 남긴다. `interpolate`는 §3.4대로 보강 |
| 기능별 사전 | 비자(`components/visa/*`)·빌리지(`village/copy.ts`)·워크숍(`workshops/copy.ts`)·프로그램(`ProgramLanding.tsx`)이 각자 en/ja/ko 사전. 초기 언어 = `?lang=` → localStorage(`deetz_program_lang`·`deetz_village_lang`·`deetz_ws_lang`) → `navigator.language`. `ProgramLanding.tsx:502`는 첫 방문 추천 팝업, `VisaLanding.tsx:75`는 navigator만 본다. 기본값은 비자·빌리지·프로그램 `en`, 워크숍 `ko`. `/visa`는 `?lang=`을 보존해 `/program`으로 redirect(`visa/page.tsx:14`). `/visa/case/[token]`은 `query.lang → row.preferred_lang → en`(`page.tsx:152`)이고 `VisaCasePortal.tsx:822`의 최상위 `<main>`에는 `lang` 속성이 없다. `/me/visa`는 `dancer_visa_applications.preferred_lang`으로 기능 언어를 정하고(`page.tsx:111`) `VisaMemberDashboard.tsx:22`가 별도 상태를 갖는다 | 사전은 유지하고 언어 결정만 공통 규칙으로 바꾼다. localStorage·navigator 감지는 제거한다 |
| 루트 레이아웃 | `src/app/layout.tsx`: `<html lang="ko">` 고정, 정적 `metadata`(한국어), JSON-LD `inLanguage: "ko-KR"`, Pretendard Variable `<link>`. `src/app/page.tsx:12`·`:39`도 한국어 `title.absolute`·`openGraph` 고정. `page.tsx:55` `loadStats()`는 예외를 잡아 null 카운트를 반환하고 각 조회의 `error`를 검사하지 않는다 | 둘 다 `generateMetadata`로 바꾼다. 캐시는 §3.3 규칙대로 |
| 미들웨어 | `src/middleware.ts`: GRIGO 호스트 redirect(57행)·manifest rewrite(63행)·dancers.bio 루트 redirect(71행)·슬러그 rewrite(87행)가 **먼저 반환**하고, 95행에서 `request.headers.set("x-pathname", …)` → `NextResponse.next({ request })` → Supabase 세션 갱신(`setAll`이 response를 교체) → `da` 쿠키를 마지막에 세팅. `x-pathname`은 `lib/auth/guard.ts:19`·`lib/ops/event-access.ts:36`이 `headers()`로 읽는다. matcher는 서버 액션 POST를 제외하지 않는다 | 언어 결정은 조기 반환보다 앞에서 하고, rewrite에는 요청 헤더와 쿠키를 넘긴다 |
| 렌더링 | page 112개 중 101개가 이미 동적(직접 호출 95개 + `getUser()`·`getBrand()` 간접 호출 6개). 정적 후보 11개 = `/`, `/guide`, `/guide/[slug]`(generateStaticParams), `/terms`, `/privacy`, `/data-deletion`, `/report`, `/c/[code]`, `/fit/[token]`, `/h/[token]`, `/s/[token]`. `/`는 `createAdminClient`로 dancers·teams·projects 카운트 3개를 조회한다. `next.config.ts`에 `cacheComponents` 없음 | 루트 레이아웃이 요청 헤더를 읽으면 이 11개도 요청 시 렌더가 된다(§3.3) |
| 액션 후 렌더 | Next 16.2.5 내부: 서버 액션에서 쿠키를 수정하면 `request-cookies.js:115`가 `pathWasRevalidated`를 세팅하고 `action-handler.js:864·891`이 그 값으로 액션 응답에 현재 페이지 렌더를 포함한다. 이 렌더는 원래 요청의 `x-locale`을 그대로 쓴다 | 언어 전환은 쿠키 세팅 후 서버 `redirect`로 새 요청을 만든다(§3.8) |
| 셸 | 데스크톱 `PublicShell` 사이드바 라벨은 영문(Casting/Dancers/Magazine/Applications/My) + 한국어 부제. 모바일 `BottomTabBar` 4탭 한국어(캐스팅/댄서/내 지원/나), 4열 고정 높이(`:67, :75`). `TopNav` 한국어 4라벨. `ui/button.tsx:7`은 `shrink-0 whitespace-nowrap` | 전환기 자리 = 사이드바 하단, `/me` 설정, 랜딩·로그인 헤더. 길이 검수 1순위 |
| 공용 UI | `components/ui/{back-button,bottom-sheet,drawer,searchable-select}.tsx`에 접근성 라벨·빈 상태 한국어(`searchable-select.tsx:174`는 검색 결과가 없을 때만 나타남) | 범위에 포함. 상태별 스윕 대상 |
| 분류값 | `genres`(16)·`regions`(17)에 `label_ko`·`label_en`. 화면은 `label_ko`만 사용(`feed`, `projects/[id]`, `projects/new`, `edit`). enum 라벨은 `lib/validation/projects.ts` 한국어 상수 | `label_ja` 열 추가 + 라벨 헬퍼. enum 라벨은 사전으로 이동 |
| 검증·오류 | `lib/validation/*.ts` 9파일에 한국어 zod 메시지. `quick-apply.ts`만 키 방식(`isMessageKey`). `lib/phone.ts:80·87·96`은 한·영 병기 문자열을 반환하고 `actions/profile.ts:36`이 그대로 전달. `global-error.tsx:43`은 Provider 밖에서 `<html lang="ko">`와 한국어 문구를 렌더 | 전부 키 방식으로 통일. `phone.ts`·`global-error.tsx` 포함 |
| 서버 액션 | 사용자용 액션(`applications`·`projects`·`profile`·`portfolio`·`portfolio-ai`·`auth`·`proposals`·`teams`·`claim`·`careers`·`rate-cards`·`verification`·`notification-prefs`·`bug-report`)이 한국어 `error` 문자열 반환 | 액션 안에서 요청 컨텍스트의 UI 언어로 번역해 반환 |
| 날짜·금액 | `formatWhen(startsAt, endsAt, timeTbd = false)` 호출 6곳(5파일), `deadlineLabel(iso, labels = {})` 5곳(4파일, 관리자 공고 목록 포함), `formatMoney(n, locale)` 3곳(정산 메일 액션). 동명의 `formatMoney`가 `PaymentsAdminTable.tsx`와 워크숍에 따로 있다 | 기존 인자를 보존하고 `locale`을 마지막 선택 인자로 추가 |
| 알림·푸시 | `notifications`는 `type`+`payload`만 저장. 앱 내 수신함 화면 없음. 웹푸시 `title`·`body`는 발송 시점 한국어 문자열 | 푸시는 P2에서 수신자 언어로 생성 |
| 메일 | 지원 결과 메일 ko/en, 비자·워크숍 메일 en/ja/ko, 나머지 17종 한국어 | 외국인이 받는 5종을 P2에서 처리 |
| 글꼴 | Pretendard Variable(CDN) + Inter 폴백. `globals.css:44`의 `@theme inline`이 `--font-sans`에 폰트 목록을 직접 담고 112행 `@apply font-sans`로 쓴다. Tailwind 4.2.4는 `.font-sans`에 목록을 인라인하므로 `html:lang(ja)`에서 `--font-sans`만 덮어써도 바뀌지 않는다(Codex 컴파일 확인) | 런타임 변수 한 단계를 끼워 넣는다(§3.10) |
| 가입·프로필 | `auth.signUp`(`actions/auth.ts:29`)이 `options.data`에 display_name·phone 등을 넣고 DB 트리거 `on_auth_user_created` → `handle_new_user()`가 `profiles(id, display_name, phone)`를 `on conflict do nothing`으로 insert(`pg_get_functiondef` 확인). `profiles`는 RLS on, 정책 `profiles_select_all`(SELECT true)·`profiles_update_self`(UPDATE, `id = auth.uid()`)·`profiles_admin_all`, `authenticated` 역할에 테이블 단위 UPDATE 권한(`pg_policies`·`table_privileges` 2026-09-11 확인). `actions/profile.ts:41`이 본인 행 update를 이미 한다. `src/lib/supabase/types.ts:6`은 `Database = any` placeholder라 타입으로는 열 존재·권한을 증명할 수 없다 | `preferred_lang` 열은 본인 update 경로로 저장한다. service role 우회는 필요 없다 |
| `/me/visa` | 외국 국적 회원 전용. 케이스가 없을 때 영어 고정 빈 상태(`page.tsx:54`)와 `/program?lang=en` 링크(`:61`) | 일본어 이용자를 위해 P1에서 사전화 |
| 테스트 | `node --test` 단위 테스트 2개. Playwright 미설치 | Playwright 언어 스윕을 레포에 넣는다 |
| 린트 | `eslint.config.mjs` = next core-web-vitals + typescript 기본. ESLint 9.39.4 + `@typescript-eslint/parser` 8.59.2 | 한국어 누출 규칙을 범위 파일에 추가 |

### 2.2 문자열 인벤토리 (`scripts/i18n-inventory.mjs`, 한국어로 시작하는 연속 구간 수, 주석 제외)

| 범위 | 파일 | 한국어 구간 | 비고 |
|---|---|---|---|
| P1 셸·랜딩·공용 UI | 25 | 147 | `page.tsx` 63, 레이아웃·탭바·설치 안내·팝업, `components/ui`, `global-error` |
| P1 공개: 피드·댄서·프로필 | 19 | 175 | `DirectoryClient` 40, `/d/[slug]` 51, `/t` 28 |
| P1 인증·온보딩 | 17 | 181 | `ClaimForm` 33, 로그인·가입·비밀번호·`/welcome`·`/reset-password` |
| P1 공고 상세·지원 | 7 | 169 | `ApplyForm` 57, `projects/[id]` 45, `ProjectListView` 44 |
| P1 내 계정·지원·제안·포트폴리오 | 49 | 677 | `CreateProfileWizard` 51, `DancerProfileForm` 49, `CareerHistoryManager` 42, `RateCardManager` 35, `/me/{password,rates,workshops,visa}` |
| P1 라이브러리 라벨·검증·날짜·전화 | 14 | 174 | `validation/projects.ts` 39, `rate-cards.ts` 36, `portfolio.ts` 33, `phone.ts` |
| P1 서버 액션(사용자용) | 14 | 187 | `applications.ts` 43, `portfolio.ts` 30, `careers`·`rate-cards`·`verification`·`claim` |
| **P1 합계** | **145** | **약 1,710** | 중복·라벨 공유를 빼면 고유 키 약 1,100~1,300개로 추정 |
| P2 공고 등록·정산·메일·신고·소유자 콘솔 | 24 | 525 | `report/page.tsx` 82, `challenge-guideline-mail` 79, `MySettlements` 75, `ProjectForm` 49, `projects/[id]/applicants` |
| 기존 다국어(통합 + ja 추가) | 47 | 1,027 | `messages.ts`·`mail-messages.ts`에 `ja` 196키 추가 |
| 범위 밖 | 107 | 2,763 | admin·ops·cast·review·법률·토큰 페이지·`components/casting`·`guides.ts` |

스크립트의 범위 정의와 부록 A는 같은 목록을 유지한다. 구현 중 진행률 측정에 재사용한다.

### 2.3 이용자 근거
- 외국 국적 댄서 123명, 8월 신규 외국인 80명, 8월 이후 외국인 지원서 70건.
- 언어 신호는 영어 1순위, 일본어 2순위(비자 열람 이벤트 en 75% · ja 21%).
- 상세는 `project_deetz_i18n.md`.

---

## 3. 아키텍처

### 3.1 Locale 모델과 결정 규칙

`src/lib/i18n/locale.ts`

```ts
export const LOCALES = ["ko", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";
export const LOCALE_COOKIE = "deetz_lang";
export const UI_LOCALE_HEADER = "x-locale";            // 전역 문구용
export const REQUESTED_LOCALE_HEADER = "x-locale-requested"; // 기능 사전용
export function isLocale(v: unknown): v is Locale;
export function localeFromAcceptLanguage(header): Locale | null; // ko · en · ja
export function enabledLocales(): Set<Locale>;                    // UI_LOCALES, 기본 "ko"
/** /admin, /ops, /ndol, /channels — 세그먼트 경계로 판정한다. */
export function isForcedKoPath(pathname: string): boolean;
```

미들웨어(`src/middleware.ts`)가 요청마다 한 번 결정한다. **위치는 함수 최상단, 호스트 분기와 조기 반환보다 앞이다.**

```ts
const { pathname } = request.nextUrl;
const queryLang = request.nextUrl.searchParams.get("lang");
const cookieLang = request.cookies.get(LOCALE_COOKIE)?.value;
const requested: Locale =
  (isLocale(queryLang) && queryLang) ||
  (isLocale(cookieLang) && cookieLang) ||
  localeFromAcceptLanguage(request.headers.get("accept-language")) ||
  DEFAULT_LOCALE;
const ui: Locale = isForcedKoPath(pathname)
  ? DEFAULT_LOCALE
  : enabledLocales().has(requested) ? requested : DEFAULT_LOCALE;
request.headers.set(REQUESTED_LOCALE_HEADER, requested);
request.headers.set(UI_LOCALE_HEADER, ui);
```

- **요청 언어**는 이용자가 원한 언어다. 쿠키와 프로필에는 항상 이 값을 저장한다. 운영 경로 강제나 플래그 강등이 쿠키·프로필을 `ko`로 덮어쓰지 않는다.
- **UI 언어**는 전역 네임스페이스가 쓰는 언어다. 플래그로 열리지 않은 언어는 `ko`로 강등되고, `?lang=`도 플래그를 우회하지 않는다. `UI_LOCALES`가 없을 때의 기본값은 환경별로 다르다. 운영(`VERCEL_ENV=production`)은 `ko`만, 프리뷰·로컬은 세 언어 전부다. 그래서 프리뷰 QA는 환경변수 없이 돌아가고, 운영은 명시적으로 열어야 한다(구현 시 확정, `locale.ts` `enabledLocales()`).
- 기능 사전(비자·워크숍·빌리지·프로그램·간편접수·영상제출·`/me/visa`)은 요청 언어를 쓴다. 그래서 플래그가 `ko`여도 `/visa/case/[token]?lang=ja` 같은 메일 CTA와 기존 다국어 화면은 그대로 동작한다. 간편접수·영상제출은 지금 ko/en뿐이므로 `ja`를 추가한 뒤 같은 규칙을 따른다. §3.2의 두 예외(공고 본문 언어, 케이스 저장 언어)는 요청 언어보다 먼저다.
- 강제 `ko` 경로는 `/admin`·`/ops`·`/ndol`·`/channels`이며 `^/(admin|ops|ndol|channels)(/|$)`로 판정한다. `/projects/[id]/applicants`와 `/cast`·`/review`는 이 목록에 넣지 않고 P2에서 정책을 정한다. 공유 서버 액션의 오류가 한국어인 것은 이 경로에서 호출했을 때만 보장된다.
- 조기 반환 경로 처리: rewrite 세 곳(수신거부 POST → `/api/unsubscribe` 46행, manifest 63행, 슬러그 87행) 모두 `NextResponse.rewrite(url, { request: { headers: request.headers } })`로 헤더를 넘기고, `?lang=` 쿠키가 필요하면 그 응답에도 세팅한다. 수신거부 API는 언어를 쓰지 않지만 규칙을 한 가지로 유지하기 위해 같이 처리한다. 외부 redirect 두 곳은 헤더가 필요 없다.
- 쿠키는 `?lang=`이 있고 쿠키 값과 다를 때만, `da` 쿠키와 같은 위치(최종 `response`)에서 세팅한다. `path=/`, `maxAge` 1년, `sameSite=lax`, 운영에서 `secure`. `httpOnly`는 켜지 않는다.

`profiles.preferred_lang`은 미들웨어에서 읽지 않는다. 요청마다 DB를 치지 않기 위해서다. 대신 §3.9의 두 시점(전환·로그인)에 쿠키로 복사한다.

`/en/...`·`/ja/...` 경로 접두는 P2다. 도입할 때는 같은 자리에서 접두를 떼어 `rewrite`하고 요청 언어를 접두 값으로 덮어쓰면 되며, 라우트 파일을 옮기지 않는다.

### 3.2 서버 컴포넌트·액션에서의 접근

`src/lib/i18n/server.ts` (server-only)

```ts
import { cache } from "react";
import { headers } from "next/headers";
export const getLocale = cache(async (): Promise<Locale> => readHeader(UI_LOCALE_HEADER));            // 전역 문구
export const getRequestedLocale = cache(async (): Promise<Locale> => readHeader(REQUESTED_LOCALE_HEADER)); // 기능 사전
export async function serverT<M extends Messages>(messages: M) { return translator(messages, await getLocale()); }
```

- `headers()`는 Next 16에서 비동기이므로 반드시 `await`한다.
- `cache`는 한 렌더 안에서 중복 호출을 줄일 뿐이다. 서버 액션 컨텍스트와 공유되는 캐시가 아니며, 액션에서는 매번 헤더를 읽는다.
- 서버 액션은 요청 컨텍스트 안에서 실행되고 matcher가 액션 POST를 제외하지 않으므로 두 헤더를 읽을 수 있다(Next 내부 `action-handler.js`가 요청 저장소 안에서 액션을 실행한다).
- 순수 `translator`·`plural`은 `src/lib/i18n/t.ts`(서버·클라이언트 공용, 부작용 없음), 클라이언트 훅은 `provider.tsx`, 서버 전용 접근자는 `server.ts`로 분리한다.

예외 두 가지.
- `/apply/[code]`·`/submit/[token]`은 공고 본문 언어를 먼저 보는 기존 `localeFor(title, description)`을 유지한다. 특정 공고를 위한 외부 진입점이라 공고의 언어가 대상 이용자의 언어다. 구현은 서버의 `localeFor`가 `detectLocaleFromText(...) ?? await getRequestedLocale()`을 반환하게 바꾸는 것이다. 순수 함수 `resolveLocale`은 `fallback: Locale` 인자를 받고 Accept-Language를 직접 읽지 않는다. 지금처럼 마지막 기본값만 바꾸면 `locale.ts:80`의 Accept-Language가 쿼리·쿠키보다 앞서므로 안 된다.
- `/visa/case/[token]`은 `query.lang → 유효한 row.preferred_lang → getRequestedLocale()` 순서다. 저장된 케이스 언어를 보존하고, 폴백은 강등 전 요청 언어를 쓴다. 본문의 언어를 DOM에도 표시하기 위해 `VisaCasePortal`의 최상위 `<main>`과 Portal로 분리되는 팝업에 `lang={lang}`을 지정한다. `<html lang>`은 UI 언어를 따르며, 이 라우트는 독립 화면이라 두 값의 차이를 허용한다.

### 3.3 루트 레이아웃

`src/app/layout.tsx`

```tsx
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = translator(meta, locale);
  return { metadataBase, title: { default: t("site.title"), template: "%s · deetz" }, description: t("site.description"), openGraph: { title: t("site.title"), description: t("site.description"), url: SITE, siteName: "deetz", type: "website" } };
}
export default async function RootLayout({ children }) {
  const [locale, requested] = await Promise.all([getLocale(), getRequestedLocale()]);
  // JP CSS는 조건 없이 항상 싣는다. 루트 레이아웃은 클라이언트 탐색에서 다시 렌더되지 않으므로
  // 경로·언어 조건은 /me → /me/visa(저장 언어 ja) 같은 탐색에서 갱신되지 않는다.
  return (
    <html lang={locale} className="h-full" style={fontVariables}>
      <head>
        <link rel="stylesheet" href={PRETENDARD_CSS} />
        <link rel="stylesheet" href={PRETENDARD_JP_CSS} />
        <script type="application/ld+json" … inLanguage={INLANG[locale]} />
      </head>
      <body>
        <LocaleProvider locale={locale} requested={requested} enabled={[...enabledLocales()]}>…{children}…</LocaleProvider>
      </body>
    </html>
  );
}
```

영향과 결정.
- 루트 레이아웃이 요청 헤더를 읽으므로 모든 라우트가 요청 시 렌더가 된다. Next 16 문서 기준으로 `headers()`는 해당 라우트를 요청 시 렌더로 전환하며, `/guide/[slug]`의 `generateStaticParams`와 함께 있어도 빌드 오류 조건이 아니다(`dynamic = "error"` 같은 충돌 설정 없음). 변경 후 빌드 성공은 S0에서 실측한다.
- 랜딩의 카운트 조회 3개는 `unstable_cache(loadStatsStrict, ["landing-stats"], { tags: ["landing-stats"], revalidate: 600 })`로 감싼다. 캐시 안의 함수는 세 조회의 `error`를 검사해 throw하고, 화면용 null fallback은 캐시 바깥에서 처리한다. 실패 결과가 600초 동안 저장되지 않게 하기 위해서다. 캐시 함수 안에서는 `getLocale()`·`headers()`를 읽지 않는다. 캐시 키는 두 번째 인자로 명시하고 태그는 무효화용이다.
- HTML·RSC 렌더 비용은 남는다. 서버 렌더는 유지되지만 검색 영향은 검증하지 않았다. TTFB·함수 사용량과 함께 배포 후 Search Console로 실측한다.
- 기존 `metadata` export는 루트와 홈 모두 제거한다. 홈(`page.tsx`)의 `title.absolute`가 최종 제목을 결정하고 부모 템플릿을 무시하므로 충돌은 없다. Metadata는 얕게 병합되므로 홈 `openGraph`도 언어별로 낸다. `alternates.languages`는 P2 전까지 쓰지 않는다.
- 대안(루트 정적 유지 + 그룹 레이아웃별 Provider + 인라인 스크립트 lang)은 폐기한다. 그룹에서 요청 언어를 읽어도 하위는 동적이고, 루트 metadata가 `headers()`를 읽는 한 정적 보존 효과가 없으며, `suppressHydrationWarning`은 언어 일치를 보장하지 않는다.

### 3.4 클라이언트 접근과 사전 구조

```
src/lib/i18n/
  locale.ts            Locale 모델·판별·플래그·강제 ko 경로 (기존 확장)
  server.ts            getLocale · getRequestedLocale · serverT (server-only)
  t.ts                 translator(messages, locale) · plural (순수, 공용)
  provider.tsx         LocaleProvider · useLocale · useRequestedLocale · useEnabledLocales · useT (client)
  interpolate.ts       (기존, 필수 변수 검사 추가)
  messages/
    index.ts           Messages 타입·Namespace 이름 유니언만 export. 값 import 없음
    common.ts          공통 버튼·상태·오류
    nav.ts             셸·탭바·사이드바·설치 안내·팝업·언어 전환기
    landing.ts         랜딩
    auth.ts            로그인·가입·비밀번호·클레임
    onboarding.ts      프로필 생성 위저드
    feed.ts            피드·필터·카드
    directory.ts       댄서 디렉터리·팀
    profile.ts         공개 프로필 `/d/[slug]`·`/t`·`/u`
    project.ts         공고 상세·지원 폼·제안 응답·공유
    me.ts              내 계정·알림 설정·비밀번호·단가·워크숍·비자 빈 상태
    applications.ts    내 지원·제안
    portfolio.ts       프로필 편집·경력·단가·팀 관리
    labels.ts          enum 라벨(공고 상태·카테고리·페이 유형·지원 상태·회차 유형·선발 단계)
    validation.ts      zod 메시지 키 · phone.ts 오류 키
    actions.ts         서버 액션 오류·성공 문구
    meta.ts            사이트 제목·설명·OG
    ui.ts              공용 UI 접근성 라벨·빈 상태
    quick.ts           기존 messages.ts (간편 접수·영상 제출) — 이름만 옮김
  mail-messages.ts     (기존, ja 추가)
```

각 네임스페이스 모듈의 형태.

```ts
const ko = { "tab.casting": "캐스팅", "tab.dancers": "댄서", … } as const;
type Key = keyof typeof ko;
const en: Record<Key, string> = { … };
const ja: Record<Key, string> = { … };
const messages = { ko, en, ja } satisfies Record<Locale, Record<Key, string>>;
export default messages;
```

- `en`·`ja`가 `Record<Key, string>`이므로 키가 빠지거나 남으면 컴파일 오류다.
- 서버 컴포넌트: `import project from "@/lib/i18n/messages/project"; const t = await serverT(project);`
- 클라이언트 컴포넌트: `import project from "@/lib/i18n/messages/project"; const t = useT(project);`
- `useT`·`serverT`는 모듈 객체를 인자로 받고 레지스트리를 조회하지 않는다. 클라이언트 번들에는 그 컴포넌트가 import한 네임스페이스만 실리며, 한 네임스페이스의 세 언어는 함께 실린다.
- 클라이언트 사전은 해당 클라이언트 파일에서 직접 import한다. 서버 컴포넌트가 사전 객체를 props로 넘기면 RSC 전송량이 커지므로 금지한다. 린트 대신 코드 리뷰 체크리스트로 강제한다.
- Provider가 없으면 `useT`는 개발 모드에서 throw해 누락을 바로 드러낸다.
- 값은 항상 완결된 문장이다. 조사·어순 때문에 문자열을 이어 붙이지 않고 `{name}` 자리표시자를 쓴다.
- `interpolate`는 원본 템플릿에서 자리표시자를 추출하고 `Object.hasOwn(vars ?? {}, name)`으로 제공 여부를 검사한다. `vars`가 없어도 검사한다. 누락이면 개발 모드에서 `console.error`를 내고 운영에서는 자리표시자를 그대로 둔다. 치환 결과에서 `{`를 찾는 방식은 이용자 값의 중괄호를 오인하므로 쓰지 않는다. 타입 수준 인자 검사는 도입하지 않는다.
- 복수형은 `count_one`·`count_other` 두 키와 `plural(locale, n)`(`Intl.PluralRules`)로 처리한다. 한국어·일본어는 `other`만 쓴다. ICU 라이브러리는 넣지 않는다.
- 키 이름은 `<화면>.<요소>[.<상태>]` 소문자 스네이크다. 예: `apply.submit`, `apply.submit.sending`, `status.open`.
- 브랜드 표기 `deetz`는 항상 소문자이며 번역하지 않는다.

`LocaleProvider`는 서버가 정한 두 값을 그대로 받는다. 클라이언트에서 `navigator.language`나 localStorage로 언어를 다시 정하는 코드는 두 가지 문서화된 예외(`global-error.tsx` §3.5, 옛 localStorage 키 1회 이전 §3.8) 말고는 어디에도 두지 않는다. 두 예외 모두 첫 렌더를 바꾸지 않고 effect 이후에만 동작한다. 이것이 hydration 불일치를 원천 차단하는 규칙이다.

### 3.5 검증 메시지와 서버 액션 오류

- `lib/validation/*.ts`의 zod 메시지를 전부 `validation` 네임스페이스 키로 바꾼다. 예: `z.string().min(1, "v.name_required")`.
- `lib/phone.ts`의 한·영 병기 오류 3종도 키(`v.phone_required`·`v.phone_country`·`v.phone_invalid`)를 반환하도록 바꾼다. 소비처는 두 곳이다. 서버 `actions/profile.ts:36`은 `serverT(validation)`으로, 클라이언트 `components/auth/InternationalPhoneField.tsx:131`은 `useT(validation)`으로 번역한다. 키가 화면에 그대로 노출되면 안 된다.
- 서버 액션은 `parsed.error`를 `localizeZodError(issues, locale)`로 변환해 반환한다. 키가 아닌 zod 기본 문구("Required" 등)는 `v.invalid_input`으로 뭉뚱그린다. `quick-apply.ts`의 `isMessageKey` 패턴을 공용으로 옮긴다.
- 액션의 자체 오류·성공 문구는 `actions` 네임스페이스 키로 바꾸고 `await serverT(actions)`로 번역해 반환한다. 관리자 계정이 일반 사용자 경로에서 호출하면 그 화면의 언어를 따른다.
- 클라이언트는 받은 문자열을 그대로 `toast`에 넣는다. 클라이언트 쪽 고정 toast 문구는 `common` 키로 바꾼다.
- `global-error.tsx`는 루트 Provider 밖이라 별도 규칙을 둔다. 루트와 독립된 작은 3개 언어 사전을 파일 안에 두고, 서버와 첫 클라이언트 렌더는 같은 기본 문구(ko)를 쓴 뒤 hydration 이후에 `?lang=` → 쿠키 → 브라우저 언어 순으로 확인해 문구와 `<html lang>`을 바꾼다. 구현은 `useEffect` 안의 `setState`가 아니라 `useSyncExternalStore(subscribe, getSnapshot, () => "ko")`로 한다. 현재 ESLint 설정의 `react-hooks/set-state-in-effect`(severity 2)에 걸리지 않고, `getServerSnapshot`이 첫 렌더를 ko로 고정해 hydration도 일치한다. 이 오류 화면만 클라이언트 언어 복구를 허용하는 문서화된 예외다.

### 3.6 분류값 라벨

- DB: `genres.label_ja text`, `regions.label_ja text` 추가 후 33행 백필. 백필 값은 번역 검수 목록에 포함한다.
- 헬퍼 `taxonomyLabel(row, locale)`: `label_<locale>` → `label_en` → `label_ko` 순으로 폴백한다. 화면 4곳(`feed`, `projects/[id]`, `projects/new`, `edit`)에 적용하고 지역 자유 입력(`region_text`)은 원문 그대로 둔다.
- enum 라벨 상수(`STATUS_LABELS`·`PAY_TYPE_LABELS`·`PROJECT_CATEGORY_LABELS`·`APPLICATION_STATUS_LABELS`·`SESSION_TYPE_LABELS`)는 `labels` 네임스페이스로 옮기고 `labelFor("status", value, locale)`로 읽는다. 기존 상수는 관리자 화면 호환을 위해 `ko` 값을 같은 이름으로 재수출한다.

### 3.7 날짜·금액·복수형

- 기존 인자 계약을 보존하고 `locale: Locale`을 마지막 선택 인자(기본 `"ko"`)로 추가한다. 관리자 호출처는 무변경이다.
  - `formatWhen(startsAt, endsAt, timeTbd = false, locale = "ko")`: `Intl.DateTimeFormat(localeTag, { timeZone: "Asia/Seoul", month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })`. ko는 지금 출력(`6월 18일(수) 16:00~21:00`)을 그대로 유지한다. "시간 미정"·"일정 미정"은 키다.
  - `deadlineLabel(iso, labels = {}, locale = "ko")`: `D-3` 형태는 공통, "오늘 마감"·"마감"·"상시 모집"은 키다. `labels` override는 기본 번역보다 우선하므로, P1 호출처(`ProjectCard`·`ProjectListView`·공고 상세)가 넘기는 한국어 override도 사전 키로 바꾼다. 관리자 호출처는 기본 `ko`를 유지한다.
  - `formatMoney(n, locale)`: 필수 인자 계약을 유지하고 `ja` 분기를 더한다. ko `1,000,000원`, en `KRW 1,000,000`, ja `1,000,000ウォン`. 일본어 표기는 §10의 결정 항목이며 결정 전까지 이 값을 기본으로 구현한다. 통화는 항상 원화다. `PaymentsAdminTable.tsx`와 워크숍의 동명 함수는 별개이며 손대지 않는다.
- 숫자는 `Intl.NumberFormat(localeTag)`. `localeTag`는 `ko-KR`·`en-US`·`ja-JP`.

### 3.8 언어 전환 UI

- 컴포넌트 `LanguageSwitcher`(client). 현재 언어를 표시하고 열린 언어를 고르는 메뉴. 아이콘은 lucide `Globe`. 라벨은 각 언어의 자기 표기(`한국어` · `English` · `日本語`)로 고정하고 `data-i18n-ignore`를 붙인다.
- 배치 4곳. 데스크톱 사이드바 하단(`PublicShell` aside의 Client 블록 위), `/me` 계정 설정 카드, 랜딩 헤더 우측, 인증 화면(`(auth)/layout.tsx`) 상단 우측.
- 모바일 하단 탭에는 넣지 않는다. 탭 4개가 꽉 차 있다.
- 동작. 클라이언트가 `useTransition` 안에서 `setLocaleAction(locale, currentUrl)`을 호출한다. 액션 순서는 ① 로그인 상태면 `profiles.preferred_lang` 갱신(실패하면 쿠키를 건드리지 않고 `{ ok: false, error }`를 반환), ② 쿠키 세팅, ③ `currentUrl`이 내부 경로인지 검증한 뒤 `lang` 파라미터만 제거하고 나머지 쿼리·해시를 보존한 URL로 `redirect(cleanUrl, RedirectType.replace)`다. Next는 redirect 대상을 서버 안에서 GET해 RSC로 돌려주거나 클라이언트 탐색을 일으키며, 어느 쪽이든 대상 요청에서 미들웨어가 언어를 다시 결정하고 이전 동적 렌더를 재사용하지 않는다. 서버 액션에서 쿠키만 바꾸면 Next가 액션 응답에 현재 페이지 렌더를 포함하지만 그 렌더는 옛 `x-locale`을 쓰므로 응답 렌더에 기대지 않는다. `revalidatePath`는 부르지 않는다.
- 클라이언트 처리 계약. 성공한 redirect는 액션 Promise의 rejection(redirect error)으로 전달되고 Next의 `RedirectBoundary`가 처리한다. 그러므로 rejection을 실패로 잡지 않는다. 실패는 반환값 `{ ok: false }`로만 판단하고, 그때만 낙관적 표시를 되돌리고 toast를 띄운다. `try/catch`로 감싸야 한다면 redirect error는 다시 throw한다.
- 플래그로 열리지 않은 언어는 메뉴에서 숨긴다(`useEnabledLocales()`).
- 기존 기능 랜딩(`VisaLanding`·`VisaApplyWizard`·`ProgramLanding`·`VillageLanding`·`WorkshopsLanding`)은 `initialLang` prop을 유지하되 페이지가 `await getRequestedLocale()`로 넘기고, 내부의 localStorage·navigator 감지 `useEffect`와 첫 방문 추천 팝업(`ProgramLanding.tsx:502`)을 삭제한다. 중복된 로컬 언어 상태는 없애고 `useRequestedLocale()`에서 파생한다. 즉시 반응이 필요한 전환 버튼은 클릭 시 낙관적으로 표시를 바꾸고 `setLocaleAction`이 실패하면 되돌린다. effect 동기화를 즉시 반응으로 취급하지 않는다. 사전 파일과 문구는 손대지 않는다.
- 비자 케이스 포털(`VisaCasePortal`)의 전환 버튼은 `lang` 제거 대상이 아니다. 케이스는 `?lang=`이 저장 언어보다 우선하므로, 이 화면의 전환은 선택한 언어로 `?lang=`을 갱신하는 `router.replace`다. 컴포넌트의 `useState(initialLang)`(`VisaCasePortal.tsx:492`)은 새 prop을 반영하지 못하므로 페이지가 `<VisaCasePortal key={lang} lang={lang} …/>`로 언어가 바뀔 때 다시 마운트하고 내부 상태는 prop에서 파생한다. 최상위 `<main>`과 팝업에 `lang` 속성을 둔다.
- 옛 localStorage 키 3개(`deetz_program_lang`·`deetz_village_lang`·`deetz_ws_lang`)의 이전은 §3.4가 허용한 예외다. 조건은 쿠키가 없고 `?lang=`도 없을 때뿐이며, hydration 이후 effect에서 한 번만 실행한다. 먼저 세 키를 삭제하고 그다음 `setLocaleAction`을 호출한다. 호출이 실패하면 Accept-Language 결과를 그대로 쓴다. `?lang=`이 있는 최초 요청을 과거 저장값으로 덮어쓰지 않는다. 구현은 루트 레이아웃에 마운트하는 `components/layout/LegacyLocaleMigration.tsx`다.
- `/me/visa`의 영어 고정 빈 상태와 `/program?lang=en` 링크는 `me` 네임스페이스를 쓰되 요청 언어를 따른다. 호출은 `serverT(me)`가 아니라 `translator(me, await getRequestedLocale())`로 명시한다.

### 3.9 가입·로그인과 `profiles.preferred_lang`

- 마이그레이션: `alter table public.profiles add column preferred_lang text check (preferred_lang in ('ko','en','ja'))`. null 허용.
- `handle_new_user()`에 `preferred_lang` 삽입을 추가한다. 값은 `new.raw_user_meta_data->>'preferred_lang'`이 세 값 중 하나일 때만 쓴다. 기존 insert 열(id, display_name, phone)과 `on conflict do nothing`은 그대로 둔다.
- 가입 액션(`actions/auth.ts:29`)은 `options.data.preferred_lang = await getRequestedLocale()`을 넣는다.
- 로그인 액션은 성공 직후 `profiles.preferred_lang`을 읽어 있으면 쿠키를 그 값으로 덮어쓴다. 다른 기기에서도 같은 언어가 유지되는 경로다.
- 갱신 경로: `actions/profile.ts:41`과 같은 본인 update 경로를 쓴다. `profiles_update_self` 정책과 `authenticated`의 테이블 단위 UPDATE 권한이 이미 있어 새 열도 본인이 갱신할 수 있다(2026-09-11 `pg_policies`·`table_privileges`·`pg_get_functiondef` 조회 결과). service role은 쓰지 않는다.
- 백필: `dancer_visa_applications.preferred_lang`이 있고 `applicant_profile_id`가 연결된 계정에 한해 1회 복사한다. 나머지는 null로 두고 Accept-Language에 맡긴다.
- `src/lib/supabase/types.ts`는 `Database = any` placeholder라 타입 재생성이 필수는 아니고, 타입으로 열 존재를 검증할 수도 없다. 재생성할 때는 `reference_deetz_db_types_build_trap`(리다이렉트 시 0바이트)을 따른다.

### 3.10 일본어 타이포그래피

- `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css`를 루트 레이아웃에서 조건 없이 항상 로드한다. 루트 레이아웃은 클라이언트 탐색에서 재사용되므로 언어·경로 조건은 `/me`(en)에서 `/me/visa`(저장 언어 ja)로 이동할 때 갱신되지 않는다. Pretendard 웹 CSS는 `unicode-range` 부분 집합이라 글꼴 파일은 일본어 글리프가 실제로 그려질 때만 내려받고, 고정 비용은 CSS 파일 하나다. 그 크기는 §10의 미확인 항목이다. font-family는 `"Pretendard JP Variable"`.
- `globals.css`는 런타임 변수 한 단계를 끼워 넣는다. Tailwind 4.2.4 컴파일 결과가 `.font-sans { font-family: var(--app-font-sans); }`가 되는 것을 Codex가 확인했다.

```css
@theme inline {
  --font-sans: var(--app-font-sans);
}
:root { --app-font-sans: "Pretendard Variable", var(--font-inter), -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
:lang(ja) {
  --app-font-sans: "Pretendard JP Variable", "Pretendard Variable", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
  font-family: var(--app-font-sans); /* 변수만 바꾸면 부모에서 계산·상속된 font-family가 재계산되지 않는다 */
  line-break: strict;
}
```

- 선택자를 `html:lang(ja)`가 아니라 `:lang(ja)`로 두는 이유는 `<html lang="ko">` 안에 `lang="ja"`인 기능 영역(비자 케이스 포털 등)이 생기기 때문이다. `globals.css:111`은 `html`에만 `font-sans`를 적용하므로 언어 영역에는 `font-family`를 직접 선언해야 실제 글꼴이 바뀐다.
- 영어 문장은 한국어보다 30~40% 길다. 길이 검수 1순위는 `ui/button.tsx:7`의 `whitespace-nowrap`, `BottomTabBar.tsx:67·75`의 4열 고정 높이, `DirectoryClient.tsx:483`의 줄바꿈 금지 탭, `ApplyForm.tsx:163·192`의 2열 영역이다. 실제 파손 여부는 번역 적용 후 320px을 포함해 확인한다.

### 3.11 메타데이터와 SEO

- P1: 루트·랜딩·로그인·가입·피드·댄서 디렉터리·공고 상세·공개 프로필의 `generateMetadata`가 언어별 제목·설명·OG를 낸다. 공고와 프로필의 제목은 이용자 작성 원문을 그대로 쓴다.
- `<html lang>`이 UI 언어를 따라가므로 검색엔진과 화면 낭독기가 언어를 올바르게 인식한다.
- P2: `/en`·`/ja` 접두와 `alternates.languages`(hreflang)를 랜딩·비자·워크숍·빌리지·공개 프로필에 붙인다.

### 3.12 P2 범위 정의

- 공고 등록·수정(`ProjectForm`·`ProjectEditForm`·`SelectionRoundsField`·첨부): 외국 클라이언트가 직접 올리는 경우를 위해 필요하다.
- 댄서 정산 화면(`MySettlements`·`BalanceWithdraw`·`BankPicker`·`/w`·`/settle`): 외국인 지급 정책 결정 후 함께 진행한다.
- 메일 5종(승인 환영·공고 매칭·공지·일정·챌린지 가이드)과 웹푸시: 수신자 `preferred_lang` → 지원서·공고 언어 → ko 순서로 언어를 정해 발송 시점에 생성한다.
- 페이 신고(`/report`)와 수신 거부 페이지. 소유자 콘솔(`/projects/[id]/applicants`)과 클라이언트 보드(`/cast`·`/review`)의 언어 정책도 여기서 정한다.

---

## 4. 데이터 변경

| 순서 | 변경 | 롤백 |
|---|---|---|
| M1 | `profiles.preferred_lang text check in ('ko','en','ja')` 추가 | 열 삭제 |
| M2 | `handle_new_user()`에 `preferred_lang` 삽입 추가(기존 열·`on conflict` 유지) | 함수 이전 정의로 교체 |
| M3 | `genres.label_ja`, `regions.label_ja` 추가 + 33행 백필 | 열 삭제 |
| M4 | 비자 신청서 `preferred_lang` → `profiles` 1회 백필(`applicant_profile_id` 연결분) | update 되돌림 SQL 동봉 |

모두 additive이고 기존 읽기 경로를 바꾸지 않는다. 적용 순서는 M1 → M2 → M3 → 코드 배포 → M4. 정책·권한은 2026-09-11 조회 결과(§2.1 가입·프로필 행)를 근거로 그대로 둔다.

---

## 5. 품질 게이트

"에러 없이"를 검증으로 정의한다. 아래 다섯 개를 통과해야 플래그를 연다.

### 5.1 타입 게이트
- 모든 네임스페이스에서 `en`·`ja`가 `Record<keyof typeof ko, string>`이다. 키 누락·초과는 `npm run typecheck` 실패다.

### 5.2 사전 단위 테스트 (`node --test src/lib/i18n/messages.test.mjs`)
- 세 언어 값이 빈 문자열이 아니다.
- 각 키의 `{placeholder}` 집합이 세 언어에서 같다.
- `en`·`ja` 값에 한글이 없다. 허용 목록은 브랜드·고유명사 파일 하나로 관리한다.
- `interpolate` 테스트: 누락 인자 검출, 상속 속성(`toString` 등)은 인정하지 않음, 변수 값에 중괄호가 있어도 오탐하지 않음, `vars` 미제공 경로도 검사함.
- `ja` 값이 `です・ます`체인지는 검수 체크리스트로 본다(자동화하지 않는다).

### 5.3 ESLint 한국어 누출 규칙
- `eslint.config.mjs`에 범위 파일 glob 전용 블록을 추가한다.
- `no-restricted-syntax` 선택자: `JSXText[value=/[가-힣]/]`, `Literal[value=/[가-힣]/]`, `TemplateElement[value.cooked=/[가-힣]/]`. ESLint 9.39 + typescript-eslint 8.59 flat config에서 동작을 확인했다(Codex 메모리 검증). `cooked`를 쓰는 이유는 `\uXXXX`로 쓴 한글도 잡기 위해서다.
- 의도한 한국어(브랜드 카피, 한국어 전용 안내, 로그·정규식·내부 데이터)는 `// eslint-disable-next-line no-restricted-syntax -- i18n: reason`으로 표시한다.
- 범위 밖 디렉터리(admin·ops 등)에는 적용하지 않는다.
- 구현 초기에는 `warn`, 네임스페이스 이전이 끝난 디렉터리부터 `error`로 올린다. 오탐이 많아지면 AST 문맥을 보는 전용 규칙으로 옮긴다.

### 5.4 Playwright 언어 스윕 (`e2e/i18n-sweep.spec.ts`)
- 대상 경로 약 25개(랜딩, 로그인, 가입, 피드, 공고 상세 2종, 댄서 디렉터리, 공개 프로필, 온보딩, `/me`, 알림 설정, 비밀번호, 단가, 내 지원, 제안, 포트폴리오 편집 4화면, 팀, 비자 랜딩, 워크숍, 빌리지, `/me/visa` 빈 상태).
- `/apply`·`/submit`은 공고 언어 우선 규칙 때문에 영문 공고 픽스처로만 검사한다.
- 언어 `en`·`ja` × 뷰포트 320px·390px·1280px.
- 로그인은 `reference_deetz_e2e_account.md`의 계정으로 한다. 입력은 `locator.fill()`, 제출은 실제 버튼 클릭이 기본이고 `form.requestSubmit()`은 대체 수단이다. 제출 후 URL과 인증 화면을 확인한다.
- 누출 검사: `innerText`와 `placeholder`·`aria-label`·`alt`·`title` 속성값에서 한글 0자. 제외는 `[data-ugc]`(이용자 작성 글)·`[data-i18n-ignore]`(전환기의 `한국어` 라벨 등)이며 조상의 제외 속성도 확인한다. 제외 속성은 필요한 최소 요소에만 붙이고 사유를 주석으로 남긴다.
- 기대 언어 검사: 시나리오마다 영역별 기대 언어를 따로 둔다. 전역 셸은 UI 언어, 기능 영역은 요청 언어 또는 §3.2 예외(공고 본문 언어·케이스 저장 언어)다. 예를 들어 요청 언어가 `ja`여도 영문 공고 픽스처의 `/apply` 본문은 `en`이어야 하고, 플래그가 `ko`인 시나리오에서는 `html[lang]`이 `ko`이면서 기능 영역 `[lang]`은 `ja`일 수 있다. 각 영역에서 대표 번역 문구 1개와 `lang` 속성을 함께 확인한다. 한글 0자만으로는 일본어 화면이 영어로 나온 경우를 못 잡기 때문이다.
- 상태 검사: 초기 화면 외에 toast·검증 오류·빈 목록·열린 팝업·권한 없음 상태를 각 언어로 한 번씩 만든다. 오류를 의도적으로 내는 테스트는 예상한 오류만 허용 목록으로 둔다.
- 회귀 검사: `?lang=ja`와 쿠키 `en`이 함께 있을 때, 전환 뒤 새로고침, 플래그 `ko` 상태에서 기능 CTA(`/visa/case/[token]?lang=ja`) 동작.
- 콘솔 오류·hydration 경고·Playwright `pageerror` 0건.
- 화면 스크린샷을 저장해 넘침·잘림을 사람이 검수한다.
- 이용자 작성 글이 나오는 영역(공고 제목·본문, 프로필 소개, 경력)은 컴포넌트에 `data-ugc` 속성을 붙인다.

### 5.5 빌드·번들 게이트
- `npm run typecheck`, `npm run lint`, `next build`가 모두 통과한다.
- 랜딩이 실제로 로드하는 공통 청크를 포함한 전체 JS와 RSC payload에 `portfolio`·`me` 사전 문자열이 없는지 확인한다. 전용 청크 하나만 보면 공통 Provider를 통한 혼입을 놓친다.
- `global-error`의 독립 사전과 effect 이후 언어 복구를 별도 시나리오로 확인한다.
- Vercel Preview(`UI_LOCALES=ko,en,ja`)에서 §5.4를 한 번 더 돌린다.

---

## 6. 번역 제작 워크플로

1. 키 추출: 컴포넌트 단위로 `ko` 사전에 키를 만들고 코드를 `t()`로 바꾼다. 기계적 작업이라 Codex `gpt-5.6-sol` 또는 Claude에 배분한다.
2. 초안: `ko` 사전 전체를 용어집·화면 맥락(키 이름, 최대 길이)과 함께 LLM에 넘겨 `en`·`ja` 초안을 만든다. 출력은 JSON이며 자리표시자 보존을 검사한다.
3. 검수: 영어는 대표·운영진, 일본어는 비자 프로그램의 일본어 담당자가 본다. 검수자는 결정 항목이다.
4. 반영: 검수 결과를 사전 파일에 반영하고 §5를 다시 돌린다.
5. 이후 문구 추가는 PR에서 세 언어를 함께 넣는 것이 규칙이다. 타입 게이트가 이를 강제한다.

톤. 영어는 짧고 직접적인 서비스 문체, 일본어는 `です・ます`체, 한국어 산출물 규칙대로 두 문장 이상이면 문장마다 줄을 바꾼다.

용어집 초안은 부록 B다.

---

## 7. 롤아웃

| 단계 | 조건 | 동작 |
|---|---|---|
| R0 | 코드 배포, `UI_LOCALES=ko` | 전역 문구는 한국어. 기능 사전은 요청 언어로 종전처럼 동작. 전환기 숨김 |
| Preview | PR마다 `UI_LOCALES=ko,en,ja` | §5.4 스윕과 검수 |
| R1 | 영어 검수 완료, §5 통과 | `UI_LOCALES=ko,en` + 재배포. 전환기에 English 노출. 영어 브라우저는 자동 영어 |
| R2 | 일본어 검수 완료 | `UI_LOCALES=ko,en,ja` + 재배포 |
| 롤백 | 어떤 단계든 | 환경변수를 `ko`로 바꾸고 재배포하거나, 이전 배포로 복귀한다. Vercel 환경변수는 기존 배포에 즉시 반영되지 않는다. 기능 사전과 메일 CTA는 영향 없음 |

- `UI_LOCALES` 등록 시 `reference_vercel_env_empty_trap`(stdin 파이프 빈 값)을 따른다.
- 배포 순서: M1·M2·M3 → PR(S0) → PR(S1~S4, 디렉터리별 작은 PR) → 번역 반영 PR → Preview 스윕 → R1 → R2.

---

## 8. 작업 분해와 공수 (엔지니어 1명 기준 작업일)

| 단계 | 내용 | 공수 |
|---|---|---|
| S0 기반 | `locale.ts` 확장(두 헤더·강제 ko·플래그), 미들웨어 최상단 언어 결정·rewrite 헤더·쿠키, `server.ts`·`t.ts`·`provider.tsx`, `interpolate` 보강, 루트·홈 `generateMetadata`, 랜딩 캐시, 폰트 변수화, `LanguageSwitcher`·`setLocaleAction`(redirect), M1~M3, 가입·로그인 연동, ESLint 규칙, 단위 테스트, Playwright 설치·로그인 헬퍼, 빌드·번들 실측 | 2.5일 |
| S1 셸·랜딩·인증·온보딩·공용 UI | `nav`·`landing`·`auth`·`onboarding`·`ui` 이전(약 330 구간), `global-error` | 1.5일 |
| S2 공개·공고 | `feed`·`directory`·`profile`·`project` 이전(약 345 구간), 분류값 헬퍼, `deadlineLabel` override 키화, `data-ugc` 표시 | 1.5일 |
| S3 내 계정·포트폴리오 | `me`·`applications`·`portfolio` 이전(약 680 구간), `/me/visa` 빈 상태 | 2.5일 |
| S4 라이브러리·액션·기능 통합 | `labels`·`validation`·`actions` 이전, `phone.ts`, 날짜·금액 헬퍼, 기존 다국어 기능의 요청 언어 통합·케이스 포털 `lang`·낙관적 전환, `quick`·메일 사전 `ja` 196키 | 1.5일 |
| S5 번역·검수·스윕 | 초안 생성, 검수 반영, 스윕·스크린샷 수정, 번들·RSC payload 확인, R1 | 2일 + 검수자 시간 |
| **P1 합계** | | **약 11.5일** |
| P2 | 공고 등록·정산 화면·메일 5종·푸시·신고·소유자 콘솔·클라이언트 보드 정책 | 약 3일 |

병렬로 세션을 나누면 달력 기준 2주 안에 R1까지 갈 수 있다.

---

## 9. 리스크와 함정

- **Hydration 불일치**: 클라이언트에서 언어를 다시 정하는 코드가 남으면 발생한다. Provider 값만 쓰고, 기존 기능 랜딩의 `useEffect` 감지를 반드시 제거한다. 예외는 §3.4의 두 가지(`global-error.tsx`, 옛 localStorage 키 1회 이전)뿐이며 둘 다 첫 렌더를 바꾸지 않는다. 스윕이 콘솔 경고 0건을 강제한다.
- **요청 언어와 UI 언어 혼동**: 전역 문구가 요청 언어를 읽으면 플래그가 무력화되고, 기능이 UI 언어를 읽으면 플래그 `ko`에서 기존 다국어가 사라진다. 접근자 이름(`useLocale`/`useRequestedLocale`, `getLocale`/`getRequestedLocale`)으로 구분한다.
- **미들웨어 조기 반환**: 언어 결정이 호스트 분기 뒤에 있으면 dancers.bio 슬러그 페이지에 헤더가 없다. 결정을 최상단에 두고 rewrite에 헤더를 넘긴다.
- **액션 응답의 옛 언어**: 쿠키를 바꾸는 서버 액션은 Next가 현재 페이지를 옛 `x-locale`로 다시 렌더한다. 전환 액션은 반드시 `redirect`로 끝난다.
- **`?lang=` 잔류**: URL에 `?lang=ja`가 남은 채 전환하면 다음 요청도 일본어다. 전환 액션이 파라미터를 제거한 URL로 redirect한다. 비자 케이스 포털만 `?lang=`을 갱신하는 방식이다.
- **redirect를 실패로 오인**: 성공한 redirect도 액션 Promise의 rejection으로 온다. rejection을 catch해 낙관적 상태를 되돌리거나 그 뒤에서 localStorage를 지우는 구현은 틀렸다. 실패는 반환값으로만 판단한다.
- **localStorage 이전 오작동**: 쿠키가 없고 `?lang=`도 없을 때, effect에서 한 번만, 키 삭제 후 호출한다는 세 조건을 지키지 않으면 명시적 링크 언어를 과거 값으로 덮어쓴다.
- **폰트 상속**: 언어 영역에서 CSS 변수만 바꾸면 글꼴이 바뀌지 않는다. `:lang(ja)`에 `font-family: var(--app-font-sans)`를 직접 선언한다.
- **동적 렌더 전환**: 루트 레이아웃이 헤더를 읽어 정적 11페이지가 동적이 된다. 랜딩 조회는 캐시로 감싸고 실패는 캐시하지 않으며 TTFB를 배포 후 실측한다.
- **미들웨어 response 교체**: Supabase `setAll`이 `NextResponse.next({ request })`를 새로 만들므로 쿠키는 최종 `response`에만 세팅한다. 헤더는 `request.headers`에 세팅하므로 교체에 영향받지 않는다(Codex가 Next 내부 `response.js`·`resolve-routes.js`로 확인).
- **관리자 오류 언어**: 관리자도 쿠키·Accept-Language를 따르므로 강제 `ko` 경로 목록을 세그먼트 경계로 둔다. 관리자 계정의 쿠키·프로필 값은 건드리지 않는다.
- **사전 객체 props 전달**: 서버에서 클라이언트로 사전을 넘기면 RSC 페이로드가 커진다. 클라이언트가 직접 import한다.
- **문자열 이어 붙이기**: `${name}님`, `${n}건` 같은 조합은 언어별 어순이 달라 전부 자리표시자 키로 바꾼다.
- **zod 기본 문구 누출**: 키가 아닌 zod 기본 메시지는 영문 "Required"로 새어 나온다. `localizeZodError`가 키 아님을 `v.invalid_input`으로 감싼다.
- **한·영 병기 오류**: `lib/phone.ts`처럼 헬퍼가 문장을 직접 반환하면 일본어가 빠진다. 헬퍼는 키를 반환한다.
- **override 라벨 잔류**: `deadlineLabel`의 `labels` override는 번역보다 우선하므로 호출처의 한국어 override를 그대로 두면 한국어가 남는다.
- **길이 넘침**: 영어 30~40% 증가. §3.10의 우선 대상을 번역 적용 후 320px 포함해 확인한다.
- **일본어 글꼴**: Tailwind `@theme inline`이 폰트 목록을 인라인하므로 변수 한 단계를 끼운다. `:lang(ja)` 선택자로 기능 영역도 덮는다. 추가 CSS 로드로 첫 화면 폰트 교체가 보일 수 있고 `display=swap` 기본이라 텍스트는 즉시 보인다.
- **번들 크기**: 네임스페이스 직접 import로 화면당 필요한 사전만 실린다. 검증은 전체 JS와 RSC payload로 한다.
- **관리자 화면 회귀**: enum 라벨 상수를 옮기면서 관리자 import가 깨질 수 있다. `ko` 값을 같은 이름으로 재수출해 무변경을 보장한다.
- **테스트 계정**: 스윕은 운영 DB의 E2E 계정을 쓴다. 데이터 생성은 하지 않고 읽기와 화면 확인만 한다.

---

## 10. 결정 필요 항목과 미확인

결정 필요.
1. 일본어 검수자 지정.
2. 영어 검수자 지정(대표 또는 운영진).
3. 금액 표기 `ja` = `1,000,000ウォン` 채택 여부.
4. P2 착수 시점(외국인 지급 정책 결정과 연동).

미확인(구현 시 확인).
- 루트 레이아웃 동적화 후 `next build` 성공과 정적 11페이지의 TTFB.
- 서버 액션의 `redirect(cleanUrl, RedirectType.replace)` 뒤 실제 화면이 새 언어로 오는지(Next가 대상을 서버 안에서 GET하는 경로와 클라이언트 탐색 경로 둘 다). 랜딩 Data Cache는 계속 쓰인다.
- `.font-sans`가 `var(--app-font-sans)`로 컴파일되는지(Codex 메모리 컴파일은 통과, 레포 빌드에서 재확인).
- Pretendard JP Variable CDN 파일의 실제 용량과 로드 시간.
- Playwright 로그인의 실제 성공(실행 전).

---

## 11. 교차검증 기록

Codex `gpt-6-astra`(reasoning high, 샌드박스 read-only) 교차검증. 라운드 전문은 `~/.codex-chat/deetz-i18n-ui/`에 있다. 문서 반영은 Claude가 직접 했고 Codex는 검토만 했다.

### 라운드 1 (2026-09-11, 163k 토큰)
- 지적 A~J 중 반박 1건(G, ESLint 선택자 동작 확인), 부분동의 7건, 동의 2건.
- 수용한 교정: 미들웨어 조기 반환 4곳, 사전 키 수(128·68), 랜딩 조회 3개, `React.cache` 범위, `/visa/case` 언어 우선순위 보존, `?lang=` 잔류·로컬 상태 동기화, 인벤토리 범위 누락(`components/ui`·`/me/*`·액션 5개), 헬퍼 시그니처 보존, Tailwind `@theme inline` 폰트 인라인, 관리자 요청 언어, 스윕 검사 범위(속성·예외), `phone.ts`·`global-error.tsx`, 길이 검수 우선 대상, 플래그·롤백 예외.
- Claude가 DB로 해결한 항목: `profiles` RLS·권한·트리거(Codex는 레포 SQL에서 못 찾음).

### 라운드 2 (2026-09-11, 49k 토큰)
- 결정 10개 중 동의 3건(번들 분리·헬퍼 시그니처·폰트 변수화), 부분동의 6건, 반박 1건.
- 반박(결정 2): `revalidatePath` 생략으로는 액션 응답의 옛 언어 렌더를 막지 못한다. Next 16.2.5 `request-cookies.js:115`·`action-handler.js:864·891`로 확인해 수용했고, 전환 액션을 서버 `redirect`로 바꿨다.
- 수용한 교정: 요청 언어/UI 언어 분리, 케이스 포털 `lang` 속성과 `?lang=` 갱신, 강제 `ko` 경로 세그먼트 판정·목록, 낙관적 전환, 스윕의 기대 언어·상태·회귀·`pageerror`, `interpolate` 필수 변수 검사, 랜딩 캐시의 실패 비저장·명시적 키, `global-error` 독립 사전과 effect 복구, 번들 검증 범위(전체 JS·RSC payload), `labels` override 번역, 간편접수·영상제출 `ja` 미비 표기, Vercel 롤백 재배포.
- 최종 변경 지시서 18항목을 rev2에 모두 반영했다.

### 라운드 3 (2026-09-11, 108k 토큰)
- 지시서 18항목 중 반영 14, 보완 4(인벤토리·부록 불일치, 수신거부 rewrite 누락, 검색 영향 단정, 일본어 폰트 적용 조건).
- 새 설계 문장 7개 중 확인 6, 반박 1(서버 액션 redirect는 Next가 대상을 서버 안에서 GET할 수 있어 "항상 클라이언트 GET"이 아니다. `action-handler.js:235·145·172`, `server-action-reducer.js:215·233` 확인).
- 구현 전 보완 7건을 rev3에 반영: `localeFor` 폴백 구현 방식, 케이스 포털 `key` 재마운트, 언어 영역 `font-family` 직접 선언과 기능 라우트 JP CSS 로드, `global-error`의 `useSyncExternalStore`(현재 lint `react-hooks/set-state-in-effect` severity 2 회피), `InternationalPhoneField.tsx:131` 번역, redirect rejection·저장 실패 처리 계약과 DB → 쿠키 순서, `/me/visa`의 `translator(me, getRequestedLocale())` 호출.
- 내부 모순 6건 반영: 범위 목록 일치(`projects/[id]/applicants`를 P2·스크립트에 추가), localStorage 이전을 문서화된 예외로 격상, §0·§3.1에 §3.2 예외 참조, 일본어 금액 표기의 결정 전 기본값 명시, 영역별 기대 언어, 검색 영향 미검증 표기.

### 라운드 4 (2026-09-11, 45k 토큰)
- 3라운드 반영 14항목 중 확인 12, 미흡 2(범위 밖 집계 수치, 클라이언트 탐색 시 JP CSS 로드). `useSyncExternalStore` 방식은 현재 ESLint 설정에서 오류 0건, hydration은 `getServerSnapshot`으로 ko 고정을 확인했다(`react-dom-client.development.js:8112`).
- 잔여 3건을 즉시 반영했다. 범위 밖 수치를 107파일·2,763구간으로 정정, JP CSS를 루트에서 항상 로드(루트 레이아웃은 클라이언트 탐색에서 재사용되므로 조건부 로드가 갱신되지 않음, `layout.md:152·240`), §9 예외 문구를 두 가지로 정합.
- 최종 판정: **합의**(잔여 쟁점 3건 반영 완료). 이후 변경은 구현 PR에서 이 문서를 갱신하며 진행한다.

### 구현 기록 (2026-09-11 overnight build, 브랜치 `feat/i18n-ui`)

구현은 worktree `deetz-i18n-ui`에서 S0 → S4 → S1·S2·S3(병렬 에이전트) → S5(스윕·수정) 순서로 했고, main 머지는 대표 결정으로 남긴다.

- 사전: `src/lib/i18n/messages/` 19개 네임스페이스, 약 1,645키 × ko·en·ja(+ `mail-messages.ts` 68키 ja 추가). 영어·일본어는 Claude 초안이며 검수 전이다. 검수 우선 키는 PR 본문에 적었다.
- 설계 대비 확정·변경한 것.
  - `enabledLocales()` 기본값: `VERCEL_ENV=production && NODE_ENV=production`일 때만 `ko`. 로컬 `.env.local`이 Vercel에서 당겨온 `VERCEL_ENV=production`을 갖고 있어 `NODE_ENV` 조건을 더했다.
  - 기존 localStorage 언어 키(`deetz_program_lang` 등)는 `LegacyLocaleMigration`이 첫 방문 한 번만 쿠키로 옮긴다(쿠키·`?lang=`이 없을 때만).
  - `InternationalPhoneField`의 국가 `<option>`은 `suppressHydrationWarning`을 둔다. `Intl.DisplayNames` 결과가 Node ICU와 Chromium ICU에서 달라(예: "Falkland Islands (Islas Malvinas)") main에서도 hydration 경고가 났다. 라벨은 표시용이라 경고만 억제했다.
  - 일본어는 `:lang(ja)`에서 `[word-break:keep-all]`을 `normal`로 되돌린다. 띄어쓰기가 없어 keep-all이면 문장이 한 줄로 늘어난다(320px 랜딩이 920px까지 넘쳤다). 레이어 밖 규칙이라 유틸리티보다 우선한다.
  - 랜딩 hero 제목은 ko 외 언어만 `clamp(2.25rem,12vw,3rem)`이다("choreography"가 320px에서 넘침). ko 크기는 그대로다.
  - `/applications` 단계 칩은 `application-stage.ts`의 `stageLabel()`을 그대로 쓰지 않고 같은 규칙의 언어별 헬퍼(`labelFor("stage")` + `stage.round`)로 만든다. `stageLabel()`은 ko 전용(메일·운영 화면)으로 남기고 eslint-disable 사유를 적었다. ko 출력은 2,976조합 대조로 동일함을 확인했다.
  - 지원 목록 en 버튼은 "Withdraw"·"Decline"으로 줄였다(320px에서 제목 열을 너무 좁혔다).
  - 언어 전환기 compact는 pill `whitespace-nowrap` + 그룹 `flex-wrap`, 사이드바(143px)는 아이콘 없이 쓴다. 랜딩 상단은 sm 미만에서 전환기가 둘째 줄로 내려간다.
  - `MessagesNavItem`·`MessagesTextLink`(`components/messaging/MessagesBadge.tsx`)는 범위 밖 디렉터리지만 셸에 보이는 문구라 nav 키로 옮겼다(`NEXT_PUBLIC_MESSAGING_ENABLED`가 켜진 환경에서만 렌더).
- 남긴 것(범위 밖 또는 후속).
  - P2 전부(공고 등록·수정, 정산, 메일 본문, `/projects/[id]/applicants`의 `ApplicantsConsole`은 `stageLabel()` ko 그대로).
  - `src/lib/validation/{portfolio,rate-cards}.ts`의 카테고리·역할 칩, `src/lib/data/{countries,korea-visas}.ts` 옵션 라벨, `src/lib/scoring/profile-score.ts` 항목 라벨, `src/lib/storage/*` 업로드 오류, `components/ui/searchable-select.tsx` 내부 문구는 한국어로 남아 있다(`/me/portfolio/[id]` 편집 화면에서 보임).
  - `/workshops`의 `th`는 `Locale` 밖이라 URL로만 유지. `/me/visa` 케이스 존재 화면은 영어 고정.
  - M4(비자 `preferred_lang` → `profiles` 백필)는 머지 후 실행.
- 게이트 결과: `typecheck` 0, `test:i18n` 7/7, ESLint 이 브랜치 신규 오류 0(기존 49건은 main과 동일: `scripts/*.cjs` `require()`, `react-hooks/set-state-in-effect` 등), 범위 안 한글 선택자 경고 0(의도된 ko 데이터는 사유 있는 disable), `next build` 성공(전 라우트 동적), 번들: portfolio 사전은 51KB 청크 1개에만 있고 랜딩 RSC payload에 me·portfolio·applications 문구 없음.
- 스윕(`npm run e2e:i18n`, 로컬 dev, 로그인 포함): en·ja × 15화면 + 전환 테스트 = 32건 통과, 320·390·1280 스크린샷 검수 후 넘침 0(위 수정 반영 후).

---

## 부록 A. 범위 파일 목록

### A.1 P1 포함
- `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/global-error.tsx`, `src/components/layout/*`, `src/components/brand/*`, `src/components/ui/*`
- `src/app/(public)/{feed,dancers,d,t,u}/**`, `src/app/(public)/layout.tsx`, `src/components/{directory,dancers,profile,share}/*`
- `src/app/(auth)/**`, `src/components/auth/*`, `src/app/onboarding/**`, `src/app/welcome/**`, `src/app/reset-password/**`
- `src/app/projects/[id]/page.tsx`, `src/components/project/{ProjectCard,ProjectListView,ApplyForm,ShareButton,ProjectMediaGallery,RespondProposalButtons}.tsx`
- `src/app/(app)/me/page.tsx`, `src/app/(app)/me/{notifications,portfolio,teams,password,rates,workshops,visa}/**`, `src/app/(app)/{applications,proposals,verify-instagram}/**`, `src/components/{me,portfolio,team,notification,verification,feedback}/*`
- `src/lib/validation/*`, `src/lib/phone.ts`, `src/lib/format-when.ts`, `src/lib/utils/deadline.ts`, `src/lib/application-stage.ts`, `src/lib/settlement.ts`(라벨·금액 헬퍼만)
- `src/app/actions/{applications,projects,profile,portfolio,portfolio-ai,auth,proposals,teams,claim,careers,rate-cards,verification,notification-prefs,bug-report}.ts`
- 기존 다국어: `src/lib/i18n/*`, `src/components/{visa,village,workshops,program}/*`, `src/app/{visa,workshops,village,program}/**`, `src/app/(public)/apply/**`, `src/app/submit/**`

### A.2 P2
- `src/app/projects/{new,[id]/edit}/**`, `src/components/project/{ProjectForm,ProjectEditForm,SelectionRoundsField,ProjectAttachmentsField}.tsx`
- `src/app/(app)/me/settlements/**`, `src/components/settlement/{MySettlements,BalanceWithdraw,BankPicker}.tsx`, `src/app/w/**`, `src/app/settle/**`
- `src/lib/notify/{approval-welcome-mail,project-match,announcement-mail,schedule-mail,challenge-guideline-mail,index}.ts`, `src/lib/push.ts`
- `src/app/(public)/{report,unsubscribe,guide}/**`, `src/app/projects/[id]/applicants/**`

### A.3 범위 밖
- `src/app/(app)/admin/**`, `src/components/admin/*`, `src/app/ops/**`, `src/app/cast/**`, `src/app/review/**`, `src/app/ndol/**`, `src/app/channels/**`
- `src/app/(public)/{terms,privacy,data-deletion}/**`(영문 안내 한 줄만), `src/app/{h,s,sr,fr,fit,sz,n,c}/**`
- `src/components/casting/*`, `src/components/settlement/{OwnerSettlementConsole,AddSettlementDancer,SettlementCollectForm,DancerDocuments}.tsx`, `src/lib/guides.ts`

## 부록 B. 용어집 초안

| ko | en | ja | 비고 |
|---|---|---|---|
| 캐스팅 | Casting | キャスティング | 탭·섹션명 |
| 공고 | casting call | 募集 | 문맥상 "job post"도 허용 |
| 지원 / 지원서 | apply / application | 応募 / 応募内容 | |
| 직접 제안 | direct offer | 直接オファー | `direct_proposal` |
| 정산 | payout | 精算 | 정산 화면은 P2 |
| 페이 | pay | 出演料 | 금액 라벨 |
| 회차 | session | 回 | `per_session` |
| 안무 제작 | choreography | 振付制作 | 카테고리 |
| 시안 | demo | デモ | 안무 시안 |
| 백업 댄서 | backup dancer | バックダンサー | |
| 활동명 | stage name | 活動名 | |
| 프로필 클레임 | claim your profile | プロフィールの引き継ぎ | `/claim` |
| 승인 대기 / 승인됨 | pending review / approved | 承認待ち / 承認済み | |
| 마감 | closes | 締切 | D-day 라벨 |
| 상시 모집 | always open | 常時募集 | `is_standing_pool` |
| 최종 합격 | final selection | 最終合格 | 선발 단계 |
| 1차 합격 | round 1 pass | 一次合格 | `{round}` 치환 |

## 부록 C. 키 네이밍 규칙

- `<네임스페이스>` 파일 안에서 `<화면>.<요소>[.<상태>]`.
- 같은 문구라도 화면이 다르면 키를 나눈다. 번역이 문맥에 따라 달라질 수 있다.
- 값은 완결 문장 또는 완결 라벨. 마침표는 문장에만 붙인다.
- 자리표시자는 `{snake_case}`. 숫자·날짜는 포맷된 문자열로 넘긴다.
- 개발 중 누락 키는 개발 모드에서 `[missing:ns.key]`로 표시되고 운영에서는 `ko` 값으로 폴백한다.
