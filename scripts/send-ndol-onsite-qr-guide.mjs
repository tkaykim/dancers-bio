import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import {
  assertKoreanMailSafe,
  escapeHtml,
  renderDeetzMail,
} from "./lib/deetz-mail-layout.mjs";

const SEND_FLAG = "--send";
const RECIPIENTS = [
  "odh@grigoent.co.kr",
  "hs@astcompany.co.kr",
  "tommy062166@gmail.com",
];

const OPS_TOKEN = process.env.NDOL_OPS_TOKEN ?? "REPLACE_WITH_NDOL_OPS_TOKEN";
const OPS_URL =
  `https://www.deetz.kr/ops/ndol-20260618/${OPS_TOKEN}?mode=onsite`;
const ENTRANCE_POSTER_URL = "https://www.deetz.kr/ndol/20260618/pass/poster";
const SELF_PASS_URL = "https://www.deetz.kr/ndol/20260618/pass";
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

function buildMail() {
  const subject = "[deetz] NDOL 6/18 현장 운영판·QR 체크인 사용 안내";
  const text = [
    "안녕하세요, deetz입니다.",
    "",
    "NDOL 6/18 현장 운영판과 QR 체크인 기능 사용 방법을 공유드립니다.",
    "",
    "[운영진이 보는 화면]",
    `운영판 onsite 모드: ${OPS_URL}`,
    "운영진은 이 화면에서 명단, 번호표, 출석 상태, QR 체크인을 함께 확인할 수 있습니다.",
    "",
    "[현장 QR 체크인 흐름]",
    "1. 입구 또는 엘리베이터에 '입구 QR' 포스터를 붙입니다.",
    `   포스터 링크: ${ENTRANCE_POSTER_URL}`,
    "2. 댄서가 포스터 QR을 스캔하면 본인 QR 조회 페이지로 들어갑니다.",
    `   본인 QR 조회 페이지: ${SELF_PASS_URL}`,
    "3. 댄서는 이름 또는 활동명과 전화번호 뒤 4자리를 입력합니다.",
    "4. 화면에 본인 전용 QR과 번호표가 표시됩니다.",
    "5. 운영진은 운영판에서 'QR 체크인'을 누르고 '스캔 시작'을 켠 뒤, 댄서의 QR을 스캔합니다.",
    "6. 스캔이 성공하면 해당 댄서의 출석 상태가 운영판에 반영됩니다.",
    "",
    "[현장에서 보면 되는 항목]",
    "· 번호표: A-01, A-02처럼 현장 부착 번호와 매칭됩니다.",
    "· 이름/활동명: 명단에서 직접 확인할 수 있습니다.",
    "· 성별/프로젝트: 운영판 필터로 확인할 수 있습니다.",
    "· 출석 상태: QR 스캔 또는 수동 처리 후 운영판에 반영됩니다.",
    "",
    "[수동 처리 기준]",
    "QR 조회가 안 되거나 전화번호 정보가 없는 사람은 운영판 명단에서 이름 또는 번호표로 찾아 수동 체크인하면 됩니다.",
    "추가 섭외자도 운영판 명단에 합쳐서 보며, 현장에서는 동일하게 번호표와 출석 상태를 기준으로 관리하면 됩니다.",
    "",
    "[전체 QR 모음]",
    `전체 개인 QR 목록: ${ALL_PASSES_URL}`,
    "현장에서 댄서 휴대폰 조회가 어려울 때 운영진이 이 페이지에서 직접 개인 QR을 확인할 수 있습니다.",
    "",
    "요약하면, 댄서는 입구 QR로 본인 QR을 꺼내고, 운영진은 onsite 운영판에서 그 QR을 스캔해 출석 처리하면 됩니다.",
    "",
    "감사합니다.",
  ].join("\n");

  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:#4f46e5;text-decoration:underline;">${escapeHtml(label)}</a>`;

  const bodyHtml = `
<p style="margin:0 0 14px;">안녕하세요, deetz입니다.</p>
<p style="margin:0 0 14px;">NDOL 6/18 현장 운영판과 QR 체크인 기능 사용 방법을 공유드립니다.</p>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:800;margin:0 0 10px;color:#111;">운영진이 보는 화면</p>
  <p style="margin:0;">${link(OPS_URL, "운영판 onsite 모드 열기")}</p>
  <p style="margin:8px 0 0;color:#555;">이 화면에서 명단, 번호표, 출석 상태, QR 체크인을 함께 확인할 수 있습니다.</p>
</div>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:800;margin:0 0 10px;color:#111;">현장 QR 체크인 흐름</p>
  <ol style="margin:0;padding-left:18px;">
    <li style="margin:0 0 8px;">입구 또는 엘리베이터에 ${link(ENTRANCE_POSTER_URL, "입구 QR 포스터")}를 붙입니다.</li>
    <li style="margin:0 0 8px;">댄서가 포스터 QR을 스캔하면 ${link(SELF_PASS_URL, "본인 QR 조회 페이지")}로 들어갑니다.</li>
    <li style="margin:0 0 8px;">댄서는 이름 또는 활동명과 전화번호 뒤 4자리를 입력합니다.</li>
    <li style="margin:0 0 8px;">화면에 본인 전용 QR과 번호표가 표시됩니다.</li>
    <li style="margin:0 0 8px;">운영진은 운영판에서 <b>QR 체크인</b>을 누르고 <b>스캔 시작</b>을 켠 뒤, 댄서의 QR을 스캔합니다.</li>
    <li style="margin:0;">스캔이 성공하면 해당 댄서의 출석 상태가 운영판에 반영됩니다.</li>
  </ol>
</div>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:800;margin:0 0 10px;color:#111;">현장에서 보면 되는 항목</p>
  <ul style="margin:0;padding-left:18px;">
    <li style="margin:0 0 6px;">번호표: A-01, A-02처럼 현장 부착 번호와 매칭됩니다.</li>
    <li style="margin:0 0 6px;">이름/활동명: 명단에서 직접 확인할 수 있습니다.</li>
    <li style="margin:0 0 6px;">성별/프로젝트: 운영판 필터로 확인할 수 있습니다.</li>
    <li style="margin:0;">출석 상태: QR 스캔 또는 수동 처리 후 운영판에 반영됩니다.</li>
  </ul>
</div>

<div style="border:1px solid #ececef;border-radius:12px;padding:14px 16px;margin:16px 0;">
  <p style="font-weight:800;margin:0 0 10px;color:#111;">수동 처리 기준</p>
  <p style="margin:0 0 10px;">QR 조회가 안 되거나 전화번호 정보가 없는 사람은 운영판 명단에서 이름 또는 번호표로 찾아 수동 체크인하면 됩니다.</p>
  <p style="margin:0;">휴대폰 조회가 어려울 때는 ${link(ALL_PASSES_URL, "전체 개인 QR 목록")}에서 운영진이 직접 개인 QR을 확인할 수 있습니다.</p>
</div>

<p style="margin:0;">요약하면, 댄서는 입구 QR로 본인 QR을 꺼내고, 운영진은 onsite 운영판에서 그 QR을 스캔해 출석 처리하면 됩니다.</p>`;

  const html = renderDeetzMail({
    eyebrow: "현장 운영 안내",
    title: "NDOL 6/18 운영판·QR 체크인 사용 안내",
    bodyHtml,
    ctaText: "운영판 onsite 모드 열기",
    url: OPS_URL,
  });

  assertKoreanMailSafe({ subject, text, html });
  return { subject, text, html };
}

async function main() {
  loadEnv(".env.local");
  const send = process.argv.includes(SEND_FLAG);
  const mail = buildMail();
  const preview = {
    mode: send ? "send" : "dry-run",
    recipients: RECIPIENTS,
    subject: mail.subject,
    textLength: mail.text.length,
    htmlLength: mail.html.length,
    hasReplacement: mail.html.includes("\uFFFD") || mail.text.includes("\uFFFD"),
    hasTripleQuestion: /\?{3,}/.test(`${mail.subject}\n${mail.text}\n${mail.html}`),
    hasKorean: /[가-힣]/.test(`${mail.subject}\n${mail.text}\n${mail.html}`),
  };
  console.log(JSON.stringify(preview, null, 2));

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

  console.log(JSON.stringify({ messageId: info.messageId, accepted: info.accepted, rejected: info.rejected }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
