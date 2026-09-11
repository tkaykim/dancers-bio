import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 한국어 누출 방지 규칙의 적용 범위 (docs/design-i18n-ui.md §5.3 · 부록 A.1).
// 관리자·운영·클라이언트 보드·법률 페이지는 범위 밖이라 제외한다.
// 네임스페이스 이전이 끝난 디렉터리부터 severity 를 error 로 올린다.
const I18N_SCOPE = [
  "src/app/page.tsx",
  "src/app/layout.tsx",
  "src/app/global-error.tsx",
  "src/components/layout/**/*.{ts,tsx}",
  "src/components/brand/**/*.{ts,tsx}",
  "src/components/ui/**/*.{ts,tsx}",
  "src/app/(public)/feed/**/*.{ts,tsx}",
  "src/app/(public)/dancers/**/*.{ts,tsx}",
  "src/app/(public)/d/**/*.{ts,tsx}",
  "src/app/(public)/t/**/*.{ts,tsx}",
  "src/app/(public)/u/**/*.{ts,tsx}",
  "src/app/(public)/layout.tsx",
  "src/components/directory/**/*.{ts,tsx}",
  "src/components/dancers/**/*.{ts,tsx}",
  "src/components/profile/**/*.{ts,tsx}",
  "src/components/share/**/*.{ts,tsx}",
  "src/app/(auth)/**/*.{ts,tsx}",
  "src/components/auth/**/*.{ts,tsx}",
  "src/app/onboarding/**/*.{ts,tsx}",
  "src/app/welcome/**/*.{ts,tsx}",
  "src/app/reset-password/**/*.{ts,tsx}",
  "src/app/projects/[id]/page.tsx",
  "src/components/project/{ProjectCard,ProjectListView,ApplyForm,ShareButton,ProjectMediaGallery,RespondProposalButtons}.tsx",
  "src/app/(app)/me/page.tsx",
  "src/app/(app)/me/{notifications,portfolio,teams,password,rates,workshops,visa}/**/*.{ts,tsx}",
  "src/app/(app)/applications/**/*.{ts,tsx}",
  "src/app/(app)/proposals/**/*.{ts,tsx}",
  "src/app/(app)/verify-instagram/**/*.{ts,tsx}",
  "src/components/me/**/*.{ts,tsx}",
  "src/components/portfolio/**/*.{ts,tsx}",
  "src/components/team/**/*.{ts,tsx}",
  "src/components/notification/**/*.{ts,tsx}",
  "src/components/verification/**/*.{ts,tsx}",
  "src/components/feedback/**/*.{ts,tsx}",
  "src/lib/validation/**/*.ts",
  "src/lib/phone.ts",
  "src/lib/format-when.ts",
  "src/lib/utils/deadline.ts",
  "src/lib/application-stage.ts",
  "src/app/actions/{applications,projects,profile,portfolio,portfolio-ai,auth,proposals,teams,claim,careers,rate-cards,verification,notification-prefs,bug-report}.ts",
];

// 사전 파일과 테스트는 한국어가 정상이다.
const I18N_SCOPE_IGNORES = [
  "src/lib/i18n/**",
  "**/*.test.{ts,tsx,mjs,mts}",
];

const HANGUL = "[\\uac00-\\ud7a3]";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "e2e/**",
    "playwright.config.ts",
  ]),
  {
    files: I18N_SCOPE,
    ignores: I18N_SCOPE_IGNORES,
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: `JSXText[value=/${HANGUL}/]`,
          message: "i18n: 화면 문구는 사전 키로 옮기세요 (docs/design-i18n-ui.md §3.4). 의도한 한국어면 eslint-disable-next-line 과 사유를 남기세요.",
        },
        {
          selector: `Literal[value=/${HANGUL}/]`,
          message: "i18n: 한국어 문자열 리터럴은 사전 키로 옮기세요 (docs/design-i18n-ui.md §3.4).",
        },
        {
          selector: `TemplateElement[value.cooked=/${HANGUL}/]`,
          message: "i18n: 한국어 템플릿 문자열은 사전 키와 자리표시자로 옮기세요 (docs/design-i18n-ui.md §3.4).",
        },
      ],
    },
  },
]);

export default eslintConfig;
