import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

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

function assertSafeText(label, value) {
  if (value.includes("\uFFFD")) {
    throw new Error(`${label} contains Unicode replacement characters`);
  }
  if (/\?{3,}/.test(value)) {
    throw new Error(`${label} contains suspicious question-mark mojibake`);
  }
}

function assertHtmlAttachment(file) {
  if (!fs.existsSync(file)) throw new Error(`attachment missing: ${file}`);

  const stat = fs.statSync(file);
  if (stat.size < 10_000) {
    throw new Error(`attachment is unexpectedly small: ${stat.size} bytes`);
  }

  const html = fs.readFileSync(file, "utf8");
  assertSafeText("attachment", html);
  if (!/[\uAC00-\uD7A3]/.test(html)) {
    throw new Error("attachment does not appear to contain Korean text");
  }
  if (!html.includes("<title>6/18 남자아이돌 오디션 운영 브리프</title>")) {
    throw new Error("attachment title does not match expected NDOL ops brief");
  }
}

loadEnv(".env.local");

const send = process.argv.includes("--send");
const dryRun = !send || process.argv.includes("--dry-run");
const confirm = process.argv.find((arg) => arg.startsWith("--confirm="))?.split("=")[1];

if (send && confirm !== "SEND_NDOL_OPS_BRIEF_ATTACHMENT") {
  throw new Error("actual send requires --confirm=SEND_NDOL_OPS_BRIEF_ATTACHMENT");
}

const recipients = [
  "baw940903@naver.com",
  "hs@astcompany.co.kr",
  "odh@grigoent.co.kr",
  "tommy062166@gmail.com",
];

const attachmentPath = path.resolve("docs/ndol-20260618-ops-brief.html");
assertHtmlAttachment(attachmentPath);

const subject = "[deetz] 6/18 남자아이돌 오디션 운영 브리프 공유";
const text = [
  "안녕하세요.",
  "",
  "6/18 남자아이돌 오디션 운영 브리프 HTML 파일을 첨부드립니다.",
  "내일 확정 참석 가능 명단, 일정확인 연락 필요 명단, 추가 섭외 인원, 후속 액션을 함께 정리해두었습니다.",
  "",
  "첨부 파일을 브라우저에서 열어 확인 부탁드립니다.",
  "",
  "감사합니다.",
  "deetz",
].join("\n");

const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:26px 30px 16px;border-bottom:1px solid #ececef;">
          <div style="font-size:25px;font-weight:800;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div>
        </td></tr>
        <tr><td style="padding:28px 30px 30px;">
          <div style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">운영 브리프 공유</div>
          <h1 style="font-size:20px;line-height:1.45;margin:18px 0 14px;">6/18 남자아이돌 오디션 운영 브리프</h1>
          <p style="font-size:15px;line-height:1.8;margin:0 0 12px;">안녕하세요.</p>
          <p style="font-size:15px;line-height:1.8;margin:0 0 12px;">6/18 남자아이돌 오디션 운영 브리프 HTML 파일을 첨부드립니다.</p>
          <p style="font-size:15px;line-height:1.8;margin:0 0 12px;">내일 확정 참석 가능 명단, 일정확인 연락 필요 명단, 추가 섭외 인원, 후속 액션을 함께 정리해두었습니다.</p>
          <p style="font-size:15px;line-height:1.8;margin:18px 0 0;">첨부 파일을 브라우저에서 열어 확인 부탁드립니다.</p>
          <p style="font-size:15px;line-height:1.8;margin:18px 0 0;">감사합니다.<br>deetz</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

assertSafeText("subject", subject);
assertSafeText("text", text);
assertSafeText("html", html);

if (dryRun) {
  console.log("dry-run: no email sent");
  console.log(`to: ${recipients.join(", ")}`);
  console.log(`subject: ${subject}`);
  console.log(`attachment: ${attachmentPath}`);
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
  to: recipients.join(", "),
  replyTo: "contact@deetz.kr",
  subject,
  text,
  html,
  attachments: [
    {
      filename: "ndol-20260618-ops-brief.html",
      path: attachmentPath,
      contentType: "text/html; charset=utf-8",
    },
  ],
});

console.log(`sent NDOL ops brief attachment to ${recipients.join(", ")}`);
