import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  assertKoreanMailSafe,
  escapeHtml,
  renderDeetzMail,
} from "./lib/deetz-mail-layout.mjs";

const RECIPIENTS = ["odh@grigoent.co.kr", "hs@astcompany.co.kr"];
const OPS_TOKEN = process.env.NDOL_OPS_TOKEN ?? "REPLACE_WITH_NDOL_OPS_TOKEN";
const OPS_URL =
  `https://www.deetz.kr/ops/ndol-20260618/${OPS_TOKEN}?mode=onsite`;
const SELF_PASS_URL = "https://www.deetz.kr/ndol/20260618/pass";
const ENTRANCE_POSTER_URL = "https://www.deetz.kr/ndol/20260618/pass/poster";
const ALL_PASSES_URL =
  `https://www.deetz.kr/ops/ndol-20260618/${OPS_TOKEN}/passes`;

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

function link(href, label) {
  return `<a href="${escapeHtml(href)}" style="color:#4f46e5;text-decoration:underline;font-weight:800;">${escapeHtml(label)}</a>`;
}

function buildMail() {
  const subject = "[deetz] NDOL 현장 운영/QR 진행 방법 안내";
  const text = [
    "안녕하세요, deetz입니다.",
    "",
    "NDOL 6/18 현장 운영판과 QR 체크인 진행 방법을 공유드립니다.",
    "",
    "[핵심 링크]",
    `- 현장 운영판: ${OPS_URL}`,
    `- 참가자 본인 QR 페이지: ${SELF_PASS_URL}`,
    `- 입구 부착용 공통 QR 포스터: ${ENTRANCE_POSTER_URL}`,
    `- 전체 개인 QR 목록: ${ALL_PASSES_URL}`,
    "",
    "[ODH 테스트 방법]",
    "- ODH 계정은 실제 참가자로 포함해두었습니다.",
    "- 운영판에서는 ohdong / 동동현 / C-04 로 검색됩니다.",
    "- 참가자 본인 QR 페이지에 ODH 계정으로 로그인하면 실제 참가자 QR이 표시됩니다.",
    "- 운영진 스캐너로 해당 QR을 스캔하면 C-04 동동현님의 출석이 실제로 체크됩니다.",
    "",
    "[HS 테스트 방법]",
    "- HS 계정은 테스트 QR로 확인하면 됩니다.",
    "- 참가자 본인 QR 페이지에 HS 계정으로 로그인하면 TEST QR이 표시됩니다.",
    "- TEST QR은 스캔 인식 확인용이며, 실제 출석/번호표 통계에는 반영되지 않습니다.",
    "",
    "[현장 운영진 진행 순서]",
    "1. 현장 운영판을 열고 상단 모드가 현장 운영인지 확인합니다.",
    "2. QR 체크인 영역에서 스캔 시작을 누릅니다.",
    "3. 참가자가 본인 QR을 보여주면 스캔합니다.",
    "4. 스캔 성공 시 해당 참가자의 출석 상태가 자동으로 체크인으로 바뀝니다.",
    "5. QR이 안 되는 경우 이름, 활동명, 본명, 전화번호, 번호표로 검색해서 수동 처리합니다.",
    "6. 심사 진행 중에는 현장 상태를 대기, 심사중, 보류, 탈락, 최종후보로 바꾸면 됩니다.",
    "",
    "[참가자에게 안내할 흐름]",
    "1. 입구나 엘리베이터에 붙은 공통 QR을 스캔합니다.",
    "2. 본인 QR 페이지에서 로그인하거나 이름/전화번호 뒤 4자리로 조회합니다.",
    "3. 화면에 표시된 본인 QR과 번호표를 운영진에게 보여줍니다.",
    "4. 운영진이 스캔하면 출석 체크가 완료됩니다.",
    "",
    "요약하면, ODH님은 실제 C-04 참가자로 전체 흐름을 테스트하고, HS님은 TEST QR로 스캐너 인식만 확인하면 됩니다.",
    "",
    "감사합니다.",
  ].join("\n");

  const bodyHtml = `
<p style="margin:0 0 14px;">안녕하세요, deetz입니다.</p>
<p style="margin:0 0 16px;">NDOL 6/18 현장 운영판과 QR 체크인 진행 방법을 공유드립니다.</p>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:900;margin:0 0 10px;color:#111;">핵심 링크</p>
  <ul style="margin:0;padding-left:18px;">
    <li style="margin:0 0 6px;">${link(OPS_URL, "현장 운영판")}</li>
    <li style="margin:0 0 6px;">${link(SELF_PASS_URL, "참가자 본인 QR 페이지")}</li>
    <li style="margin:0 0 6px;">${link(ENTRANCE_POSTER_URL, "입구 부착용 공통 QR 포스터")}</li>
    <li style="margin:0;">${link(ALL_PASSES_URL, "전체 개인 QR 목록")}</li>
  </ul>
</div>

<div style="border:1px solid #bbf7d0;background:#f0fdf4;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:900;margin:0 0 10px;color:#14532d;">ODH 테스트 방법</p>
  <ul style="margin:0;padding-left:18px;color:#14532d;">
    <li style="margin:0 0 6px;">ODH 계정은 실제 참가자로 포함해두었습니다.</li>
    <li style="margin:0 0 6px;">운영판에서는 <b>ohdong / 동동현 / C-04</b>로 검색됩니다.</li>
    <li style="margin:0 0 6px;">참가자 본인 QR 페이지에 ODH 계정으로 로그인하면 실제 참가자 QR이 표시됩니다.</li>
    <li style="margin:0;">운영진 스캐너로 해당 QR을 스캔하면 <b>C-04 동동현</b>님의 출석이 실제로 체크됩니다.</li>
  </ul>
</div>

<div style="border:1px solid #dbeafe;background:#eff6ff;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:900;margin:0 0 10px;color:#1e3a8a;">HS 테스트 방법</p>
  <ul style="margin:0;padding-left:18px;color:#1e3a8a;">
    <li style="margin:0 0 6px;">HS 계정은 테스트 QR로 확인하면 됩니다.</li>
    <li style="margin:0 0 6px;">참가자 본인 QR 페이지에 HS 계정으로 로그인하면 <b>TEST QR</b>이 표시됩니다.</li>
    <li style="margin:0;">TEST QR은 스캔 인식 확인용이며, 실제 출석/번호표 통계에는 반영되지 않습니다.</li>
  </ul>
</div>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:900;margin:0 0 10px;color:#111;">현장 운영진 진행 순서</p>
  <ol style="margin:0;padding-left:18px;">
    <li style="margin:0 0 7px;">현장 운영판을 열고 상단 모드가 <b>현장 운영</b>인지 확인합니다.</li>
    <li style="margin:0 0 7px;">QR 체크인 영역에서 <b>스캔 시작</b>을 누릅니다.</li>
    <li style="margin:0 0 7px;">참가자가 본인 QR을 보여주면 스캔합니다.</li>
    <li style="margin:0 0 7px;">스캔 성공 시 해당 참가자의 출석 상태가 자동으로 <b>체크인</b>으로 바뀝니다.</li>
    <li style="margin:0 0 7px;">QR이 안 되는 경우 이름, 활동명, 본명, 전화번호, 번호표로 검색해서 수동 처리합니다.</li>
    <li style="margin:0;">심사 진행 중에는 현장 상태를 <b>대기, 심사중, 보류, 탈락, 최종후보</b>로 바꾸면 됩니다.</li>
  </ol>
</div>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:900;margin:0 0 10px;color:#111;">참가자에게 안내할 흐름</p>
  <ol style="margin:0;padding-left:18px;">
    <li style="margin:0 0 7px;">입구나 엘리베이터에 붙은 공통 QR을 스캔합니다.</li>
    <li style="margin:0 0 7px;">본인 QR 페이지에서 로그인하거나 이름/전화번호 뒤 4자리로 조회합니다.</li>
    <li style="margin:0 0 7px;">화면에 표시된 본인 QR과 번호표를 운영진에게 보여줍니다.</li>
    <li style="margin:0;">운영진이 스캔하면 출석 체크가 완료됩니다.</li>
  </ol>
</div>

<p style="margin:16px 0 0;font-weight:800;color:#111;">요약하면, ODH님은 실제 C-04 참가자로 전체 흐름을 테스트하고, HS님은 TEST QR로 스캐너 인식만 확인하면 됩니다.</p>`;

  const html = renderDeetzMail({
    eyebrow: "NDOL 현장 운영 안내",
    title: "현장 운영판과 QR 체크인 진행 방법",
    bodyHtml,
    ctaText: "현장 운영판 열기",
    url: OPS_URL,
  });

  assertKoreanMailSafe({ subject, text, html });
  return { subject, text, html };
}

async function main() {
  loadEnv(".env.local");
  const send = process.argv.includes("--send");
  const mail = buildMail();
  const combined = `${mail.subject}\n${mail.text}\n${mail.html}`;
  console.log(
    JSON.stringify(
      {
        mode: send ? "send" : "dry-run",
        recipients: RECIPIENTS,
        subject: mail.subject,
        textLength: mail.text.length,
        htmlLength: mail.html.length,
        hasKorean: /[가-힣]/.test(combined),
        hasReplacement: combined.includes("\uFFFD"),
        hasTripleQuestion: /\?{3,}/.test(combined),
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
    replyTo: "dancers.bio.kr@gmail.com",
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
