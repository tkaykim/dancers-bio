# 캠페인 성과 UI 재작업

2026-09-07 재작업 지시서를 기준으로 관리자 셸과 운영 화면, 공개 보고서를 정비했다.
운영 배포, DB 접근, `db:types`, Git 커밋은 실행하지 않았다.

## 화면 변경

| 화면 | 변경 내용 |
| --- | --- |
| 운영 셸 | `(ops)`에서 `requireStaff()`를 적용한다. 관리자는 기존 AdminNav 전체를, 공동관리자는 도구 2개만 본다. URL은 유지한다. |
| 캠페인 목록 | 헤더 우측 추가 다이얼로그, 프로젝트 검색 셀렉트, 검색·정렬·필터, 확정 회차·재생·확인율·발행 보고서 수를 제공한다. |
| 상세 공통 | 헤더 액션 3개, 회차 선택, 팔로워 기준, KPI 6개, 밑줄 탭을 배치한다. UUID와 실행 ID는 표시하지 않는다. |
| 게시물 | 이름을 계정 아래에, 게시일을 shortcode 아래에 배치한다. 한글 상태 배지, 준수 아이콘, 숫자 우측 정렬, 고정 헤더, 50건 페이지네이션과 Drawer 편집을 제공한다. |
| 가져오기 | URL·CSV 모드를 분리한다. 기존 파서를 재사용해 행별 중복·입력 오류를 표시하고 서버 미리보기 검증 후 저장한다. |
| 스냅샷 | 다이얼로그에서 옵션을 입력하고 실행 단계·경과 시간·완료 요약을 확인한다. 기존 5초 폴링과 30분 이상 실패 처리를 유지한다. |
| 추이 | 회차 표, 두 회차 동일집합 비교, SVG 분포, 상위 비중, 팔로워 구간, 계정별 실현율을 카드로 구분한다. |
| 보고서 | 생성·설정 다이얼로그, 보고서 카드, 링크 복사, 활성·만료 설정, 발행·재발행을 제공한다. 현재 데이터 미리보기는 운영 도구 내 다이얼로그로 유지한다. |
| 공개 보고서 | 기준 HTML의 문서 구성을 따라 최대 900px 본문, 헤더 밑줄, KPI 밴드, 얇은 표 괘선, 각주 형태를 적용한다. 모바일 표는 내부에서 가로 스크롤한다. |
| 페이 산정 | 페이지 파일을 `(ops)`로 옮겼으며 화면과 수집 코드는 그대로다. |

## 변경 파일

- `src/app/(ops)/layout.tsx`
- `src/app/(ops)/tools/campaigns/page.tsx`
- `src/app/(ops)/tools/campaigns/[projectId]/page.tsx`
- `src/app/(ops)/tools/campaigns/loading.tsx`
- `src/app/(ops)/tools/campaigns/error.tsx`
- `src/app/(ops)/tools/rate-check/page.tsx`
- `src/components/admin/AdminNav.tsx`
- `src/components/admin/campaign/AddCampaign.tsx`
- `src/components/admin/campaign/AddPostsDialog.tsx`
- `src/components/admin/campaign/Controls.tsx`
- `src/components/admin/campaign/PostSheet.tsx`
- `src/components/admin/campaign/PostsTable.tsx`
- `src/components/admin/campaign/ReportsPanel.tsx`
- `src/components/admin/campaign/RulesPanel.tsx`
- `src/components/admin/campaign/SnapshotDialog.tsx`
- `src/components/admin/campaign/SnapshotBar.tsx`
- `src/components/admin/campaign/TrendPanel.tsx`
- `src/components/campaign/ResultsReport.tsx`
- `src/components/ui/badge.tsx`
- `src/lib/campaign/server.test.ts`
- `src/lib/rate-check/server.test.mjs`
- `docs/design-campaign-report.md`
- `docs/campaign-results-implementation.md`
- 이 인계 문서와 `docs/qa/campaign-ui/` 검증 기록·샘플 화면.

기존 `(app)/tools/campaigns` 페이지 2개와 `(app)/tools/rate-check/page.tsx`는 위 `(ops)` 경로로 이동했다.

## 데이터·권한 경계

서버 액션, 집계·수집·권한 라이브러리, 마이그레이션은 변경하지 않았다.
`src/lib` 아래 테스트 2개만 라우트 이동 경로와 UI 컴포넌트 모의 객체에 맞춰 수정했으며 기존 검증 조건을 유지했다.

상세 페이지는 프로젝트 권한 확인 후 기존 `candidatesFor()`로 stage_name을 보완한다.
표시 이름이 없으면 연결된 지원자 또는 핸들이 유일하게 일치하는 지원자의 활동명을 사용하고, 그다음 기존 `campaign_account_metrics.full_name`을 사용한다.
공개 보고서는 기존대로 검토된 `display_name`만 사용하며 이 보완 이름을 공개 데이터에 넣지 않는다.

수집 비용은 기존 설계의 슈퍼관리자 전용 경계를 유지한다.
예상 비용과 완료 비용은 슈퍼관리자에게만 표시한다.
일반 관리자·공동관리자에게 비용 원장 props를 전달하지 않는다.

## 검증

PowerShell 실행 정책 때문에 동일 명령의 `npx.cmd`·`npm.cmd` 진입점을 사용했다.

| 검증 명령 | 결과 |
| --- | --- |
| `npx tsc --noEmit` | 통과 |
| 변경 TS/TSX/MJS 파일 ESLint | 통과 |
| `npx tsx --test src/lib/campaign/*.test.ts src/lib/instagram/*.test.ts` | 최초 실행 30개 통과, 최종 재실행은 아래 로컬 실행기로 30개 통과 |
| `npm run test:rate-check` | 25개 통과 |
| `npx next build` | 통과 |
| `git diff --check` | 통과 |

빌드 출력에 `/tools/campaigns`, `/tools/campaigns/[projectId]`, `/tools/rate-check`가 포함됐다.

최종 `npx tsx` 재실행은 npm 레지스트리와 전역 캐시 접근 제한(EACCES) 때문에 시작하지 못했다.
추가 패키지를 설치하지 않고 기존 TypeScript로 동일 테스트 소스를 실행해 30개 통과를 재확인했다.
대체 명령은 `node --import ./docs/qa/campaign-ui/test-runtime.mjs --test src/lib/campaign/*.test.ts src/lib/instagram/*.test.ts`이며, 실행 로그는 `docs/qa/campaign-ui/campaign-tests-local.log`에 있다.

브라우저 검증은 실제 페이지·레이아웃·컴포넌트를 번들링하되 인증·저장소·서버 액션을 샘플 모듈로 치환했다.
외부 네트워크를 차단하고 Playwright로 1440px·390px 화면을 확인했다.
50건/40건 페이지, KPI 6개, 내부 식별자 비노출, URL 가져오기 중복·오류, Drawer 원본 접기, 태그 칩 저장, 회차 비교, 보고서 생성·미리보기, 빈 상태, 공동관리자 내비게이션, 슈퍼관리자 비용, 수집 진행·완료를 확인했다.
모바일 본문 가로 넘침과 브라우저 오류는 0건이었다.

- [게시물 데스크톱](qa/campaign-ui/desktop-posts.png)
- [게시물 모바일](qa/campaign-ui/mobile-posts.png)
- [추이](qa/campaign-ui/desktop-trend.png)
- [공개 보고서](qa/campaign-ui/public-report.png)
- [가져오기 오류 표시](qa/campaign-ui/import-dialog.png)
- [수집 진행](qa/campaign-ui/snapshot-progress.png)

## 남은 확인

실제 로그인 세션, 운영 DB, Apify 실행, 공개 보고서 발행은 검증 범위에서 제외했다.
스크린샷의 수치·계정은 UI 검증용 샘플이며 운영 실적이 아니다.
Next.js의 기존 다중 lockfile 루트 추정 경고와 middleware 명칭 폐기 예고, rate-check 테스트의 기존 모듈 형식 경고는 남아 있다.

저장소의 설계·구현 문서는 새 경로로 갱신했다.
워크스페이스 외부의 전역 CAPABILITY_MAP·프로젝트 메모리는 현재 쓰기 허용 범위 밖이므로 갱신하지 않았다.
전역 정본에 반영할 내용은 `(ops)` 셸 이동, 본 문서 경로, 로컬 검증 통과 및 운영 미배포 상태다.
