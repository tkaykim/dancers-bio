#!/usr/bin/env node
/**
 * 개별 답장 — 포기했다가 다시 참여하시겠다는 분께 재참여 처리 결과와 업로드 링크를 보낸다.
 *
 * 장희우(@huiwoo1_0)님이 일정 연장 안내에 회신해 "일정 조정으로 참여 가능"이라고 알려주셨다.
 * 지원 상태는 이미 accepted 로 되돌려 두었고, 기존 제출 토큰을 그대로 쓴다.
 *
 *   node scripts/reply-rejoin.mjs            # 본문 확인
 *   node scripts/reply-rejoin.mjs --send --confirm-send=REPLY_REJOIN
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

const TO = "lmkjhw@naver.com";
const NAME = "장희우";
const HANDLE = "huiwoo1_0";
const TOKEN = "AYHSftgGrTF8mf4t";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const SUBJECT = "RE: [deetz] 릴스 챌린지 일정 연장 안내 — 참여 재개 안내";
const CONFIRM = "REPLY_REJOIN";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--send");
const CONFIRM_ARG = argv.find((a) => a.startsWith("--confirm-send="))?.split("=")[1] ?? "";

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const INTRO = [
  `${NAME}님, 안녕하세요.`,
  "deetz 입니다.",
  "",
  "회신 주셔서 감사합니다.",
  "참여 가능하다고 알려주셔서 바로 다시 참여 처리해 드렸습니다.",
  "",
  "따로 확인을 기다리지 않으셔도 되고, 아래 가이드를 참고해 촬영하신 뒤 제출해 주시면 됩니다.",
];

const SCHEDULE = [
  "영상 원본 제출 : 8월 23일(일) 밤 11시 59분까지 (최종 마감 — 이 이상 연장되지 않습니다)",
  "인스타그램 릴스 업로드 : 8월 24일(월)",
  "   검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있습니다.",
];

const CRITERIA = [
  "촬영 전에 아래 세 가지를 꼭 확인해 주세요. 하나라도 빠지면 광고 건으로 인정되지 않습니다.",
  "",
  "음원 : 인스타그램 오디오 탭에서 'AI-DOL I Wash' 를 직접 선택, 볼륨 1 이상",
  "해시태그 : #광고 #iwash #aidol",
  "계정 태그 : @awc.ent",
  "",
  "전체 가이드",
  GUIDE_URL,
];

const CLOSING = ["궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다."];

const lines = (arr) =>
  arr
    .map((l) =>
      l.trim() === ""
        ? `<div style="height:12px;line-height:12px;">&nbsp;</div>`
        : `<div style="font-size:15px;line-height:1.75;color:#33363b;">${esc(l)}</div>`,
    )
    .join("");

const section = (t, b) =>
  `<div style="margin:24px 0 0;"><div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">${esc(t)}</div>${lines(b)}</div>`;

const uploadBox = `<div style="margin:26px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(HANDLE)}</b> 으로 저장됩니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${TOKEN}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
</div>`;

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">참여 재개</span><div style="margin-top:18px;">${lines(INTRO)}</div>${section("일정", SCHEDULE)}${uploadBox}${section("촬영 전 확인", CRITERIA)}${section("안내", CLOSING)}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table></body></html>`;

const TEXT = [
  ...INTRO, "",
  "[일정]", ...SCHEDULE, "",
  "[영상 업로드 - 본인 전용 링크]", `${SITE}/submit/${TOKEN}`,
  "로그인이나 회원가입은 필요 없습니다.", `파일 이름은 자동으로 ${HANDLE} 으로 저장됩니다.`, "",
  "[촬영 전 확인]", ...CRITERIA, "",
  "[안내]", ...CLOSING,
].join("\n");

console.log(`받는 사람: ${NAME} <${TO}>`);
console.log(`제목: ${SUBJECT}`);
console.log("-".repeat(68));
console.log(TEXT);

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
  text: TEXT,
  html: HTML,
});
tr.close();
console.log(`\n✓ 발송 완료 ${info.messageId}`);
