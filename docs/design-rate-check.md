# 인스타그램 계정 페이 산정 도구 (임시) — 설계·구현 지시서

작성: 2026-09-06 (Claude 계획) · 구현: Codex · 대표 지시 "인스타 계정을 넣으면 팔로워·최근 릴스 조회수를 수집해 적정 안내가를 확인하는 독립 페이지"

## 0. 한 줄 요약

관리자가 Instagram 핸들을 입력하면 서버가 Apify로 팔로워 수와 최근 릴스 조회수를 수집하고, 팀 단가표(음원 챌린지 기준)로 계산한 **안내가**를 보여주는 admin 전용 페이지 `/admin/rate-check` 를 만든다.
결과는 DB에 남겨 같은 계정을 7일 안에 다시 조회하면 재수집 없이 보여준다.

## 1. 범위

### 만든다

1. 페이지 `src/app/(app)/admin/rate-check/page.tsx` (admin 전용, `requireAdmin()` 사용, 기존 admin 페이지 패턴 따를 것).
2. 서버 액션 `src/app/actions/rate-check.ts` — `checkInstagramRateAction(fd)` 하나. 반환은 `{ ok: true, data } | { ok: false, error }`.
3. 순수 계산 모듈 `src/lib/rate-check/pricing.ts` + 테스트 `src/lib/rate-check/pricing.test.ts` (`node --test`로 실행 가능한 형태, 기존 `test:*` 스크립트와 같은 방식. package.json 에 `test:rate-check` 추가).
4. Apify 호출 모듈 `src/lib/rate-check/apify.ts` (`import "server-only"`). npm 의존성 추가 없이 `fetch` 로 REST 호출.
5. 마이그레이션 `db/migrations/20260906_001_rate_checks.sql` — 테이블 `rate_checks`.
6. `AdminNav`(관리자 메뉴)에 "페이 산정" 항목 추가. 기존 메뉴 구조·아이콘 규칙을 그대로 따른다.

### 만들지 않는다

- 여러 계정 일괄 조회, CSV, 자동 스케줄, 댄서 프로필과의 연결·갱신(`dancers.follower_counts` 등 건드리지 않는다).
- 상업(브랜드) 챌린지 단가표. 화면에는 "상업 챌린지는 별도 협의" 한 줄만.
- 클라이언트 노출. 이 페이지는 admin 전용이며 공개 라우트에 어떤 정보도 내보내지 않는다.

## 2. 계산 규칙 (정본 — 그대로 구현)

### 2.1 릴스 표본

- 수집한 릴스를 `timestamp` 내림차순으로 정렬해 최근 10개를 쓴다. (고정 게시물은 시각 정렬로 자연 제외)
- 조회수 = `videoPlayCount`, 없으면 `videoViewCount`, 둘 다 없으면 그 릴스는 제외.
- 표본 상태 `sampleStatus`
  - 10개 이상 → `ok`: 조회수 오름차순 정렬 후 상·하위 2개 제외, 가운데 6개 평균 = 절사평균(`trimmedMean`), 가운데 6개의 최저/최고 = `viewsLow`/`viewsHigh`.
  - 6~9개 → `short`: 상·하위 1개씩 제외한 평균. 화면에 "표본 부족(참고치)" 표시.
  - 6개 미만 → `insufficient`: 평균·안내가 계산 안 함. 팔로워와 원본 조회수만 보여준다.
- `median` = 표본 조회수 중앙값.
- **보정 기대치** `expectedViews = min(trimmedMean, round(median × 1.5))`. (바이럴 1편이 평균을 끌어올리는 것을 막는 규칙)

### 2.2 티어

`expectedViews` 기준. 5만 이상 `anchor`(앵커), 1만 이상 `mid`(미드), 그 미만 `longtail`(롱테일). 미측정은 `null`.
기존 `src/lib/casting/forecast.ts` 의 `resolveTier`·`formatKoCount` 를 **재사용**한다(복제 금지).

### 2.3 안내가 (음원 챌린지 기준)

팔로워 기본단가 F (원):

| 팔로워 | F |
|---|---|
| 3만 미만 | 50,000 |
| 3만 이상 5만 미만 | 100,000 |
| 5만 이상 10만 미만 | 150,000 |
| 10만 이상 20만 미만 | 200,000 |
| 20만 이상 30만 미만 | 300,000 |
| 30만 이상 40만 미만 | 400,000 |
| 40만 이상 | 500,000 |

도달 단가 V (원, `expectedViews` 기준):

| expectedViews | V |
|---|---|
| 5천 미만 | 50,000 |
| 5천 이상 1.5만 미만 | 100,000 |
| 1.5만 이상 3만 미만 | 150,000 |
| 3만 이상 6만 미만 | 200,000 |
| 6만 이상 12만 미만 | 300,000 |
| 12만 이상 20만 미만 | 400,000 |
| 20만 이상 | 500,000 |

- **산식가** `formulaRate = max(floor(F / 2), V)` — 단, 하한 50,000, 상한 500,000.
- `expectedViews` 가 없으면(`insufficient`) 산식가 대신 "F 기준 참고가 = F" 만 표시하고 `formulaRate = null`.
- 팔로워 40만 이상이면 `outOfLadder = true` 로 표시하고 "단가표 밖 인물 · 개별 협의" 안내.
- 화면 안내 문구(고정): "오퍼가 = 희망가와 산식가 중 낮은 쪽. 희망가가 산식가보다 높으면 산식가로 협의. 상업(브랜드) 챌린지는 별도 협의."

### 2.4 핸들 정규화

입력은 `@handle`, `handle`, `https://www.instagram.com/handle/`, `instagram.com/handle?igsh=...` 전부 허용.
소문자화·앞 `@` 제거·URL 경로 첫 세그먼트만 추출·`?`·`/` 이후 제거. 허용 문자 `[a-z0-9._]`, 1~30자. 아니면 오류.

## 3. Apify 호출 (`src/lib/rate-check/apify.ts`)

- 토큰은 **이 기능 전용 서버 env** `RATE_CHECK_APIFY_TOKEN` 에서만 읽는다. 전사 `APIFY_ENABLED` 게이트나 다른 토큰 변수는 참조하지 않는다. 토큰이 없으면 액션은 `{ ok:false, error:"측정 기능이 꺼져 있습니다(RATE_CHECK_APIFY_TOKEN 미설정)." }` 를 돌려주고 페이지 상단에 같은 안내를 띄운다.
- 엔드포인트(둘 다 `run-sync-get-dataset-items`, `timeout=90`, `Content-Type: application/json`):
  1. 프로필: `POST https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=<T>&timeout=90` body `{ "usernames": [handle] }` → 첫 항목의 `followersCount`, `fullName`, `profilePicUrlHD`(없으면 `profilePicUrl`), `private`, `error`/`errorDescription`.
  2. 릴스: `POST https://api.apify.com/v2/acts/apify~instagram-reel-scraper/run-sync-get-dataset-items?token=<T>&timeout=90` body `{ "username": [handle], "resultsLimit": 12, "includeSharesCount": false, "includeTranscript": false, "includeDownloadedVideo": false }` → 항목별 `shortCode`, `url`, `timestamp`, `videoPlayCount`, `videoViewCount`, `likesCount`(-1 = 미확인), `commentsCount`, `ownerUsername`.
- `fetch` 에 `AbortController` 100초 타임아웃. HTTP 오류·비어 있는 결과·`private=true` 는 사용자에게 읽히는 한국어 오류로 변환한다("비공개 계정", "계정을 찾을 수 없음", "Apify 응답 지연" 등).
- 응답 JSON 의 원본은 `rate_checks.raw` 에 그대로 저장한다(재분석용).
- 비용 상한: 하루(KST) 30회를 넘으면 액션이 거부한다(`rate_checks` 오늘 생성 행 수로 판단, 캐시 히트는 세지 않는다).

## 4. 데이터 (`db/migrations/20260906_001_rate_checks.sql`)

```sql
create table if not exists public.rate_checks (
  id uuid primary key default gen_random_uuid(),
  ig_handle text not null,
  campaign_kind text not null default 'music_challenge',
  followers integer,
  full_name text,
  profile_pic_url text,
  is_private boolean not null default false,
  reels jsonb not null default '[]'::jsonb,        -- [{shortCode,url,timestamp,plays,likes,comments}]
  reels_used smallint not null default 0,
  sample_status text not null,                     -- ok | short | insufficient
  trimmed_mean integer,
  median_views integer,
  views_low integer,
  views_high integer,
  expected_views integer,
  tier text,                                       -- anchor | mid | longtail | null
  f_base integer,
  v_base integer,
  formula_rate integer,
  out_of_ladder boolean not null default false,
  raw jsonb,
  error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rate_checks_handle_created_idx on public.rate_checks (ig_handle, created_at desc);
alter table public.rate_checks enable row level security;
revoke all on public.rate_checks from anon, authenticated;
-- 정책 없음: 서버 액션이 requireAdmin 통과 후 service-role(admin client)로만 읽고 쓴다.
comment on table public.rate_checks is '관리자 페이 산정 도구 조회 기록. 금액은 안내가(산식)이며 계약가가 아니다.';
```

- 이 마이그레이션은 Codex가 파일만 만든다. 운영 DB 적용은 Claude가 Supabase MCP로 한다(적용 후 `npm run db:types` 는 Claude가 실행).
- `types.ts` 가 아직 없는 테이블이라 서버 액션에서는 `admin.from("rate_checks")` 에 명시적 타입 캐스팅을 써도 된다(기존 코드에 같은 패턴이 있으면 따른다).

## 5. 서버 액션 `checkInstagramRateAction(fd: FormData)`

입력: `handle`(문자열), `force`("true"면 캐시 무시).

1. `requireAdmin()` (실패 시 `{ok:false,error:"권한이 없습니다."}`).
2. 핸들 정규화(2.4). 실패 시 오류.
3. `force` 가 아니면 `rate_checks` 에서 같은 `ig_handle`·`error is null`·7일 이내 최신 1건을 찾아 있으면 그대로 반환(`cached: true`).
4. 토큰 확인(3장). 없으면 오류.
5. 일일 상한 확인(3장).
6. Apify 프로필 → 릴스 순서로 호출. 프로필이 비공개거나 없으면 릴스 호출 없이 오류 행(`error` 채움)을 저장하고 오류 반환.
7. `pricing.ts` 로 계산 → `rate_checks` insert(`created_by` = 현재 사용자 profile id) → 결과 반환.
8. `revalidatePath("/admin/rate-check")`.

반환 `data` 는 화면이 그대로 그릴 수 있는 형태(핸들·팔로워·프로필 사진·릴스 목록(조회수 오름차순 정렬 + 절사 제외 여부 플래그)·통계·티어·F·V·산식가·outOfLadder·sampleStatus·cached·createdAt).

## 6. 화면 `/admin/rate-check`

- 상단: 제목 "페이 산정 (음원 챌린지 기준)", 토큰 미설정이면 노란 안내.
- 입력 폼: 핸들 입력 1개 + "측정" 버튼 + "캐시 무시하고 재측정" 체크박스. 진행 중 버튼 비활성·스피너.
- 결과 카드(측정 직후 또는 히스토리에서 클릭):
  - 계정: 프로필 사진(있으면), 핸들(instagram 링크), 이름, 팔로워(`formatKoCount`), 측정 시각, `cached` 표시.
  - 릴스 조회수: 10개를 오름차순 목록으로, 절사(상·하위 2개)된 항목은 흐리게 + "제외" 라벨. 각 항목은 게시일·조회수·게시물 링크.
  - 통계: 절사평균 / 중앙값 / 보정 기대치 / 티어 배지 / 표본 상태.
  - 안내가: F(팔로워 기본단가), V(도달 단가), **산식가**(크게), 하한·상한, `outOfLadder` 면 "단가표 밖 · 개별 협의". 아래 고정 문구(2.3).
  - "요약 복사" 버튼: `@handle · 팔로워 N · 최근 릴스 평균 N회 · 티어 · 안내가 N원` 한 줄을 클립보드로.
- 히스토리: **테이블**(카드 나열 금지) — 컬럼: 시각, 핸들, 팔로워, 보정 기대치, 티어, 산식가, 표본, 조회자. 핸들 검색창(즉시 필터), 티어 필터 칩, 최신순, 최근 200건. 행 클릭 시 결과 카드로 표시. 모바일은 가로 스크롤 래퍼.
- 스타일은 기존 admin 페이지(`/admin/rate-cards`, `/admin/finance/receivables` 등)의 컴포넌트·토큰(`text-ink-*`, `border-border`, `bg-card`)을 따른다. 새 디자인 시스템을 만들지 않는다.
- 금액 표기는 `toLocaleString("ko-KR")` + "원".

## 7. 검증 기준 (Codex가 끝내기 전에 직접 확인)

- `npm run typecheck` 통과.
- `npx eslint` 대상 파일 오류 0.
- `npx tsx --test src/lib/rate-check/pricing.test.ts` 통과. 테스트는 최소: 핸들 정규화 5케이스(URL·@·쿼리·대문자·잘못된 값), 절사평균(10개), short(7개), insufficient(4개), 보정 기대치(중앙값×1.5 캡), F·V 사다리 경계값, 산식가 하한·상한, outOfLadder.
- `npm run build` 통과(시간이 오래 걸리면 typecheck·lint까지만 하고 보고에 명시).
- 토큰이 없는 로컬에서는 페이지가 안내 문구를 띄우고 액션이 정상 오류를 돌려주는지 확인(실제 Apify 호출은 하지 않는다 — 로컬에 토큰을 넣지 말 것).

## 8. 하지 말 것

- `APIFY_TOKEN_DISABLED_20260813` 등 다른 토큰 변수명을 코드에 쓰지 않는다.
- 클라이언트 컴포넌트에 토큰·원본 응답을 내려보내지 않는다.
- `dancers`·`casting_board_members` 등 기존 테이블을 수정하지 않는다.
- 기존 파일 포맷·줄바꿈을 대량으로 바꾸지 않는다(작업한 파일만 diff 에 나오게).
- 커밋하지 않는다. 작업 트리에 변경만 남긴다(커밋·배포는 Claude가 한다).

## 9. 완료 보고 형식

변경 파일 목록, 실행한 검증 명령과 결과, 설계와 다르게 한 부분(있으면 이유), 남은 이슈.
