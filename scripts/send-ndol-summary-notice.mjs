import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  assertKoreanMailSafe,
  renderDeetzMail,
} from "./lib/deetz-mail-layout.mjs";

function loadEnv(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return;
  for (const line of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

loadEnv(".env.local");

const send = process.argv.includes("--send");
const dryRun = !send || process.argv.includes("--dry-run");
const recipients = [
  "tommy0621@naver.com",
  "baw940903@naver.com",
  "hs@astcompany.co.kr",
];

const subject = "[deetz] 6/18 오디션 안내 메일 발송 완료 공유";

const text = [
  "안녕하세요.",
  "",
  "앞서 공유 메일에서 한글이 깨져 다시 발송드립니다.",
  "6/18(목) 오디션 관련 안내 메일 발송이 완료되어 공유드립니다.",
  "",
  "[A. 현장공지 발송]",
  "대상: 6/18(목) 16:00-21:00 참석 가능이 확인된 지원자",
  "발송 수: 40명",
  "내용: 합정 로이코 15:50 도착, 현장 접수/번호표/3층 진행 공간 이동, 당일 운영 방식, 중도 귀가 가능성, 주차 불가, 6/30 2차 연습 가능여부 확인 안내",
  "",
  "[B. 긴급 가능여부 확인 + 현장안내 발송]",
  "대상: 매니저 검토로 accepted 처리되었으나 6/18(목) 16:00-21:00 가능 여부가 아직 미제출인 지원자",
  "발송 수: 34명",
  "내용: 6/18 현장 안내 전체 포함 + 개인 링크에서 16:00-21:00 참석 가능 여부 긴급 제출 요청",
  "",
  "총 발송: 74명",
  "발송 실패: 0건",
  "",
  "감사합니다.",
  "deetz",
].join("\n");

const bodyHtml = `
<p style="margin:0 0 12px;">안녕하세요.</p>
<p style="margin:0 0 12px;"><b>앞서 공유 메일에서 한글이 깨져 다시 발송드립니다.</b></p>
<p style="margin:0 0 18px;">6/18(목) 오디션 관련 안내 메일 발송이 완료되어 공유드립니다.</p>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
<p style="font-weight:800;margin:0 0 10px;color:#111;">A. 현장공지 발송</p>
<ul style="margin:0;padding-left:18px;">
<li>대상: 6/18(목) 16:00-21:00 참석 가능이 확인된 지원자</li>
<li>발송 수: <b>40명</b></li>
<li>내용: 합정 로이코 15:50 도착, 현장 접수/번호표/3층 진행 공간 이동, 당일 운영 방식, 중도 귀가 가능성, 주차 불가, 6/30 2차 연습 가능여부 확인 안내</li>
</ul>
</div>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
<p style="font-weight:800;margin:0 0 10px;color:#111;">B. 긴급 가능여부 확인 + 현장안내 발송</p>
<ul style="margin:0;padding-left:18px;">
<li>대상: 매니저 검토로 accepted 처리되었으나 6/18(목) 16:00-21:00 가능 여부가 아직 미제출인 지원자</li>
<li>발송 수: <b>34명</b></li>
<li>내용: 6/18 현장 안내 전체 포함 + 개인 링크에서 16:00-21:00 참석 가능 여부 긴급 제출 요청</li>
</ul>
</div>

<p style="margin:18px 0 0;"><b>총 발송: 74명</b><br>발송 실패: 0건</p>
<p style="margin:18px 0 0;">감사합니다.<br>deetz</p>`;

const html = renderDeetzMail({
  eyebrow: "발송 완료 공유",
  title: "6/18 오디션 안내 메일 발송 완료",
  bodyHtml,
});

assertKoreanMailSafe({ subject, text, html });

if (dryRun) {
  console.log("dry-run: no email sent");
  console.log(`subject: ${subject}`);
  console.log(`recipients: ${recipients.join(", ")}`);
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: requiredEnv("GMAIL_USER"),
    pass: requiredEnv("GMAIL_APP_PASSWORD"),
  },
});

await transporter.sendMail({
  from: `"${process.env.GMAIL_FROM_NAME || "deetz"}" <${requiredEnv("GMAIL_USER")}>`,
  to: recipients.join(","),
  replyTo: "contact@deetz.kr",
  subject,
  text,
  html,
});

console.log(`sent corrected summary to ${recipients.join(", ")}`);
