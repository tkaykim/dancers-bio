# 캠페인 성과 보고 (Campaign Results) — 설계 정본
검토 이력: 2026-09-07 Codex gpt-6-astra 1라운드 지적 17건 반영 · 2라운드 이견 3건(프로필 2단계 수집·고아 실행 복구·공유 포함 단가 0.0083 총액) Claude 반영

작성 2026-09-07 · 계획 Claude · 교차검토 Codex gpt-6-astra · 구현 Codex gpt-6-astra(high)

## 0. 한 줄 요약

챌린지 캠페인(LG I Wash, LISA SaWaDiKa 등)의 참여 계정·게시물 링크·재생·반응·준수 여부를 운영 도구에서 관리하고, 발행 시 동결한 성과 보고서를 클라이언트에게 링크 하나로 제공한다.
운영 화면은 `/tools/campaigns`, 클라이언트 화면은 `/results/[code]`로 분리한다.

## 1. 배경과 원칙

LG 캠페인(프로젝트 `06232945-3563-431e-b399-edc6c7b21dc5`)은 게시물 90개·계정 100개를 Google Sheet와 Apify 일회성 스크립트로 T+1·T+3·T+10에 측정했다.
지표 정의와 한계는 `deliverables/ops-oneoff/lg-reels-metrics-plan-20260903.html`(아티팩트 `2aa99ce4`)에 확정된 규칙을 따른다.

LISA 캠페인(프로젝트 `3e694210-9e9c-433c-bec8-8293ea9f51f1`)은 9/7부터 업로드를 시작하며 이 기능의 첫 실사용 대상이다.
같은 프로젝트에 테스트 보드 `fznaktz`(3명)와 운영 보드 `VTCq6EK`(33명)가 있으므로 예측 기준 보드를 명시한다.

- 기존 핵심 테이블 5개를 유지하고, 프로젝트 공통 규칙용 `campaign_rules`를 추가한다.
- 운영 관리자와 담당 프로젝트 공동관리자가 이번 범위부터 사용한다.
- 관리자 목록은 표·검색·필터·정렬·페이지를 기본으로 한다.
- 재생의 정본은 비로그인 공개 화면의 `videoPlayCount`이다.
- 좋아요 `-1`은 「미확인」으로 표시하고, 공유·댓글에는 「N개 기준」 커버리지를 병기한다.
- 수치는 측정 시각·스냅샷 식별자·분모와 함께 다루며, 팔로워 기준 회차는 재생 기준과 별도로 표시한다.
- 공개 데이터는 서버 화이트리스트 DTO로 만들며, 비용 필드는 어떤 공개 설정에서도 존재하지 않는다.
- 공개 보고서는 발행 시 DTO 전체를 동결하고 재발행 전까지 바뀌지 않는다.
- Apify는 전사 `APIFY_ENABLED=false` 게이트와 별개로 `RATE_CHECK_APIFY_TOKEN`만 사용한다.
- 캠페인 수집은 비동기 실행과 폴링으로 구현하며, 기존 페이 산정의 동기 수집 함수는 변경하지 않는다.

## 2. 용어

| 용어 | 정의 |
|---|---|
| 캠페인 | deetz `projects` 1행에 대응하는 성과 관리 대상 |
| 게시물(post) | 프로젝트 안에서 Instagram shortcode로 식별하는 릴스 1개 |
| 참여 계정 | 게시물 소유 계정과 공동작업 계정 |
| 스냅샷(snapshot) | 프로젝트 게시물을 수집하는 회차와 실행 원장 |
| 확정 스냅샷 | 수집 결과가 트랜잭션으로 저장된 `succeeded` 또는 `partial` 회차 |
| 지표(metrics) | 스냅샷별 게시물·계정 관측값 |
| 공통 규칙(rules) | 프로젝트당 한 벌의 준수·예측·라벨 기준 |
| 보고서(report) | 공유 코드·편집 설정·동결된 공개 DTO를 가진 공개 단위 |
| 실현율 | 소유 계정별 게시물 재생 합을 보존된 기대조회로 나눈 값 |

팔로워는 업로드 계정 실측을 사용하며, 공동작업 게시물은 참여 계정 팔로워를 게시물 기준으로 합산한다.
팔로워 합계를 도달 인원으로 해석하지 않는다.

## 3. 데이터 모델 (마이그레이션 `db/migrations/20260907_001_campaign_results.sql`)

핵심 테이블은 `campaign_posts`, `campaign_snapshots`, `campaign_post_metrics`, `campaign_account_metrics`, `campaign_reports`의 5개를 유지한다.
프로젝트당 1행의 설정 테이블 `campaign_rules`를 추가하므로 이번 마이그레이션의 테이블은 총 6개다.

모든 테이블에 RLS를 활성화하고 anon·authenticated용 정책은 만들지 않으며 직접 테이블 권한도 회수한다.
운영 페이지·액션은 §7의 게이트를 통과한 뒤 서비스롤로 접근한다.
공개 로더는 공유 코드·활성·만료·발행 여부를 확인한 뒤 동결된 공개 DTO만 반환한다.

### 3.1 `campaign_posts` — 게시물 원장

| 컬럼 | 타입·제약 | 설명 |
|---|---|---|
| id | uuid pk | 게시물 식별자 |
| project_id | uuid not null fk projects | 소속 프로젝트 |
| short_code | text not null | Instagram shortcode |
| post_url | text not null | 정규 URL `https://www.instagram.com/reel/<short_code>/` |
| owner_handle | text null | 소문자·@ 제거를 적용한 소유 계정 핸들 |
| owner_confirmed_at | timestamptz null | 첫 확정 스냅샷에서 소유 계정을 확인한 시각 |
| collab_handles | text[] default '{}' | 정규화한 공동작업 계정 |
| dancer_id | uuid null fk dancers | 자동 연결 또는 운영자 선택 |
| application_id | uuid null fk applications | 같은 프로젝트·댄서의 지원서 |
| display_name | text null | 관리자가 검토한 보고서 표시 이름 |
| forecast_member_id | uuid null fk casting_board_members | 선택된 예측 기준 보드의 연결 멤버 |
| forecast_expected_views | int null | 게시물 연결 시 보존한 기대조회 |
| posted_at | timestamptz null | 첫 확정 스냅샷의 `timestamp`로 채운 게시 시각 |
| source | text not null | `admin_paste` / `csv_import` / `participant` / `backfill` |
| status | text not null default 'active' | `active` / `unverified` / `removed` / `excluded` |
| note | text null | 운영 메모, 공개 비노출 |
| created_by, created_at, updated_at | | 생성자와 변경 이력 |

제약은 `unique(project_id, short_code)`와 `unique(id, project_id)`를 둔다.
`application_id`를 저장하거나 수정할 때 서버는 `applications.project_id = project_id`와 `applications.dancer_id = campaign_posts.dancer_id`를 모두 검증한다.
예측 멤버도 같은 프로젝트의 `campaign_rules.forecast_board_id` 소속인지 서버에서 검증한다.

URL만으로 등록할 수 있으며, 소유 계정을 모르면 `owner_handle=null`로 저장한다.
등록 시 `@handle`이나 지원자 선택으로 미리 채워도 `owner_confirmed_at`은 null이다.
첫 확정 스냅샷의 `ownerUsername`으로 소유 계정을 채우고 `owner_confirmed_at`을 기록한다.
미리 입력한 핸들과 수집값이 다르면 운영 화면에 경고를 표시한다.

`unverified`는 확정 스냅샷에서 2회 연속 `not_found`일 때만 적용한다.
`error`·실패 실행은 판정에서 제외하며, `removed`는 운영자가 수동 확정하고 `excluded`는 집계에서 제외한다.

### 3.2 `campaign_snapshots` — 회차·실행 원장

| 컬럼 | 타입·설명 |
|---|---|
| id | uuid pk |
| project_id | uuid not null fk projects |
| label | `T+N` 또는 운영자 입력 라벨 |
| taken_at | 측정 기준 시각, UTC 저장·KST 표시 |
| source | `apify` / `backfill` |
| status | `reserved` / `running` / `succeeded` / `partial` / `failed` |
| error | text null, 수집·확정 오류 기록 |
| reels_run_id, profiles_run_id | 각 Actor의 실행 ID, 미실행 프로필은 null |
| reels_dataset_id, profiles_dataset_id | 각 실행의 dataset ID |
| apify_run_id | 원본 회차 식별자, 신규 수집은 릴스 run ID·백필은 원본 릴스 run ID |
| estimated_cost_usd | 서버가 계산해 예약한 회당 예상 비용 |
| reels_estimated_cost_usd, profiles_estimated_cost_usd | Actor별 비용 상한 배분 |
| apify_cost_usd | Actor 실행 메타에서 확인한 실제 비용 합계 |
| include_shares | boolean, 공유 수 수집 옵션 |
| posts_total, posts_found | 예약 대상 게시물 수와 공개 확인 수 |
| target_post_ids | uuid[], 예약 시 고정한 대상 게시물 ID |
| followers_collected | boolean, 이 회차의 팔로워 수집 여부 |
| followers_snapshot_id | uuid null, 팔로워 기준 회차 |
| created_by, created_at | 실행 요청자와 예약 시각 |

`unique(id, project_id)`를 두고, `unique(project_id, apify_run_id)`로 원본 회차의 중복 적재를 방지한다.
`followers_snapshot_id`는 `(followers_snapshot_id, project_id)` → `campaign_snapshots(id, project_id)` 복합 FK로 같은 프로젝트임을 강제한다.
팔로워를 수집한 확정 회차는 자기 자신을 참조하고, 수집하지 않았다면 가장 최근 팔로워 수집 확정 회차를 참조한다.
사용할 회차가 없으면 null로 두고 「팔로워 미측정」을 표시한다.

KPI·발행·게시물 상태 판정에는 `succeeded|partial`만 사용한다.
`reserved|running|failed`는 실행 이력에는 남지만 성과 회차로 사용하지 않는다.

### 3.3 `campaign_post_metrics` — 스냅샷 × 게시물

| 컬럼 | 타입·설명 |
|---|---|
| project_id | uuid not null |
| snapshot_id, post_id | uuid not null, `unique(snapshot_id, post_id)` |
| fetch_status | `found` / `not_found` / `error` |
| plays | int null, `videoPlayCount`만 사용 |
| views_legacy | int null, `videoViewCount` 참고값 |
| likes | int null, `likesCount >= 0`만 저장하고 -1은 null |
| likes_source | `reel` / `profile` / null |
| comments | int null |
| comments_disabled | boolean, `isCommentsDisabled` 관측값 |
| shares | int null, `sharesCount`가 있을 때만 저장 |
| audio_id | text null, `musicInfo.audio_id` 관측값 |
| hashtags | text[], 관측한 해시태그 |
| mentions | text[], 관측한 멘션 |
| paid_partnership | boolean null, `paidPartnership` 관측값 |
| caption_excerpt | text null, 앞 200자·공개 비노출 |
| raw | jsonb, 게시물별 Apify 원본 항목 |

`(snapshot_id, project_id)` → `campaign_snapshots(id, project_id)`와 `(post_id, project_id)` → `campaign_posts(id, project_id)` 복합 FK를 둔다.
기존 제안의 `found` boolean은 사용하지 않는다.
`found`는 조회 성공, `not_found`는 조회 결과 게시물을 찾지 못한 경우, `error`는 수집·해석 오류를 뜻한다.
원본의 오류나 설명 없는 누락을 일괄 `not_found`로 치환하지 않는다.

`official_audio`·`required_tags_ok` 같은 판정 플래그는 저장하지 않는다.
준수 여부는 관측값과 `campaign_rules`를 대조해 읽기 시 계산한다.

각주: `raw jsonb`는 게시물별로 유지한다.
목록·집계 쿼리는 raw를 SELECT하지 않으며, 권한을 확인한 상세 시트에서만 읽는다.
공개 DTO와 동결본에는 raw를 포함하지 않는다.

### 3.4 `campaign_account_metrics` — 스냅샷 × 계정 팔로워

| 컬럼 | 타입·설명 |
|---|---|
| project_id | uuid not null |
| snapshot_id, handle | uuid·정규화 핸들, `unique(snapshot_id, handle)` |
| followers | int null |
| is_private | boolean |
| full_name, profile_pic_url | 내부 검수용 관측값 |
| apify_run_id | 계정 측정의 원본 프로필 run ID, 백필 출처 보존 |
| raw | jsonb, 프로필 원본 |

`(snapshot_id, project_id)` → `campaign_snapshots(id, project_id)` 복합 FK를 둔다.
업로드 소유 계정과 공동작업 계정의 실측만 사용하고 `dancers.follower_counts`로 대체하지 않는다.
공동작업 계정 일부만 확인되면 확인된 팔로워 부분합에 「n/m 계정」을 병기한다.
계정 이름이나 프로필 실명을 보고서 표시 이름으로 자동 사용하지 않는다.

### 3.5 `campaign_reports` — 편집 설정·동결된 공개 보고서

| 컬럼 | 타입·설명 |
|---|---|
| id | uuid pk |
| project_id | uuid not null fk projects, 프로젝트당 여러 보고서 허용 |
| share_code | `text not null unique default gen_project_survey_code()` |
| title, client_label | 편집 중인 공개 제목과 클라이언트 표시명 |
| published_snapshot_id | uuid null, null이면 미발행 |
| published_payload | jsonb null, 발행 시 계산한 공개 DTO 전체 |
| published_at | timestamptz null |
| published_by | uuid null, 발행자 |
| settings | jsonb, §4.3의 편집 설정 |
| is_active, expires_at | 공개 접근의 활성·만료 조건 |
| created_by, created_at, updated_at | 생성자와 변경 이력 |

`(published_snapshot_id, project_id)` → `campaign_snapshots(id, project_id)` 복합 FK를 둔다.
공유 코드는 보드와 같은 생성기의 기본 7자를 사용한다.
앱은 공유 코드 insert의 unique 위반 시 1회 재시도한다.

「발행」 액션은 선택한 확정 회차로 공개 DTO 전체를 계산한 뒤 `published_snapshot_id`, `published_payload`, `published_at`, `published_by`를 함께 저장한다.
동결본에는 요약·추이·분포·상위 및 선택적 전체 게시물·준수 결과·공개 설정·팔로워 기준 회차·라벨을 포함한다.
표시 이름, 선택적 계정별 실현율, 공개할 추이 범위, 제목과 고지 문구도 발행 시 값으로 보존한다.
비용·원본·연락처·운영 메모는 동결본에 넣지 않는다.

`/results/[code]`는 동결본만 렌더하며 현재 게시물·회차·규칙·편집 설정으로 다시 계산하지 않는다.
미발행·동결본 없음·비활성·만료는 404로 응답한다.
활성·만료 조건은 요청 시 확인하되, 이후 스냅샷·게시물·규칙·설정 변경은 재발행 전까지 공개 내용에 반영하지 않는다.

### 3.6 `campaign_rules` — 프로젝트 공통 규칙

| 컬럼 | 타입·설명 |
|---|---|
| project_id | uuid pk fk projects, 프로젝트당 1행 |
| audio_id | text null, 공식 음원 기준 |
| required_tags | text[], 정규화한 필수 해시태그 |
| required_mentions | text[], 정규화한 필수 멘션 |
| forecast_board_id | uuid null fk casting_boards, 예측 기준 보드 |
| first_posted_at | timestamptz null, T+N 기준일·수동 오버라이드 가능 |
| updated_by, updated_at | 변경자와 변경 시각 |

`forecast_board_id`는 같은 프로젝트 보드인지 서버에서 검증한다.
기본값은 해당 프로젝트 보드 중 멤버 수가 가장 많은 보드이며, 선택한 값을 저장하고 이후 임의로 바꾸지 않는다.
운영자가 기준 보드를 직접 선택할 수 있다.
게시물을 연결할 때 정규화한 소유 핸들로 해당 보드 멤버를 매칭하고 `forecast_member_id`·`forecast_expected_views`를 게시물 행에 보존한다.

실현율 계산 단위는 계정이다.
해당 소유 계정의 집계 대상 게시물 재생 합을 보존된 expected_views로 나눈다.
기대값이 null 또는 0인 계정은 제외하고 「n/m 계정 기준」을 병기한다.
기본적으로 운영 도구에서만 제공하며, 보고서의 `showForecast`를 켰을 때 공개 DTO에 포함한다.

음원·태그·멘션 준수는 공통 규칙과 관측값으로 읽기 시 계산한다.
해당 기준이 없으면 그 준수 항목을 표시하지 않는다.
기준이 있어도 관측값이 없으면 미확인으로 다루며, 확인 가능한 항목 수를 함께 표시한다.
`first_posted_at`의 기본값은 프로젝트 첫 게시 시각이며 수동 오버라이드를 보존한다.

### 3.7 RPC — 원자 예약과 멱등 확정

두 RPC는 `SECURITY DEFINER`로 구현하고 고정 `search_path`를 사용한다.
anon·authenticated의 실행 권한은 회수하고 서비스롤만 호출한다.
서버 액션은 먼저 §7의 권한을 확인하며, `p_by`와 비용·대상 수는 클라이언트 입력을 신뢰하지 않고 서버에서 결정한다.

**예약: `campaign_reserve_snapshot(p_project uuid, p_est_usd numeric, p_by uuid, ...)`**

- 한 RPC 호출·트랜잭션 안에서 KST 당일 프로젝트 3회·전체 10회, 회당 3달러, 게시물 300개 상한을 검사한다.
- 동시 호출도 상한을 넘지 않도록 일일 전역 예약 검사를 DB 잠금으로 직렬화한다.
- 검증을 통과하면 대상 게시물·옵션·Actor별 예상 비용을 고정하고 `status='reserved'` 행을 insert한다.
- 위반하면 예외를 발생시키고 Apify 호출을 시작하지 않는다.
- 예약 이후 실패한 실행도 횟수 원장에 남기며, 외부 호출 전에 예약을 확정한다.

**확정: `campaign_finalize_snapshot(p_snapshot uuid, p_items jsonb, p_accounts jsonb)`**

- 입력 JSON은 서버가 수집한 관측값과 실행 메타를 담고, RPC는 대상 회차와 프로젝트 연결을 검증한다.
- metrics·account_metrics upsert와 snapshot 집계·실제 비용·팔로워 기준 회차·최종 상태 갱신을 한 트랜잭션으로 처리한다.
- 회차를 잠그고 이미 확정된 동일 회차의 재호출을 멱등 처리한다.
- 게시물별 수집 오류가 없으면 `succeeded`, 일부 `error`가 남으면 `partial`로 확정한다.
- `not_found`는 게시물 조회 결과이며 실행 실패와 구분한다.
- 소유 계정·게시 시각 보완과 `unverified` 전이도 확정 결과에 근거하며, 재호출로 중복 전이하지 않는다.

## 4. 화면

### 4.1 운영 도구 — `/tools/campaigns` · `/tools/campaigns/[projectId]`

2026-09-07 UI 재작업 지시에 따라 페이 산정과 함께 `(ops)` 라우트 그룹으로 옮긴다.
URL은 유지하며 `requireStaff()`를 적용한 관리자형 셸을 사용한다.
관리자는 기존 전체 내비게이션을, 공동관리자는 캠페인 성과·페이 산정 도구만 본다.
페이지·액션의 기본 게이트는 `requireStaff()`이다.
프로젝트를 다루는 동작은 추가로 `profile.is_admin || await canManageProject(projectId)`를 확인한다.

목록에서 운영 관리자·슈퍼관리자는 전체 프로젝트를 대상으로 조회한다.
공동관리자는 자신의 `project_managers` 행에 있는 프로젝트만 보며, 서비스롤 쿼리에도 이 프로젝트 필터를 강제한다.
「캠페인 추가」의 프로젝트 선택 목록에도 같은 필터를 적용한다.

목록은 프로젝트 제목·게시물 수·마지막 확정 스냅샷·누적 재생·공개 확인율·보고서 링크 수를 표로 보여준다.
기본 대상은 `campaign_posts` 또는 `campaign_reports`가 있는 프로젝트이며, 「캠페인 추가」로 허용된 프로젝트를 선택한다.
검색은 제목, 기본 정렬은 최신순이다.
AdminNav 「콘텐츠」 그룹에 관리자용 `/tools/campaigns` 링크를 추가하고 `/admin/projects` 각 항목에도 「성과」 링크를 둔다.
공동관리자는 `/tools/campaigns`에 직접 접근한다.

상세 탭은 `?tab=posts|trend|reports`로 관리한다.
`snapshot`·검색·정렬·페이지도 searchParams에 보존하고 서버 페이지에서 `await searchParams`로 읽는다.

**탭 A. 게시물**

- 기본 KPI는 최신 `succeeded|partial` 스냅샷의 `found|not_found`를 대상으로 한다.
- 게시물 수·공개 확인 N/M·재생 합·좋아요 확인 합·댓글 및 공유·참여 계정 팔로워 합계를 표시한다.
- `error` 게시물 수는 별도 안내하고 성과 분모와 합계에서 제외한다.
- 재생 측정 회차·시각과 「팔로워 기준 T+N(MM/DD)」를 별도로 표시한다.
- 표 열은 계정(참여자 이름 포함)·게시물(shortcode와 게시일)·팔로워·재생·좋아요·댓글·공유·준수 아이콘·한글 상태·편집 버튼이다.
  헤더 액션은 다이얼로그로 열고, 회차 선택·KPI 6개·탭은 공통 상단에 한 번만 표시한다.
- 검색은 핸들·이름·shortcode, 필터는 상태·공동작업·좋아요 미확인·준수 누락·팔로워 구간이다.
- 정렬은 재생·좋아요·팔로워·게시일이며, 페이지당 50건을 표시한다.
- 우측 상세 시트에서 회차별 지표·raw·소유 계정 불일치 경고를 확인하고 표시 이름·지원자 연결·상태·메모를 편집한다.
- 「게시물 추가」는 URL 여러 줄 또는 `@handle URL` 입력을 받고, shortcode 중복과 기존 행 충돌을 확인한 뒤 저장한다.
- CSV 열은 `post_url, handle, display_name, collab_handles`이며 공동작업 핸들은 세미콜론으로 구분한다.
- 「스냅샷 실행」은 대상 수·공유 수집·팔로워 수집·라벨을 입력받고, 예약·실행·확정 상태를 표시한다.
- 실행 중에는 5초 간격으로 폴링하며 새로고침 후에도 진행 중인 회차를 이어 확인한다.

핸들 자동 매칭 대상은 같은 프로젝트 지원서의 댄서로 한정한다.
서버는 `dancers.social_links->>'instagram'`과 `profiles.instagram_handle`만 읽으며 `v_dancer_contact`는 사용하지 않는다.
동일 핸들 후보가 2명 이상이면 자동 연결하지 않고 후보를 표시한다.
연결을 저장할 때는 §3.1의 프로젝트·댄서 일치 검사를 다시 수행한다.

정규화는 `src/lib/instagram/handle.ts`의 `normalizeInstagramHandle`을 사용한다.
기존 `rate-check/pricing.ts`의 함수를 이 모듈로 옮기고 기존 경로에서 re-export하며, 보드 읽기와 캠페인도 공유한다.
같은 모듈의 `parseReelUrl`은 Instagram `/reel/`, `/p/`, `/reels/` 경로와 쿼리·트레일링 슬래시를 허용한다.
URL에서는 shortcode를 추출하고 핸들과 달리 shortcode의 대소문자를 보존한다.

**탭 B. 추이**

- 회차 표에 라벨·측정 시각·상태·대상 및 확인 수·재생·좋아요·댓글·공유 커버리지·팔로워 수집 여부를 표시한다.
  UUID·실행 ID는 화면에 노출하지 않는다.
- 회차를 선택하면 해당 snapshot을 유지한 채 게시물 탭으로 이동한다.
- 동일집합 비교는 양쪽 모두 `fetch_status='found'`이고 `plays IS NOT NULL`인 게시물의 교집합만 사용한다.
- 기준 재생 합이 0이면 증가율은 「—」이며, 계산 가능한 증가율이 5% 미만이면 LG 종료 권고 문구를 표시한다.
- 재생 구간 히스토그램, 상위 1·5·10 비중, 팔로워 구간별 표를 제공한다.
- 계정별 실현율과 중앙값을 표시하고 「n/m 계정 기준」을 병기한다.

공급가·재생당 비용·정산 연동 정보와 비용 카드는 슈퍼관리자에게만 서버에서 포함한다.
비슈퍼관리자의 응답·props에는 비용 필드 자체가 없으며, 화면에서 숨기는 방식으로 처리하지 않는다.
슈퍼관리자는 `project_client_deals.expected_supply_amount` 또는 수동 입력값 기준의 재생당·게시물당·확인 상호작용당 비용을 보고 「정산 확정 전 잠정」 배지를 확인한다.
수집 원장의 예상·실제 비용을 화면에 제공하는 경우에도 슈퍼관리자 응답에만 포함한다.

**탭 C. 보고서**

- 제목·코드·발행 여부·고정 스냅샷·발행 시각·만료·활성을 목록으로 표시한다.
- 「미리보기(현재 데이터)」는 프로젝트 권한을 확인한 운영 도구 안에서 현재 데이터로 계산한다.
- 「발행본」은 `/results/<code>`의 동결본으로 구분한다.
- 「발행」 또는 「재발행」을 눌러야 공개 내용이 갱신된다.
- 편집 설정 저장만으로는 발행하지 않는다.
- 공유 링크 복사와 활성·만료 설정을 제공한다.
- 링크 메일 발송은 이번 범위 밖이다.

### 4.2 클라이언트 — `/results/[code]`

로그인 없이 동결본을 읽으며 `robots noindex`를 설정한다.
`/cast/[code]`처럼 루트 세그먼트에 두어 `PublicShell`을 적용하지 않는다.
`/report`는 기존 출연료 신고 페이지로 유지한다.
루트 레이아웃의 GA·Vercel Analytics는 그대로 적용된다.
`SitePopup.tsx`의 `EXCLUDED_PREFIXES`에 `/results`를 추가한다.
GA 마스킹은 `/cast`와 동일하게 적용하지 않는다(2026-08-14 대표 지시: `/submit/<token>`만 마스킹).

발행 시 다음 공개 내용을 동결한다.

1. 제목·클라이언트 라벨·재생 측정 회차와 시각·deetz 로고.
2. 게시물 수·참여 계정 수·재생·댓글·공유·공개 확인율과 각 커버리지.
3. 선택적 팔로워 합계와 별도 팔로워 기준 회차·시각·계정 커버리지.
4. 발행 시 선택한 추이 표·SVG 막대·동일집합 성장률.
5. 선택적 재생 분포·상위 비중·팔로워 구간별 표.
6. 상위 게시물과 선택적 전체 게시물 표.
7. 프로젝트 공통 규칙으로 계산한 음원·태그·멘션 준수, 유료 파트너십 라벨, 공개 URL 확인율.
8. 선택적 계정별 예측 대비 실현율과 계산 대상 계정 수.
9. 재생 정의·좋아요 미확인·도달 및 저장 비공개·측정 시각 의존에 관한 고지와 문의 푸터.

썸네일은 Instagram CDN 만료·핫링크 문제 때문에 넣지 않는다.
`showDisplayNames=false`이면 핸들만 표시한다.
켜져도 관리자가 검토한 `display_name`만 노출하며 `dancers.korean_name`이나 프로필 실명으로 자동 대체하지 않는다.

공개 DTO에는 금액·단가·정산·지원서·연락처·운영 메모·raw·Apify run ID 및 비용 필드가 존재하지 않는다.
예측치는 `showForecast=true`일 때만 공개 DTO에 포함한다.

### 4.3 `campaign_reports.settings`

설정은 서버에서 허용 필드만 정규화한다.
음원·필수 태그·필수 멘션은 보고서 설정이 아니라 프로젝트 공통 규칙으로 관리한다.

```ts
type ReportSettings = {
  showFollowers?: boolean;       // 기본 true
  showDisplayNames?: boolean;    // 기본 false, 검토된 display_name만
  showTopPosts?: number;         // 기본 10, 0이면 숨김
  showAllPosts?: boolean;        // 기본 false
  showDistribution?: boolean;    // 기본 true
  showFollowerTiers?: boolean;   // 기본 true
  showCompliance?: boolean;      // 기본 true, 미설정 기준 항목은 숨김
  showForecast?: boolean;        // 기본 false, 계정별 실현율
  noticeText?: string | null;    // 한계 고지 문구
  brandLabel?: string | null;    // 헤더 표시명
};
```

공개 비용 설정 `showCost`는 삭제하며, 기존 제안의 `audioId`·`requiredTags`도 허용 필드에 포함하지 않는다.
편집 설정을 바꾸어도 현재 발행본은 재발행 전까지 유지한다.

## 5. 스냅샷 수집 — 최소 비동기 흐름

### 5.1 공통 클라이언트와 비용

캠페인에는 동기 `run-sync-get-dataset-items`를 사용하지 않는다.
새 `src/lib/campaign/apify.ts`에 비동기 REST 클라이언트 `startRun`, `getRun`, `readDataset`를 둔다.
기존 `src/lib/rate-check/apify.ts`의 동기 `run()`은 변경하지 않는다.
Actor 실행의 `timeout` 파라미터는 600초다.

예상 비용은 공유 미수집 시 `게시물 수 × 0.0025`달러, 공유 수집 시 `게시물 수 × 0.0083`달러(총단가, LG T+10 실측 90개 0.7277달러 근거)이며, 팔로워 수집 시 `고유 계정 × 0.0026`달러를 더한다.
`maxTotalChargeUsd`는 예상치의 1.5배(최소 0.2달러)로 넘겨 실측 편차를 흡수하되 합계 3달러를 넘지 않는다.
프로필 미수집 시 프로필 예상치는 0이며, 소유·공동작업 핸들은 중복 제거하여 계산한다.
릴스와 프로필 run의 `maxTotalChargeUsd` 합계는 회당 3달러 이하여야 한다.
상한은 슈퍼관리자에게도 동일하게 적용한다.

### 5.2 시작 — `startSnapshotAction(projectId, { label, includeShares, collectFollowers })`

1. `requireStaff()` 통과 후 `profile.is_admin || await canManageProject(projectId)`를 확인한다.
2. 서버에서 대상 게시물·고유 계정·옵션별 예상 비용을 계산한다.
3. `campaign_reserve_snapshot(p_project uuid, p_est_usd numeric, p_by uuid, ...)`를 호출해 KST 프로젝트 일 3회·전체 일 10회·회당 3달러·게시물 300개를 원자적으로 검사하고 `reserved` 행을 만든다.
4. Apify `POST /v2/acts/apify~instagram-reel-scraper/runs`로 릴스 run을 시작하고, 응답을 받는 즉시 `reels_run_id`·`reels_dataset_id`를 snapshot에 저장한 뒤 `status='running'`으로 갱신한다.
5. 프로필 run은 이 단계에서 시작하지 않는다. URL만 등록된 게시물은 소유 핸들이 릴스 결과에서 나오므로 프로필 수집은 §5.3의 2단계에서 시작한다(`collectFollowers`는 snapshot의 `followers_collected` 예약값으로만 기록).
6. 화면에는 snapshot ID와 실행 상태를 반환하고 장시간 HTTP 연결을 유지하지 않는다.
7. 고아 실행 방지: run 시작 응답 뒤 DB 저장이 실패하면 즉시 `POST /v2/actor-runs/{id}/abort`를 시도하고 `status='failed'`·`error`를 기록한다. abort까지 실패해도 Actor `timeout=600`과 `maxTotalChargeUsd`로 비용은 상한 안에 갇힌다. `reserved|running`이 30분 넘게 진행되지 않으면 운영 화면에 「실패 처리」 버튼을 보여 수동으로 `failed`로 닫을 수 있게 한다(닫을 때 run이 살아 있으면 abort 시도).

릴스 입력은 `{ username: [post_url…], resultsLimit: 1, includeSharesCount, includeTranscript: false, includeDownloadedVideo: false }`다.
공식 입력 스키마가 `username` 배열의 직접 릴스 URL을 허용하며, 직접 URL에서는 `resultsLimit`을 무시한다.
대상 수는 서버와 예약 RPC의 300개 검사로 제한한다.
릴스 `maxTotalChargeUsd`에는 예약한 릴스 예상치를 전달한다.

프로필 입력은 `{ usernames: [owner + collab 고유 핸들] }`이며 `maxTotalChargeUsd`에는 프로필 예상치를 전달한다.
시작 중 오류가 발생하면 예약 원장을 지우지 않고 확보한 실행 메타와 함께 `status='failed'`·`error`를 기록한다.

### 5.3 폴링 — `pollSnapshotAction(snapshotId)`

액션은 snapshot의 소속 프로젝트를 확인하고 시작 액션과 같은 권한 검사를 수행한다.
각 run은 `GET /v2/actor-runs/{id}`로 조회한다.

- 릴스 run이 아직 진행 중이면 `running` 상태를 반환한다.
- **1단계 완료**: 릴스 run이 `SUCCEEDED`이고 `followers_collected=true`인데 `profiles_run_id`가 아직 null이면, 릴스 dataset을 읽어 소유·공동작업 핸들(수집값 ∪ 등록값, 정규화·중복 제거)을 만들고 그 시점에 `POST …instagram-profile-scraper/runs`를 시작해 `profiles_run_id`·`profiles_dataset_id`를 저장한다. 상태는 `running` 유지. 이 시작은 snapshot 행의 조건부 UPDATE(`profiles_run_id IS NULL`)로 한 번만 일어나게 한다.
- **2단계 완료**: 릴스 run과 (있다면) 프로필 run이 모두 `SUCCEEDED`이면 두 dataset을 읽어 확정 RPC를 한 번 호출한다.
- 프로필 수집을 선택하지 않은 회차는 릴스 run의 성공만 확인하고 빈 계정 입력으로 확정한다.
- 필요한 run 중 하나라도 `FAILED|ABORTED|TIMED-OUT`이면 snapshot에 `status='failed'`와 `error`를 기록한다. 릴스가 성공했는데 프로필만 실패한 경우는 릴스 결과만으로 `partial` 확정하고 `followers_snapshot_id`는 직전 수집 회차를 참조한다.
- 단순 상태 조회 통신 오류는 Actor의 실패 상태로 단정하지 않는다.
- 이미 `succeeded|partial|failed`인 회차는 저장된 결과를 반환하며 외부 실행을 다시 시작하지 않는다.

화면은 5초 간격으로 폴링한다.
새로고침 후에도 해당 프로젝트의 `running` 스냅샷을 읽어 폴링을 재개한다.

### 5.4 확정·후처리

서버는 예약 대상과 응답을 shortcode로 매칭하고 게시물별 `fetch_status`를 결정한다.
설명 없는 누락·파싱 오류는 `error`로 처리해 `not_found`와 구분한다.
`campaign_finalize_snapshot(p_snapshot uuid, p_items jsonb, p_accounts jsonb)`로 지표·계정 측정·집계·실제 비용을 한 트랜잭션에서 확정한다.
반복 폴링과 동시 확정 요청은 같은 snapshot에 대한 멱등 처리로 수렴한다.

KPI·발행·`unverified` 판정은 확정된 `succeeded|partial` 회차의 `found|not_found`만 사용한다.
`error`·`failed`는 제외하고, 해당 게시물의 유효 확정 관측이 2회 연속 `not_found`이면 `unverified`로 전이한다.
첫 확정 관측의 `ownerUsername`으로 소유 계정을 확인하고, 비어 있는 `posted_at`을 `timestamp`로 채운다.

릴스 좋아요가 -1이고 같은 회차에서 프로필을 수집했다면 `latestPosts`의 동일 shortcode에서 0 이상 `likesCount`를 찾아 `likes_source='profile'`로 보정한다.
복구하지 못하면 null·「미확인」을 유지한다.

팔로워를 수집한 확정 회차는 `followers_snapshot_id`를 자기 자신으로 설정한다.
미수집 회차는 가장 최근 팔로워 수집 확정 회차를 참조하며, 재생과 팔로워의 기준 시각·커버리지를 분리해 표시한다.

자동 라벨 `T+N`은 `taken_at`과 `campaign_rules.first_posted_at`의 일수 차이로 계산한다.
기준일이 없으면 `S1, S2…`를 사용하고, 기준일의 수동 오버라이드는 자동 수집으로 덮어쓰지 않는다.

## 6. 백필 (LG 데이터 이관)

`scripts/backfill-campaign-lg.mts`를 커밋하고 원본 경로·프로젝트 ID를 인자로 받는다.
기본 실행은 dry-run이며, 명시적인 실행 옵션으로만 적재한다.
원본 파일과 자격 증명은 커밋하지 않는다.

입력은 `lg-reels-metrics-timeseries-20260903.json`과 `lg-reels-profiles-snapshot-20260903.raw.json`이다.
게시물은 `source='backfill'`, 성과 회차는 T+1·T+3·T+10의 3개로 이관하고 `taken_at`은 각 원본 run의 `finishedAt`을 사용한다.
계정 측정은 T+10에만 저장하고, T+1·T+3의 `followers_snapshot_id`는 null로 남겨 「팔로워 미측정」으로 표시한다.
T+10의 `followers_snapshot_id`는 자기 자신이다.

다음 원본 run ID는 원본 메타와 대조해 해당 측정의 `apify_run_id`에 보존한다.

- `PnhEV6gl0Yut9LriW`
- `dNwWpkKqzfztPiqoN`
- `MxOgVDkITGk36EkDC`
- `TpMlFK7zLfAhOQajZ`

릴스 원본 ID는 snapshot의 `apify_run_id`, 프로필 원본 ID는 T+10 계정 측정의 `apify_run_id`와 snapshot의 `profiles_run_id`에 저장한다.
파일 나열 순서만으로 회차와 run ID의 대응을 추정하지 않는다.
재실행 시 프로젝트와 원본 run ID를 확인하고, 기존 회차 및 `(snapshot_id, handle)` 계정 키로 중복 적재를 방지한다.
백필도 프로젝트 무결성과 멱등 확정 규칙을 따른다.

적재 결과는 `/tools/campaigns/06232945-3563-431e-b399-edc6c7b21dc5`에서 확인한다.
LG 백필을 집계·동일집합 비교·팔로워 시점·공개 발행 검증의 기준 데이터로 사용한다.

## 7. 권한 요약

기본 게이트는 `requireStaff()`이며, 프로젝트별 페이지와 모든 액션은 `profile.is_admin || await canManageProject(projectId)`를 추가 검사한다.
ID만 전달받는 폴링·상세·보고서 액션도 먼저 대상의 소속 프로젝트를 확인한다.
목록의 공동관리자 범위는 서비스롤로 읽은 본인의 `project_managers.project_id`로 강제한다.
RPC의 서비스롤 실행 권한은 페이지·액션의 프로젝트 검사를 대체하지 않는다.

| 동작 | 운영 관리자 | 슈퍼관리자 | 프로젝트 공동관리자 | 비로그인 |
|---|---|---|---|---|
| `/tools/campaigns` 목록 | 전체 | 전체 | 본인 `project_managers` 프로젝트만 | 불가 |
| 프로젝트 상세·게시물 추가 및 편집·규칙 편집 | 전체 | 전체 | 담당 프로젝트만 | 불가 |
| 스냅샷 시작·폴링 | 상한 내 | 동일 상한 내 | 담당 프로젝트·상한 내 | 불가 |
| 비용 지표·비용 카드·정산 정보 | 필드 없음 | 서버 응답에 포함 | 필드 없음 | 필드 없음 |
| 보고서 생성·설정·현재 데이터 미리보기·발행 | 전체 | 전체 | 담당 프로젝트만 | 불가 |
| `/results/<code>` 발행본 | 유효 코드로 열람 | 유효 코드로 열람 | 유효 코드로 열람 | 발행·활성·만료 검증 후 동결본 열람 |

김주성(Baw)은 운영 관리자이며, 이원영은 프로젝트 공동관리자다(2026-09-07 운영 DB 확인).
공동관리자 접근은 이번 범위에 포함하고 전역 `/admin` 레이아웃의 접근 권한은 넓히지 않는다.
공개 보고서에는 접근자 등급과 관계없이 비용 필드가 없다.

## 8. 파일 계획

- `db/migrations/20260907_001_campaign_results.sql`: 핵심 5개 테이블과 `campaign_rules`, 복합 FK·UNIQUE·RLS·권한, 예약·확정 RPC 2개.
- `src/lib/instagram/handle.ts`: 공용 `normalizeInstagramHandle`과 `parseReelUrl`.
- `src/lib/rate-check/pricing.ts`: 정규화 구현을 공용 모듈로 옮기고 기존 export 유지.
- `src/lib/casting/board-data.ts`: 공용 정규화 함수로 보드 핸들 읽기.
- `src/lib/campaign/types.ts`: 실행 상태·관측값·공개 DTO·운영 응답 타입.
- `src/lib/campaign/metrics.ts`: 집계·분포·동일집합·계정 실현율·준수 판정 순수 함수.
- `src/lib/campaign/apify.ts`: 비동기 `startRun`, `getRun`, `readDataset` 클라이언트.
- `src/lib/campaign/repository.ts`: 프로젝트 범위가 강제된 서비스롤 쿼리와 RPC 호출.
- `src/lib/campaign/report-data.ts`: 현재 데이터 미리보기·발행 DTO 계산·동결본 로더.
- `src/lib/campaign/report-settings.ts`: 공개 설정 허용 필드 정규화.
- `src/app/actions/campaign-results.ts`: 게시물·CSV·규칙·보고서 CRUD, `startSnapshotAction`, `pollSnapshotAction`, 발행 액션.
- `src/app/(app)/tools/campaigns/page.tsx`, `src/app/(app)/tools/campaigns/[projectId]/page.tsx`: 목록·상세·searchParams 탭.
- `src/components/admin/campaign/{PostsTable.tsx, PostSheet.tsx, AddPostsDialog.tsx, SnapshotDialog.tsx, TrendPanel.tsx, ReportsPanel.tsx}`: 운영 도구 UI와 5초 폴링.
- `src/app/results/[code]/page.tsx`, `src/components/campaign/ResultsReport.tsx`: 동결본 전용 서버 렌더·인라인 SVG.
- `src/components/admin/AdminNav.tsx`: 「콘텐츠」 그룹의 `/tools/campaigns` 링크.
- `src/app/(app)/admin/projects/page.tsx`: 「성과」 링크.
- `src/components/layout/SitePopup.tsx`: `/results` 제외.
- `scripts/backfill-campaign-lg.mts`: 인자·기본 dry-run·원본 run ID 기반 멱등 백필.
- 테스트: 공용 핸들·URL 파서, 지표·설정, 권한·RPC·폴링·발행 동결·백필 검증.

기존 `src/lib/rate-check/apify.ts`의 동기 수집과 `GoogleAnalytics.tsx`의 마스킹 정책은 변경하지 않는다.
위 목록은 후속 구현 계획이며, 이번 문서 수정 턴에서는 이 설계 문서만 수정한다.

## 9. 범위 밖 (Phase 2 후보)

- 참여자가 게시물 링크를 직접 제출하는 토큰 페이지(`/submit/[token]`의 게시물 링크 단계).
- 인사이트 캡처 자기보고 업로드·도달 추정.
- 회당 게시물 300개를 초과하는 대용량 수집.
- PDF 내보내기·보고서 링크 메일 발송·해시태그 확산 측정.

## 10. 검증 계획

다음 검증은 후속 코드·마이그레이션 구현에서 수행한다.

- `npx tsc --noEmit`, 변경 파일 eslint, `npx tsx --test src/lib/campaign/*.test.ts src/lib/instagram/*.test.ts`, `npx next build`를 실행한다.
- 핸들의 대소문자·@·프로필 URL과 `/reel/`, `/p/`, `/reels/`·쿼리·트레일링 슬래시·shortcode 대소문자 보존을 확인한다.
- 기존 rate-check의 정규화 re-export와 보드 읽기가 같은 결과를 내는지 확인한다.
- URL 단독 등록, 미확정 소유 계정, 첫 확정 관측, 입력 핸들 불일치 경고, 중복 핸들 후보의 자동 연결 금지를 확인한다.
- 교차 프로젝트 snapshot·post·report·followers 연결은 복합 FK로 거부하고, 지원서의 프로젝트·댄서 불일치는 서버에서 거부하는지 확인한다.
- 공동관리자 목록 필터와 타 프로젝트 상세·수정·시작·폴링·발행 거부를 직접 액션 호출에서도 확인한다.
- 동시 예약에서도 KST 프로젝트 3회·전체 10회·회당 3달러·게시물 300개 상한이 유지되는지 확인한다.
- 릴스·프로필 Actor의 비용 상한 합계와 `timeout=600` 전달을 확인한다.
- 비동기 시작·5초 폴링·새로고침 복구·Actor 실패 상태·프로필 미수집·확정 재호출 멱등성을 확인한다.
- `error`·`failed`가 KPI·발행·unverified 판정에서 제외되고, 유효 확정 관측 2회 연속 `not_found`만 상태를 바꾸는지 확인한다.
- 동일집합은 양쪽 found·plays not null만 포함하며, 0분모 성장률은 「—」인지 확인한다.
- 실현율은 계정별 재생 합을 사용하고 expected null·0 제외와 「n/m 계정 기준」을 확인한다.
- 규칙 변경에 따라 현재 데이터 미리보기의 준수 결과는 바뀌되 기존 발행본은 유지되는지 확인한다.
- 비슈퍼관리자 응답·props와 공개 DTO·동결본에 비용 필드가 없는지 검사한다.
- 발행 후 새 스냅샷·게시물 상태·표시 이름·공동작업·규칙·설정 변경에도 동결본이 같고, 재발행 때만 갱신되는지 확인한다.
- 표시 이름 기본 OFF와 ON 양쪽에서 실명 자동 대체가 없는지 확인한다.
- 비로그인 `/results/<code>`는 유효 발행본만 200이며, 미발행·비활성·만료는 404인지 확인한다.
- `/tools/campaigns` 비로그인 접근은 로그인으로 이동하고, 공동관리자는 `/admin` 권한 없이 도구를 사용할 수 있는지 확인한다.
- `/results`에 사이트 팝업이 없고, GA는 기존 정책대로 코드 경로를 마스킹하지 않는지 확인한다.
- 백필은 기본 dry-run에서 쓰기가 없으며 같은 원본으로 재실행해도 회차·지표·계정 행이 중복되지 않는지 확인한다.
- LG T+10 기준 재생 219,808 / 확인 88/90 / 댓글 690 / 공유 553(79개) / 좋아요 확인 62개 7,045 / 팔로워 합 261,711(100계정)을 대조한다.
- LG 계정 측정은 T+10에만 있고 T+1·T+3은 팔로워 미측정이며, 현재 데이터와 발행본 모두 재생·팔로워 기준을 별도 표시하는지 확인한다.
- 브라우저 로그인 검증은 대표가 직접 수행한다.
