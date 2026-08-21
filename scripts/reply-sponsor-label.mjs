#!/usr/bin/env node
/**
 * 개별 문의 답장 — 브랜드파트너/협찬 광고 레이블 추가 여부.
 *
 * 유수정(Della, @___s.jjj)님이 검수 완료 안내에 회신해 물어보셨다.
 *   "브랜드파트너에 추가하고 협찬광고 레이블 추가로 올려도 규정에 어긋나지 않을까요?"
 * 대표 판단: 추가하지 않아도 된다.
 *
 * 회신이므로 원문 제목에 RE: 를 붙이고 In-Reply-To 없이 새 메일로 보낸다.
 * (IMAP 원문 Message-ID 를 끌어오는 것보다 단순하고, 수신자가 맥락을 알아본다)
 *
 *   node scripts/reply-sponsor-label.mjs            # 본문 확인
 *   node scripts/reply-sponsor-label.mjs --send --confirm-send=REPLY_SPONSOR_LABEL
 */
import nodemailer from "nodemailer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 무시 */
  }
}

const TO = "kbttcsjssfer@naver.com";
const NAME = "유수정";
const SUBJECT = "RE: [deetz] 영상 검수 완료 — 8월 24일(월) 업로드 안내";
const CONFIRM = "REPLY_SPONSOR_LABEL";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--send");
const CONFIRM_ARG = argv.find((a) => a.startsWith("--confirm-send="))?.split("=")[1] ?? "";

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const BODY = [
  `${NAME}님, 안녕하세요.`,
  "deetz 입니다.",
  "",
  "문의 주셔서 감사합니다.",
  "",
  "브랜드파트너 추가와 협찬 광고 레이블은 별도로 설정하지 않으셔도 됩니다.",
  "",
  "이번 건은 필수 해시태그 #광고 로 광고 표기가 되기 때문에, 레이블을 따로 붙이지 않으셔도 규정에 어긋나지 않습니다.",
  "",
  "안내드린 세 가지만 지켜주시면 됩니다.",
  "",
  "음원 : 인스타그램 오디오 탭에서 'AI-DOL I Wash' 를 직접 선택, 볼륨 1 이상",
  "해시태그 : #광고 #iwash #aidol",
  "계정 태그 : @awc.ent",
  "",
  "8월 24일(월) 하루 중 편하신 시간에 올려주시면 됩니다.",
  "검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있으며, 변경되면 따로 안내드리겠습니다.",
  "",
  "또 궁금하신 점 있으시면 편하게 회신 주세요.",
];

const lines = (arr) =>
  arr
    .map((l) =>
      l.trim() === ""
        ? `<div style="height:12px;line-height:12px;">&nbsp;</div>`
        : `<div style="font-size:15px;line-height:1.75;color:#33363b;">${esc(l)}</div>`,
    )
    .join("");

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">문의 답변</span><div style="margin-top:18px;">${lines(BODY)}</div></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table></body></html>`;

console.log(`받는 사람: ${NAME} <${TO}>`);
console.log(`제목: ${SUBJECT}`);
console.log("-".repeat(68));
console.log(BODY.join("\n"));

if (!LIVE) {
  console.log(`\ndry-run 입니다. 실제 발송은 --send --confirm-send=${CONFIRM}`);
  process.exit(0);
}
if (CONFIRM_ARG !== CONFIRM) { console.error(`--confirm-send=${CONFIRM} 이 필요합니다.`); process.exit(1); }

const user = process.env.DEETZ_GMAIL_USER, pass = process.env.DEETZ_GMAIL_APP_PASSWORD;
if (!user || !pass) { console.error("DEETZ_GMAIL_* 미설정"); process.exit(1); }
const tr = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
const info = await tr.sendMail({
  from: `"deetz 에이전시 & 매거진" <${user}>`,
  to: TO,
  subject: SUBJECT,
  text: BODY.join("\n"),
  html: HTML,
});
tr.close();
console.log(`\n✓ 발송 완료 ${info.messageId}`);
