// deetz UI 한국어 문자열 인벤토리 — 범위별 파일·한국어 구간(run) 수를 센다.
// 사용: node scripts/i18n-inventory.mjs [출력디렉터리]  (기본 = 현재 디렉터리, i18n-inventory.csv 생성)
// 계획 산정·진행률 측정용이며 정확한 키 수는 아니다. 범위 정의는 docs/design-i18n-ui.md §2.2·부록 A 와 같이 유지한다.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scopes = {
  "P1 shell/landing": ["src/app/page.tsx", "src/app/layout.tsx", "src/app/global-error.tsx", "src/components/layout", "src/components/brand", "src/components/ui"],
  "P1 public: feed/dancers/profile": ["src/app/(public)/feed", "src/app/(public)/dancers", "src/app/(public)/d", "src/app/(public)/t", "src/app/(public)/u", "src/app/(public)/layout.tsx", "src/components/directory", "src/components/dancers", "src/components/profile", "src/components/share"],
  "P1 auth/onboarding": ["src/app/(auth)", "src/components/auth", "src/app/onboarding", "src/app/welcome", "src/app/reset-password"],
  "P1 project detail/apply": ["src/app/projects/[id]/page.tsx", "src/components/project/ProjectCard.tsx", "src/components/project/ProjectListView.tsx", "src/components/project/ApplyForm.tsx", "src/components/project/ShareButton.tsx", "src/components/project/ProjectMediaGallery.tsx", "src/components/project/RespondProposalButtons.tsx"],
  "P1 me/applications/proposals": ["src/app/(app)/me/page.tsx", "src/app/(app)/me/notifications", "src/app/(app)/me/portfolio", "src/app/(app)/me/teams", "src/app/(app)/me/password", "src/app/(app)/me/rates", "src/app/(app)/me/workshops", "src/app/(app)/me/visa", "src/app/(app)/applications", "src/app/(app)/proposals", "src/app/(app)/verify-instagram", "src/components/me", "src/components/portfolio", "src/components/team", "src/components/notification", "src/components/verification", "src/components/feedback"],
  "P1 lib labels/validation/dates": ["src/lib/validation", "src/lib/phone.ts", "src/lib/format-when.ts", "src/lib/utils/deadline.ts", "src/lib/application-stage.ts", "src/lib/settlement.ts"],
  "P1 actions (user-facing)": ["src/app/actions/applications.ts", "src/app/actions/projects.ts", "src/app/actions/profile.ts", "src/app/actions/portfolio.ts", "src/app/actions/portfolio-ai.ts", "src/app/actions/auth.ts", "src/app/actions/proposals.ts", "src/app/actions/teams.ts", "src/app/actions/claim.ts", "src/app/actions/careers.ts", "src/app/actions/rate-cards.ts", "src/app/actions/verification.ts", "src/app/actions/notification-prefs.ts", "src/app/actions/bug-report.ts"],
  "P2 posting/settlement/mails": ["src/app/projects/new", "src/app/projects/[id]/edit", "src/components/project/ProjectForm.tsx", "src/components/project/ProjectEditForm.tsx", "src/components/project/SelectionRoundsField.tsx", "src/components/project/ProjectAttachmentsField.tsx", "src/app/(app)/me/settlements", "src/components/settlement/MySettlements.tsx", "src/components/settlement/BalanceWithdraw.tsx", "src/components/settlement/BankPicker.tsx", "src/app/w", "src/app/settle", "src/lib/notify/approval-welcome-mail.ts", "src/lib/notify/project-match.ts", "src/lib/notify/announcement-mail.ts", "src/lib/notify/schedule-mail.ts", "src/lib/notify/challenge-guideline-mail.ts", "src/lib/notify/index.ts", "src/lib/push.ts", "src/app/(public)/guide", "src/app/(public)/report", "src/app/(public)/unsubscribe", "src/app/projects/[id]/applicants"],
  "Already multilingual (unify only)": ["src/lib/i18n", "src/components/visa", "src/components/village", "src/components/workshops", "src/components/program", "src/app/(public)/apply", "src/app/submit", "src/app/visa", "src/app/workshops", "src/app/village", "src/app/program"],
  "OUT: admin/ops/legal/etc": ["src/app/(app)/admin", "src/components/admin", "src/app/ops", "src/app/cast", "src/app/ndol", "src/app/(public)/terms", "src/app/(public)/privacy", "src/app/(public)/data-deletion", "src/app/h", "src/app/s", "src/app/sr", "src/app/fr", "src/app/fit", "src/app/sz", "src/app/n", "src/app/c", "src/app/review", "src/app/channels", "src/components/casting", "src/lib/guides.ts", "src/components/settlement/OwnerSettlementConsole.tsx", "src/components/settlement/AddSettlementDancer.tsx", "src/components/settlement/SettlementCollectForm.tsx", "src/components/settlement/DancerDocuments.tsx"],
};

// 한글로 시작하는 연속 구간 = 문자열 1개로 근사. 따옴표·태그·중괄호·줄바꿈에서 끊는다.
const KO = new RegExp("[가-힣][^\"'`<>{}\\n]*", "g");
const TOAST = new RegExp("toast\\.[a-z]+\\([^)]*[가-힣]", "g");

function walk(p) {
  const st = fs.statSync(p);
  if (st.isFile()) return /\.(tsx?|mjs)$/.test(p) ? [p] : [];
  return fs.readdirSync(p).flatMap((n) => walk(path.join(p, n)));
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const rows = [];
const summary = {};
for (const [scope, entries] of Object.entries(scopes)) {
  let files = 0, runs = 0, koFiles = 0, toasts = 0;
  for (const e of entries) {
    const abs = path.join(root, e);
    if (!fs.existsSync(abs)) { rows.push([scope, e, "MISSING", 0]); continue; }
    for (const f of walk(abs)) {
      const code = stripComments(fs.readFileSync(f, "utf8"));
      const m = code.match(KO) || [];
      const t = (code.match(TOAST) || []).length;
      files++; runs += m.length; toasts += t; if (m.length) koFiles++;
      rows.push([scope, path.relative(root, f).replace(/\\/g, "/"), m.length, t]);
    }
  }
  summary[scope] = { files, koFiles, runs, toasts };
}
const sp = process.argv[2] ?? process.cwd();
fs.writeFileSync(path.join(sp, "i18n-inventory.csv"), "scope,file,ko_runs,toasts\n" + rows.map((r) => r.join(",")).join("\n"), "utf8");
let tot = 0;
for (const [s, v] of Object.entries(summary)) {
  console.log(`${s.padEnd(38)} files=${String(v.files).padStart(3)} koFiles=${String(v.koFiles).padStart(3)} koRuns=${String(v.runs).padStart(5)} toasts=${v.toasts}`);
  if (!s.startsWith("OUT") && !s.startsWith("Already")) tot += v.runs;
}
console.log("IN-SCOPE (P1+P2) korean runs total:", tot);
console.log("MISSING entries:", rows.filter((r) => r[2] === "MISSING").map((r) => r[1]).join(", ") || "none");
