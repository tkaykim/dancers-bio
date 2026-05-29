# mydancersbio — Claude 작업 가이드

> 한국 댄스 신을 위한 구인구직 + 포트폴리오 모바일 웹앱.
> 자세한 product/플랜은 `~/.claude/plans/stateful-gathering-quiche.md` 참조.

## 스택

- **Next.js 16 (App Router)** + React 19 + TypeScript strict
- **Supabase**: Postgres, Auth(이메일+비밀번호), Storage, RLS
- **Tailwind v4** + shadcn/ui (base-ui)
- **Gmail SMTP** (nodemailer, 운영 알림·버그 리포트 메일 — `src/lib/gmail.ts`)
- **zod** (검증) + **react-hook-form** (폼)

> ⚠️ Next.js 16은 conventions가 바뀐 버전입니다. 의심되면 `node_modules/next/dist/docs/` 또는 공식 문서 확인. `AGENTS.md` 안내문도 참조.

## Supabase 프로젝트

- Project: `dancersbio` (id: wvfmqiajdvbsevlhlgtl)
- URL: https://wvfmqiajdvbsevlhlgtl.supabase.co
- 보존 자산: `public.dancers` (72명 K-Pop/Street 댄서), `public.careers` (871건)
- 백업: `archive.*_20260507` (dancers, careers, users, storage_objects)
- MCP 도구 prefix: `mcp__supabase-dancersbio__*`

## 빌드/테스트 명령

- `npm run dev` — 개발 서버 (http://localhost:3000)
- `npm run build` — 프로덕션 빌드
- `npm run start` — 프로덕션 서버
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — eslint
- `npm run db:types` — Supabase 타입 재생성 → `src/lib/supabase/types.ts`

## 디렉토리 규칙

```
src/app/               — App Router 라우트, 서버 컴포넌트 기본
src/app/(marketing)/   — 공개 (랜딩, 약관)
src/app/(auth)/        — 가입/로그인
src/app/(app)/         — 인증 필요 (layout-level guard)
src/app/u/[id]/        — 공개 프로필 페이지
src/app/actions/       — "use server" 서버 액션 (도메인별 파일)

src/lib/supabase/      — server.ts, browser.ts, admin.ts, types.ts
src/lib/auth/          — guard.ts (requireUser, requireCreator)
src/lib/validation/    — zod 스키마
src/lib/notify/        — 알림+이메일 헬퍼
src/lib/storage/       — 업로드 헬퍼
src/lib/utils.ts       — cn() 등

src/components/ui/     — shadcn 프리미티브
src/components/{project,portfolio,notification}/
                       — 도메인 UI

db/migrations/         — *.sql (Supabase MCP로 적용)
db/seeds/              — 시드
```

## 코딩 규칙

- mutations은 **서버 액션** (`"use server"`). `/api/*` 라우트는 외부 webhook 외 금지.
- 클라이언트 컴포넌트는 **상호작용 필요한 곳만** (`"use client"` 최소화).
- 모든 form input은 zod parse 후 DB 진입.
- 서버 액션 반환: `{ ok: true, data } | { ok: false, error: string }` (throw 금지).
- 컬럼: snake_case, 타입: `db:types` 자동생성 사용. 컴포넌트: PascalCase.
- `lib/supabase/admin.ts` (service role)는 `import "server-only"`. 절대 클라이언트 번들로 새지 않게.
- 한글 UI 라벨 OK. 코드 식별자는 영어 snake_case/camelCase.

## DB / RLS 원칙

- 모든 테이블 RLS enable, default deny
- 핵심 enum: `project_visibility`, `project_status`, `application_source`, `application_status`, `notification_type`
- `applications` 단일 테이블이 apply + direct_proposal 통합 (`source` 컬럼)
- private 프로젝트 가시성 = `applications` 행 존재 여부로 결정
- `can_create_project` 체크는 server action 진입 시점에도 한 번 더 (방어적)
- 마이그레이션 적용 후 항상 `npm run db:types` 실행

## 모델 선정 (Sub-agent / 작업별)

| 작업 | 모델 |
|---|---|
| 마이그레이션 SQL / RLS / 보안 리뷰 / 복잡 디버깅 | Opus 4.7 |
| 일반 서버 액션 / UI 컴포넌트 / zod / 문서 | Sonnet 4.6 |
| 보일러플레이트 / 시드 / 환경설정 / empty state | Haiku 4.5 |

## 알려진 함정 (작업하면서 추가)

- `dancers` 테이블의 `profile_id`가 NULL인 행 67개 존재 (admin 큐레이션, claim 대기). 코드에서 NULL 처리 필요.
- `careers.details->>'link'`가 영상 URL (별도 컬럼 아님). YouTube/Vimeo URL을 oEmbed로 처리.
- `storage.objects`의 path 첫 폴더가 `dancer_id` (대부분) 또는 `user_id` (일부). RLS 정책이 둘 다 허용.
