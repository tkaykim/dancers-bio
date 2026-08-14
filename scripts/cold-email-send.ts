/**
 * deetz 콜드메일 발송 스크립트 v1
 *
 * intent: dancersbio 월 4건 수주 달성 엔진
 * 산출물 패키지: C:/Users/tkay/Desktop/deliverables/dancersbio-cold-email/
 *
 * ─────────────────────────────────────────────────────────────
 * 사용법
 * ─────────────────────────────────────────────────────────────
 *   pnpm dlx tsx scripts/cold-email-send.ts \
 *     --target-file "C:/Users/tkay/Desktop/deliverables/dancersbio-cold-email/targets-v1.md" \
 *     --template   "C:/Users/tkay/Desktop/deliverables/dancersbio-cold-email/template-v1.md" \
 *     --campaign   "coldmail-2026-07-w1" \
 *     --limit      20 \
 *     --dry-run
 *
 *   pnpm dlx tsx scripts/cold-email-send.ts ... --live   # 실제 발송(승인 후)
 *
 * ─────────────────────────────────────────────────────────────
 * 안전 원칙
 * ─────────────────────────────────────────────────────────────
 * - 기본 모드는 dry-run. --live 명시가 없으면 절대 발송 X.
 * - DB 쓰기 없음(v1). 발송 결과는 로컬 파일(./out/send-log-<campaign>.jsonl)만 적재.
 * - 연속 에러 5회 → 즉시 중단(스팸 방지).
 * - 발송 간 3~5초 랜덤 딜레이(Gmail rate limit 회피).
 * - 재실행 안전: 로그 파일에 이미 성공(status=sent) 처리된 email은 skip.
 *
 * 참조 로직(재사용 아님, 동일 스펙 재구현):
 * - `src/lib/gmail.ts` : nodemailer/Gmail SMTP (server-only 마커라 스크립트 직접 import 불가)
 * - `src/app/api/track/open/route.ts` : HMAC-SHA256(base64url) 오픈 픽셀 서명
 */

import { createHmac, randomInt } from "node:crypto";
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer, { type Transporter } from "nodemailer";

// ─────────────────────────────────────────────────────────────
// env 로드 (.env.local — 단순 파서, dotenv 의존 회피)
// ─────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

function loadEnvFile(file: string): void {
  const p = resolve(file);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(resolve(REPO_ROOT, ".env.local"));
loadEnvFile(resolve(REPO_ROOT, ".env"));

// ─────────────────────────────────────────────────────────────
// CLI 파싱
// ─────────────────────────────────────────────────────────────
interface CliArgs {
  dryRun: boolean;
  live: boolean;
  targetFile: string;
  templateFile: string;
  campaign: string;
  limit: number;
  outDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) return "";
    return v;
  };
  const flag = (name: string): boolean => argv.includes(name);

  const dryRun = flag("--dry-run");
  const live = flag("--live");
  const targetFile = arg("--target-file") ??
    "C:/Users/tkay/Desktop/deliverables/dancersbio-cold-email/targets-v1.md";
  const templateFile = arg("--template") ??
    "C:/Users/tkay/Desktop/deliverables/dancersbio-cold-email/template-v1.md";
  const campaign = arg("--campaign") || "coldmail-2026-07-w1";
  const limitRaw = arg("--limit");
  const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10)) : 25;
  const outDir = arg("--out-dir") || resolve(__dirname, "out");

  if (!dryRun && !live) {
    // 안전 기본: 아무 모드도 안 주면 dry-run.
    return { dryRun: true, live: false, targetFile, templateFile, campaign, limit, outDir };
  }
  if (dryRun && live) {
    throw new Error("--dry-run 과 --live 는 동시에 지정할 수 없습니다.");
  }
  return { dryRun, live, targetFile, templateFile, campaign, limit, outDir };
}

// ─────────────────────────────────────────────────────────────
// 타겟 파싱 (targets-v1.md 의 마크다운 표를 읽음)
// 표 헤더: | # | 회사 | 카테고리 | 후보 이메일 ... | 예상 담당 | 우선순위 | 비고 |
// ─────────────────────────────────────────────────────────────
export interface Target {
  index: number;
  company: string;
  category: string;
  email: string;
  role: string;
  priority: string;
  note: string;
  sectionCategory: string; // 섹션 헤더(예: "A. 엔터테인먼트·레이블")
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function isValidEmail(s: string): boolean {
  if (!s) return false;
  const m = s.match(EMAIL_RE);
  if (!m) return false;
  const email = m[0];
  if (email.endsWith(".con")) return false; // 흔한 오타
  return true;
}

function extractFirstEmail(cell: string): string | null {
  const m = cell.match(EMAIL_RE);
  return m ? m[0] : null;
}

function stripMarkdownFormatting(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function parseTargets(mdPath: string): Target[] {
  const text = readFileSync(mdPath, "utf8");
  const lines = text.split(/\r?\n/);
  const out: Target[] = [];
  let currentSection = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 섹션 헤더 감지: "### A. 엔터테인먼트·레이블 ..."
    const sec = line.match(/^###\s+(.+?)\s*$/);
    if (sec) {
      currentSection = stripMarkdownFormatting(sec[1]).replace(/—.*$/, "").trim();
      continue;
    }
    // 표 데이터 라인 감지: "| 1 | JYP ... | ... | contact@jype.com | ..."
    if (!line.startsWith("|")) continue;
    // 헤더/구분선 제거
    if (/^\|\s*#\s*\|/.test(line)) continue;
    if (/^\|[\s\-:|]+\|$/.test(line)) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => stripMarkdownFormatting(c.trim()));
    if (cells.length < 4) continue;

    const idxStr = cells[0];
    if (!/^\d+$/.test(idxStr)) continue;

    const company = cells[1] ?? "";
    const category = cells[2] ?? "";
    const emailCell = cells[3] ?? "";
    const role = cells[4] ?? "";
    const priority = cells[5] ?? "";
    const note = cells[6] ?? "";

    const email = extractFirstEmail(emailCell);
    if (!email || !isValidEmail(email)) continue; // 이메일 없는 행은 skip (예: 폼만 있는 경우)

    out.push({
      index: parseInt(idxStr, 10),
      company,
      category,
      email,
      role,
      priority,
      note,
      sectionCategory: currentSection,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 템플릿 파싱 (template-v1.md 에서 HTML/TEXT/제목/프리헤더 추출)
// ─────────────────────────────────────────────────────────────
export interface Template {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

function extractCodeBlock(md: string, langHint: "html" | ""): string | null {
  const re = new RegExp("```" + langHint + "\\s*\\n([\\s\\S]*?)\\n```", "m");
  const m = md.match(re);
  return m ? m[1] : null;
}

function parseTemplate(mdPath: string): Template {
  const md = readFileSync(mdPath, "utf8");

  // 제목 A안 우선(A/B 후보 중 A안 사용). 필요 시 --subject-b 등으로 확장 여지.
  const subjMatch = md.match(/\*\*A안[^*]*\*\*:\s*`([^`]+)`/);
  const subject = subjMatch ? subjMatch[1] : "[deetz] 댄서 캐스팅 공고 안내";

  const preMatch = md.match(/## 프리헤더[^\n]*\n\n`([^`]+)`/);
  const preheader = preMatch ? preMatch[1] : "";

  const html = extractCodeBlock(md, "html");
  if (!html) throw new Error("template-v1.md 에서 HTML 코드블록을 찾지 못했습니다.");

  // 텍스트 블록: ``` (no lang) — 여러 개 있을 수 있어 '안녕하세요. deetz' 포함 것을 선택
  const textBlocks = md.match(/```\s*\n([\s\S]*?)\n```/g) ?? [];
  let text = "";
  for (const block of textBlocks) {
    const inner = block.replace(/^```\s*\n/, "").replace(/\n```$/, "");
    if (inner.includes("안녕하세요. deetz")) {
      text = inner;
      break;
    }
  }
  if (!text) {
    // 폴백: HTML 태그 제거 대충
    text = html.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  return { subject, preheader, html, text };
}

// ─────────────────────────────────────────────────────────────
// 오픈 픽셀 서명·URL 생성 (route.ts 스펙과 동일)
// s = base64url(HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, `${campaign}|${email}`))
// URL: https://deetz.kr/api/track/open?c=<campaign>&e=<b64url(email)>&s=<sig>
// ─────────────────────────────────────────────────────────────
const SITE_ORIGIN = "https://deetz.kr";

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function signOpen(campaign: string, email: string, key: string): string {
  return createHmac("sha256", key).update(`${campaign}|${email}`).digest("base64url");
}

function buildOpenPixelUrl(campaign: string, email: string, key: string): string {
  const c = encodeURIComponent(campaign);
  const e = b64urlEncode(email);
  const s = signOpen(campaign, email, key);
  return `${SITE_ORIGIN}/api/track/open?c=${c}&e=${e}&s=${s}`;
}

function injectOpenPixel(html: string, pixelUrl: string): string {
  const marker = "<!-- OPEN_PIXEL_HERE -->";
  const img = `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0;outline:none;" />`;
  if (html.includes(marker)) return html.replace(marker, img);
  // 폴백: </body> 직전 삽입
  if (html.includes("</body>")) return html.replace("</body>", `${img}</body>`);
  return html + img;
}

// ─────────────────────────────────────────────────────────────
// nodemailer transporter (src/lib/gmail.ts 와 동일 스펙)
// ─────────────────────────────────────────────────────────────
const DEETZ_FROM_NAME = "deetz 에이전시 & 매거진";

let _transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return _transporter;
}

async function sendGmailEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "transporter_unavailable(GMAIL_USER/GMAIL_APP_PASSWORD)" };
  const fromEmail = process.env.GMAIL_USER!;
  try {
    const info = await t.sendMail({
      from: `"${DEETZ_FROM_NAME}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo ?? fromEmail,
      headers: {
        "X-deetz-Campaign": "cold-email",
      },
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    return { ok: false, error: msg.slice(0, 500) };
  }
}

// ─────────────────────────────────────────────────────────────
// 로그 파일 유틸
// ─────────────────────────────────────────────────────────────
interface SendLogRow {
  ts: string;
  campaign: string;
  email: string;
  company: string;
  category: string;
  status: "sent" | "failed" | "skipped" | "dry-run";
  error?: string;
  messageId?: string;
}

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function loadAlreadySent(logPath: string): Set<string> {
  const set = new Set<string>();
  if (!existsSync(logPath)) return set;
  for (const line of readFileSync(logPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as SendLogRow;
      if (row.status === "sent") set.add(row.email.toLowerCase());
    } catch {
      // ignore malformed
    }
  }
  return set;
}

function appendLog(logPath: string, row: SendLogRow): void {
  appendFileSync(logPath, JSON.stringify(row) + "\n", "utf8");
}

// ─────────────────────────────────────────────────────────────
// 딜레이
// ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelayMs(minSec = 3, maxSec = 5): number {
  return randomInt(minSec * 1000, maxSec * 1000 + 1);
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("─────────────────────────────────────────────");
  console.log("  deetz 콜드메일 발송 스크립트 v1");
  console.log("─────────────────────────────────────────────");
  console.log(`  mode        : ${args.live ? "🔴 LIVE (실제 발송)" : "🟡 DRY-RUN"}`);
  console.log(`  campaign    : ${args.campaign}`);
  console.log(`  target-file : ${args.targetFile}`);
  console.log(`  template    : ${args.templateFile}`);
  console.log(`  limit       : ${args.limit}`);
  console.log(`  out-dir     : ${args.outDir}`);
  console.log("");

  // env 사전 검증
  const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!srKey) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다. 오픈 픽셀 서명 불가.");
    process.exit(2);
  }
  if (args.live) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error("❌ GMAIL_USER / GMAIL_APP_PASSWORD 미설정. --live 불가.");
      process.exit(2);
    }
  }

  // 로드
  const targets = parseTargets(args.targetFile);
  const template = parseTemplate(args.templateFile);
  console.log(`📋 파싱된 타겟: ${targets.length}건`);
  console.log(`📄 템플릿 제목: ${template.subject}`);
  console.log("");

  // out 디렉터리
  ensureDir(args.outDir);
  const logPath = resolve(args.outDir, `send-log-${args.campaign}.jsonl`);
  const alreadySent = loadAlreadySent(logPath);
  if (alreadySent.size > 0) {
    console.log(`ℹ️  기존 로그에 sent=${alreadySent.size}건 존재 — 재실행 시 skip.`);
  }

  const summaryPath = resolve(args.outDir, `dry-run-summary-${args.campaign}.md`);

  // 발송/렌더 루프
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let dryRunCount = 0;
  let consecutiveErrors = 0;
  const summaryRows: string[] = [];

  const list = targets.slice(0, args.limit);
  for (const t of list) {
    const emailLower = t.email.toLowerCase();
    if (alreadySent.has(emailLower)) {
      skipped++;
      console.log(`  ⏭  skip  ${t.company} <${t.email}> (이미 sent)`);
      continue;
    }

    // 렌더
    const pixel = buildOpenPixelUrl(args.campaign, t.email, srKey);
    const html = injectOpenPixel(template.html, pixel);
    const text = template.text;
    const subject = template.subject;

    if (args.dryRun) {
      const renderPath = resolve(
        args.outDir,
        `render-${args.campaign}-${sanitize(t.email)}.html`,
      );
      writeFileSync(renderPath, html, "utf8");
      dryRunCount++;
      summaryRows.push(
        `| ${t.index} | ${t.company} | ${t.email} | ${t.sectionCategory} | ${t.priority} | ${renderPath.replace(args.outDir + "\\", "").replace(args.outDir + "/", "")} |`,
      );
      appendLog(logPath, {
        ts: new Date().toISOString(),
        campaign: args.campaign,
        email: t.email,
        company: t.company,
        category: t.sectionCategory,
        status: "dry-run",
      });
      console.log(`  🟡 dry  ${t.company} <${t.email}> → ${renderPath}`);
      continue;
    }

    // LIVE 발송
    const res = await sendGmailEmail({
      to: t.email,
      subject,
      text,
      html,
      replyTo: process.env.GMAIL_USER,
    });
    if (res.ok) {
      sent++;
      consecutiveErrors = 0;
      appendLog(logPath, {
        ts: new Date().toISOString(),
        campaign: args.campaign,
        email: t.email,
        company: t.company,
        category: t.sectionCategory,
        status: "sent",
        messageId: res.messageId,
      });
      console.log(`  ✅ sent  ${t.company} <${t.email}> (id=${res.messageId ?? "?"})`);
    } else {
      failed++;
      consecutiveErrors++;
      appendLog(logPath, {
        ts: new Date().toISOString(),
        campaign: args.campaign,
        email: t.email,
        company: t.company,
        category: t.sectionCategory,
        status: "failed",
        error: res.error,
      });
      console.log(`  ❌ fail  ${t.company} <${t.email}> — ${res.error}`);
      if (consecutiveErrors >= 5) {
        console.error("");
        console.error("🛑 연속 실패 5회 — 자동 중단(스팸/차단 방지).");
        break;
      }
    }

    // 딜레이 (마지막 아이템 후엔 생략)
    const isLast = list.indexOf(t) === list.length - 1;
    if (!isLast) {
      const ms = randomDelayMs(3, 5);
      await sleep(ms);
    }
  }

  // dry-run 요약 파일
  if (args.dryRun && summaryRows.length > 0) {
    const md = [
      `# deetz 콜드메일 DRY-RUN 요약`,
      ``,
      `- campaign: \`${args.campaign}\``,
      `- 생성 시각: ${new Date().toISOString()}`,
      `- 렌더된 타겟: ${dryRunCount}건 / 파싱 총 ${targets.length}건 (limit=${args.limit})`,
      `- template: ${args.templateFile}`,
      `- targets:  ${args.targetFile}`,
      ``,
      `## 렌더 결과`,
      ``,
      `| # | 회사 | 이메일 | 섹션 | 우선순위 | 파일 |`,
      `|---|---|---|---|---|---|`,
      ...summaryRows,
      ``,
      `## 다음 단계`,
      ``,
      `1. 위 파일을 브라우저에서 열어 실제 렌더링 확인`,
      `2. 오픈 픽셀 URL 육안 확인 (\`https://deetz.kr/api/track/open?c=...\`)`,
      `3. 이상 없으면 대표님 L3 승인 → \`--live\` 재실행`,
      ``,
    ].join("\n");
    writeFileSync(summaryPath, md, "utf8");
  }

  console.log("");
  console.log("─────────────────────────────────────────────");
  console.log("  요약 리포트");
  console.log("─────────────────────────────────────────────");
  console.log(`  총 타겟(파싱)     : ${targets.length}`);
  console.log(`  대상(limit 적용)  : ${list.length}`);
  console.log(`  ✅ sent           : ${sent}`);
  console.log(`  🟡 dry-run 렌더  : ${dryRunCount}`);
  console.log(`  ⏭  skip(중복)    : ${skipped}`);
  console.log(`  ❌ failed         : ${failed}`);
  console.log(`  로그 파일         : ${logPath}`);
  if (args.dryRun && summaryRows.length > 0) {
    console.log(`  요약 md           : ${summaryPath}`);
  }
  console.log("");

  if (args.live && failed > 0) {
    process.exitCode = 1;
  }
}

function sanitize(email: string): string {
  return email.replace(/[^a-zA-Z0-9]+/g, "_");
}

main().catch((err) => {
  console.error("치명적 오류:", err);
  process.exit(1);
});
