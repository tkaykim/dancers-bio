import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const RECIPIENTS = ["odh@grigoent.co.kr", "hs@astcompany.co.kr"];
const SELF_PASS_URL = "https://www.deetz.kr/ndol/20260618/pass";
const OPS_TOKEN = process.env.NDOL_OPS_TOKEN ?? "REPLACE_WITH_NDOL_OPS_TOKEN";
const OPS_URL =
  `https://www.deetz.kr/ops/ndol-20260618/${OPS_TOKEN}?mode=onsite`;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function assertMailSafe({ subject, text, html }) {
  const combined = `${subject}\n${text}\n${html}`;
  if (combined.includes("\uFFFD")) {
    throw new Error("mail content contains Unicode replacement characters");
  }
  if (/\?{3,}/.test(combined)) {
    throw new Error("mail content contains suspicious question-mark mojibake");
  }
  if (!/[가-힣]/.test(combined)) {
    throw new Error("mail content contains no Korean text");
  }
}

function buildMail() {
  const subject = "[deetz] NDOL 현장 QR 테스트 방법 안내";
  const text = [
    "안녕하세요, deetz입니다.",
    "",
    "NDOL 현장 QR 기능을 참가자 입장에서 테스트할 수 있도록 테스트 전용 QR을 열어두었습니다.",
    "",
    "[참가자 입장 테스트]",
    `1. 본인 계정으로 deetz에 로그인합니다.`,
    `2. 참가자 QR 페이지에 접속합니다: ${SELF_PASS_URL}`,
    "3. 로그인 계정이 ODH 또는 HS 계정이면 이름/전화번호 입력 없이 TEST QR이 자동으로 표시됩니다.",
    "4. 표시된 QR을 운영진 스캐너에 보여줍니다.",
    "",
    "[운영진 스캔 테스트]",
    `1. 현장 운영판을 엽니다: ${OPS_URL}`,
    "2. QR 체크인 영역에서 스캔 시작을 누릅니다.",
    "3. 참가자 화면의 TEST QR을 스캔합니다.",
    "4. ODH 테스트 또는 HS 테스트와 함께 '테스트 QR 정상 인식' 메시지가 뜨면 성공입니다.",
    "",
    "중요: 이 TEST QR은 실제 출석, 번호표, 참가자 수에는 반영되지 않습니다. 운영 데이터 오염 없이 QR 흐름만 확인하는 용도입니다.",
    "",
    "감사합니다.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:14px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;color:#17140f;">
        <tr>
          <td style="padding:26px 30px 18px;border-bottom:1px solid #ececef;">
            <div style="font-size:25px;font-weight:900;line-height:1;">dee&apos;tz</div>
            <div style="margin-top:8px;font-size:12px;color:#71717a;font-weight:700;">NDOL 현장 QR 테스트</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 30px 8px;">
            <div style="display:inline-block;background:#eef2ff;color:#4338ca;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;">테스트 전용</div>
            <h1 style="margin:16px 0 12px;font-size:21px;line-height:1.45;color:#111;">NDOL 현장 QR 테스트 방법 안내</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.8;color:#3f3f46;">ODH/HS 계정에서 참가자 입장 QR 흐름을 확인할 수 있도록 테스트 전용 QR을 열어두었습니다.</p>

            <div style="border:1px solid #ececef;border-radius:12px;padding:15px 16px;margin:16px 0;">
              <div style="font-size:15px;font-weight:900;margin-bottom:10px;">참가자 입장 테스트</div>
              <ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#3f3f46;">
                <li>본인 계정으로 deetz에 로그인합니다.</li>
                <li><a href="${escapeHtml(SELF_PASS_URL)}" style="color:#4338ca;font-weight:800;">참가자 QR 페이지</a>에 접속합니다.</li>
                <li>로그인 계정이 ODH 또는 HS 계정이면 이름/전화번호 입력 없이 TEST QR이 자동 표시됩니다.</li>
                <li>표시된 QR을 운영진 스캐너에 보여줍니다.</li>
              </ol>
            </div>

            <div style="border:1px solid #ececef;border-radius:12px;padding:15px 16px;margin:16px 0;">
              <div style="font-size:15px;font-weight:900;margin-bottom:10px;">운영진 스캔 테스트</div>
              <ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.8;color:#3f3f46;">
                <li><a href="${escapeHtml(OPS_URL)}" style="color:#4338ca;font-weight:800;">현장 운영판</a>을 엽니다.</li>
                <li>QR 체크인 영역에서 <b>스캔 시작</b>을 누릅니다.</li>
                <li>참가자 화면의 TEST QR을 스캔합니다.</li>
                <li><b>ODH 테스트</b> 또는 <b>HS 테스트</b>와 함께 <b>테스트 QR 정상 인식</b> 메시지가 뜨면 성공입니다.</li>
              </ol>
            </div>

            <div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:12px;padding:13px 15px;margin:16px 0 20px;font-size:13px;line-height:1.7;color:#9a3412;font-weight:800;">
              중요: 이 TEST QR은 실제 출석, 번호표, 참가자 수에는 반영되지 않습니다. 운영 데이터 오염 없이 QR 흐름만 확인하는 용도입니다.
            </div>

            <a href="${escapeHtml(SELF_PASS_URL)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:900;padding:14px 0;border-radius:10px;">참가자 QR 페이지 열기</a>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 30px 26px;border-top:1px solid #ececef;background:#fafafa;">
            <div style="font-size:15px;font-weight:900;color:#111;">dee&apos;tz</div>
            <div style="font-size:12px;color:#71717a;margin-top:6px;line-height:1.7;">deetz.kr · contact@deetz.kr</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  assertMailSafe({ subject, text, html });
  return { subject, text, html };
}

async function main() {
  loadEnv(".env.local");
  const send = process.argv.includes("--send");
  const mail = buildMail();

  console.log(
    JSON.stringify(
      {
        recipients: RECIPIENTS,
        mode: send ? "send" : "dry-run",
        subject: mail.subject,
        textLength: mail.text.length,
        htmlLength: mail.html.length,
        hasReplacement: mail.html.includes("\uFFFD") || mail.text.includes("\uFFFD"),
        hasTripleQuestion: /\?{3,}/.test(`${mail.subject}\n${mail.text}\n${mail.html}`),
        hasKorean: /[가-힣]/.test(`${mail.subject}\n${mail.text}\n${mail.html}`),
      },
      null,
      2,
    ),
  );

  if (!send) return;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: requiredEnv("GMAIL_USER"), pass: requiredEnv("GMAIL_APP_PASSWORD") },
  });

  const info = await transporter.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "deetz"}" <${requiredEnv("GMAIL_USER")}>`,
    to: RECIPIENTS,
    replyTo: "contact@deetz.kr",
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  console.log(
    JSON.stringify(
      {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
