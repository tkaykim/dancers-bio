# SPEC-DELTA: deetz UI 다국어 전환 (ko · en · ja)

> 정본 설계 = `docs/design-i18n-ui.md` rev3 (Codex gpt-6-astra 4라운드 교차검증 합의, 2026-09-11).
> 이 문서는 overnight build 실행용 요약이며, 규칙·근거·예외는 정본을 따른다.

## 변경 요청
- 외국인 이용자 여정(랜딩 → 가입 → 온보딩 → 피드 → 공고 상세 → 지원 → 내 지원 → 프로필 관리 → 알림 설정)의 고정 문구를 영어·일본어로 전환할 수 있게 한다.
- 언어 전환 UI를 두고, 한 번 고른 언어가 모든 화면과 기존 다국어 기능에서 유지되며 로그인 계정에도 저장된다.

## 추가·수정 기능 (정본 §8 단계)
- S0 기반: `src/lib/i18n/*` 확장(요청 언어·UI 언어 분리, Provider, `serverT`/`useT`, interpolate 보강), 미들웨어 최상단 언어 결정 + rewrite 헤더 전달 + 쿠키, 루트·홈 `generateMetadata`, 랜딩 캐시, 폰트 변수화, `LanguageSwitcher` + `setLocaleAction`(DB → 쿠키 → redirect), M1~M3 마이그레이션, 가입·로그인 연동, 플래그 `UI_LOCALES`, ESLint 한국어 누출 규칙, 사전 단위 테스트, Playwright 언어 스윕 스캐폴드.
- S1 셸·랜딩·인증·온보딩·공용 UI / S2 공개·공고 / S3 내 계정·포트폴리오 / S4 라벨·검증·액션·날짜·전화·기존 다국어 기능 통합 / S5 번역 검수·스윕·수정.

## 영향 받는 파일 (예상)
- 정본 부록 A.1 전체(145파일)와 `src/middleware.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `eslint.config.mjs`, `package.json`(Playwright devDependency·스크립트).

## 회귀 위험
- 루트 레이아웃 동적화로 정적 11페이지가 요청 시 렌더가 된다(랜딩 조회 캐시로 완화).
- 미들웨어 헤더·쿠키 추가가 Supabase 세션 갱신 흐름과 dancers.bio rewrite에 영향을 줄 수 있다(조기 반환 앞 결정, rewrite 헤더 전달로 완화).
- enum 라벨 상수 이동으로 관리자 화면 import가 깨질 수 있다(`ko` 값 동명 재수출로 완화).
- 서버 액션 오류 문구 변경으로 관리자 화면 toast 문구가 바뀔 수 있다(`/admin`·`/ops` 강제 ko).
- `handle_new_user()` 변경이 가입을 막을 수 있다(기존 열·`on conflict` 유지, 프리뷰에서 신규 가입 E2E로 확인).

## 완료 조건
- `npm run typecheck` 0 오류, `npm run lint` 0 오류(i18n 규칙 포함), `next build` 성공, 단위 테스트 전부 통과.
- Playwright 언어 스윕(en·ja × 320·390·1280px)에서 범위 안 화면의 한국어 누출 0건, 기대 언어 일치, 콘솔·`pageerror` 0건.
- 기존 기능 회귀 없음: 한국어 이용자 화면 무변경(`UI_LOCALES=ko`에서 동일), 비자·워크숍·빌리지·간편접수·영상제출의 기존 언어 동작 유지, 로그인·가입·지원 흐름 정상.
- PR 생성 + Vercel Preview URL. main 머지는 대표 결정.

## 자동 결정 (정본 §10 결정 항목의 기본값)
- `ja` 금액 표기 = `1,000,000ウォン`.
- `UI_LOCALES` 미설정 시 기본값: production = `ko`, 그 외(preview·로컬) = `ko,en,ja`(프리뷰 QA를 위해 정본 §3.1의 "기본 ko"를 환경별로 나눔).
- 영어·일본어 번역 초안은 Claude가 작성하고 검수자 지정 전까지 초안 상태로 표기한다.

## 결과 (2026-09-11 overnight build)
- 브랜치 `feat/i18n-ui`(origin/main `1ae09a9` 기준), 커밋 9개. 상세 기록은 정본 §11 "구현 기록".
- 완료 조건 대비: typecheck 0 · test:i18n 7/7 · lint 신규 오류 0(기존 49건은 main과 동일) · `next build` 성공 · 로컬 스윕 32/32 · 스크린샷 넘침 0.
- 운영 DB 마이그레이션 M1~M3 적용 완료(additive), M4는 머지 후.
- 프리뷰 스윕과 PR 링크는 PR 본문 참조. main 머지·`UI_LOCALES` 개방(R1·R2)은 대표 결정.
- 2026-09-11 대표 결정: 문제 없으면 머지·운영 배포, `ja` 금액 표기 채택, 영어·일본어는 준비되면 동시 개방. → PR #236 머지·운영 배포(R0) 완료, M4 적용, 번역 검수(Claude 4에이전트 + Codex 일본어 교차검수) 후 `UI_LOCALES=ko,en,ja`로 개방.
