#!/usr/bin/env node
/**
 * 신청 후 미제출자에게 "제출 버튼은 여기" 안내 + 오늘 마감.
 *
 * 왜 필요한가
 *   "제출 버튼을 못 찾겠다"는 문의가 여러 건 들어왔다. 업로드 링크가 존재하는 곳이
 *   안내 메일 맨 아래와 접수 직후 화면 두 군데뿐이라, 메일을 못 찾으면 방법이 없었다.
 *   그래서 이번 메일은 순서를 뒤집는다 — 업로드 버튼을 맨 위에 둔다.
 *   가이드는 이미 여러 번 받으신 분들이고, 오늘이 마감이라 제출 자체가 급하다.
 *
 * 대상: accepted + 가이드라인 메일을 이미 받았음 + 아직 제출하지 않음.
 *   가이드라인을 못 받은 사람에게 "제출 버튼은 여기"만 보내면 무엇을 찍어야 하는지
 *   모르는 채로 링크만 받게 된다. 그런 사람은 가이드라인부터 나가야 한다(오토파일럿 담당).
 *   포기·철회하신 분들은 어제 마지막 안내를 이미 받았으므로 제외한다.
 *
 * 멱등 = project_notification_log(channel='challenge_where_to_submit').
 * 기본 dry-run. 실발송은 --send --confirm-send=CHALLENGE_WHERE_TO_SUBMIT.
 */
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { createHmac } from "node:crypto";
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

const PROJECT_ID = "06232945-3563-431e-b399-edc6c7b21dc5";
const CHANNEL = "challenge_where_to_submit";
const CAMPAIGN = "challenge-where-to-submit-2026-08";
const CONFIRM = "CHALLENGE_WHERE_TO_SUBMIT";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const DEADLINE = "오늘 8월 23일(일) 밤 11시 59분";
const UPLOAD_DAY = "8월 24일(월)";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--send");
const PREVIEW = argv.includes("--preview");
const CONFIRM_ARG = argv.find((a) => a.startsWith("--confirm-send="))?.split("=")[1] ?? "";
const LIMIT = Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || 9999;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function pixel(email) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "";
  const e = Buffer.from(email, "utf8").toString("base64url");
  const s = createHmac("sha256", key).update(CAMPAIGN + "|" + email).digest("base64url");
  return `<img src="${SITE}/api/track/open?c=${encodeURIComponent(CAMPAIGN)}&e=${e}&s=${s}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">`;
}

const INTRO = [
  "촉박한 일정에도 챌린지를 준비해 주셔서 감사합니다.",
  "",
  "제출 버튼을 찾기 어렵다는 문의가 있어, 아직 영상을 보내지 않으신 분들께 안내드립니다.",
  "",
  `영상 원본 제출은 ${DEADLINE}까지입니다.`,
  "이번이 마지막이며, 이후에는 접수를 받을 수 없습니다.",
];

const SCHEDULE = [
  `영상 원본 제출 : ${DEADLINE}까지 (최종 마감)`,
  `인스타그램 릴스 업로드 : ${UPLOAD_DAY}`,
  "   검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있습니다.",
];

const SHOOTING = [
  "세로형으로 촬영해 주세요.",
  "전면 카메라와 후면 카메라 중 어느 쪽을 쓰셔도 상관없습니다.",
  "좌우반전도 신경 쓰지 않으셔도 됩니다.",
  "",
  "아래 세 가지는 하나라도 빠지면 광고 건으로 인정되지 않습니다.",
  "",
  "음원 : 인스타그램 오디오 탭에서 'AI-DOL I Wash' 를 직접 선택, 볼륨 1 이상",
  "해시태그 : #광고 #iwash #aidol",
  "계정 태그 : @awc.ent",
  "",
  "전체 제작 가이드",
  GUIDE_URL,
];

const CLOSING = [
  "링크를 잃어버리셨거나 열리지 않으면 이 메일에 회신해 주세요. 바로 다시 보내드리겠습니다.",
  "",
  "참여가 어려우시면 그것도 알려주시면 감사하겠습니다.",
];

const SUBJECT = `[deetz] 영상 제출은 여기서 — ${DEADLINE} 마감`;

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

// 이번 메일만 업로드 버튼을 맨 위에 둔다.
// 가이드는 이미 여러 번 받으신 분들이고, 오늘이 마감이라 제출 자체가 급하다.
function uploadBox(handle, token) {
  return `<div style="margin:24px 0 0;padding:20px;border:2px solid #111;border-radius:14px;">
<div style="font-size:14px;font-weight:800;color:#111;margin-bottom:6px;">영상 제출은 아래 버튼입니다</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장되니 직접 바꾸실 필요 없습니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:16px;font-weight:700;padding:17px 0;border-radius:12px;">영상 제출하러 가기</a></div>
<div style="font-size:12px;color:#6b7280;margin-top:10px;word-break:break-all;">버튼이 안 눌리면 이 주소를 복사해 열어주세요<br>${SITE}/submit/${esc(token)}</div>
</div>`;
}

function buildHtml(name, handle, token, email) {
  const body =
    lines([`${name}님, 안녕하세요.`, "deetz 입니다.", "", ...INTRO]) +
    uploadBox(handle, token) +
    section("일정", SCHEDULE) +
    section("촬영 안내", SHOOTING) +
    section("안내", CLOSING);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">제출 방법 안내</span>${body}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table>${pixel(email)}</body></html>`;
}

function buildText(name, handle, token) {
  return [
    `${name}님, 안녕하세요.`, "deetz 입니다.", "", ...INTRO, "",
    "[영상 제출은 여기입니다]",
    `${SITE}/submit/${token}`,
    "로그인이나 회원가입은 필요 없습니다.",
    `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`, "",
    "[일정]", ...SCHEDULE, "",
    "[촬영 안내]", ...SHOOTING, "",
    "[안내]", ...CLOSING,
  ].join("\n");
}

if (PREVIEW) {
  console.log(`제목: ${SUBJECT}`);
  console.log("=".repeat(72));
  console.log(buildText("홍길동", "example_handle", "TOKEN"));
  process.exit(0);
}

// ── 대상 ────────────────────────────────────────────────────────
const { data: apps } = await db
  .from("applications")
  .select("id, status, applicant_id")
  .eq("project_id", PROJECT_ID)
  .is("archived_at", null)
  .eq("status", "accepted");

const { data: subs } = await db
  .from("project_submissions")
  .select("application_id, instagram_handle, display_name, token, uploaded_at")
  .eq("project_id", PROJECT_ID);
const subByApp = new Map((subs ?? []).map((s) => [s.application_id, s]));

const { data: sentLog } = await db
  .from("project_notification_log")
  .select("recipient_id")
  .eq("project_id", PROJECT_ID)
  .eq("channel", CHANNEL);
const already = new Set((sentLog ?? []).map((l) => l.recipient_id));

// 가이드라인을 받은 사람만 대상으로 삼는다.
const { data: guideLog } = await db
  .from("project_notification_log")
  .select("recipient_id")
  .eq("project_id", PROJECT_ID)
  .eq("channel", "challenge_guideline_mail");
const gotGuideline = new Set((guideLog ?? []).map((l) => l.recipient_id));

const targets = [];
const skipped = [];
const seen = new Set();
for (const a of apps ?? []) {
  const sub = subByApp.get(a.id);
  if (!sub?.token) { skipped.push(`${a.id} — 업로드 토큰 없음`); continue; }
  if (sub.uploaded_at) continue;             // 이미 제출한 사람은 대상 아님
  if (already.has(a.applicant_id)) continue; // 멱등
  if (!gotGuideline.has(a.applicant_id)) {
    skipped.push(`${sub.display_name ?? a.id} — 가이드라인 미수신(먼저 가이드라인이 나가야 함)`);
    continue;
  }
  if (seen.has(a.applicant_id)) continue;    // 같은 사람 지원 2건이면 1통만

  const { data: u } = await db.auth.admin.getUserById(a.applicant_id);
  const email = u?.user?.email;
  if (!email) { skipped.push(`${sub.display_name ?? a.id} — 이메일 없음`); continue; }

  seen.add(a.applicant_id);
  targets.push({
    pid: a.applicant_id, email,
    name: sub.display_name ?? sub.instagram_handle ?? "참여자",
    handle: sub.instagram_handle ?? "", token: sub.token,
  });
}

console.log(`\n대상 ${targets.length}명 (확정 · 미제출)`);
if (skipped.length) {
  console.log(`\n제외 ${skipped.length}건:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

const batch = targets.slice(0, LIMIT);
if (!batch.length) { console.log("보낼 대상이 없습니다."); process.exit(0); }
if (!LIVE) {
  console.log(`\ndry-run 입니다. 본문 확인은 --preview, 실제 발송은 --send --confirm-send=${CONFIRM}`);
  process.exit(0);
}
if (CONFIRM_ARG !== CONFIRM) { console.error(`--confirm-send=${CONFIRM} 이 필요합니다.`); process.exit(1); }

const user = process.env.DEETZ_GMAIL_USER, pass = process.env.DEETZ_GMAIL_APP_PASSWORD;
if (!user || !pass) { console.error("DEETZ_GMAIL_* 미설정"); process.exit(1); }
const tr = nodemailer.createTransport({
  service: "gmail", auth: { user, pass },
  pool: true, maxConnections: 1, maxMessages: 100, rateDelta: 3000, rateLimit: 1,
});

let ok = 0;
for (const t of batch) {
  try {
    const info = await tr.sendMail({
      from: `"deetz 에이전시 & 매거진" <${user}>`,
      to: t.email,
      subject: SUBJECT,
      text: buildText(t.name, t.handle, t.token),
      html: buildHtml(t.name, t.handle, t.token, t.email),
    });
    await db.from("project_notification_log").upsert(
      { project_id: PROJECT_ID, recipient_id: t.pid, channel: CHANNEL },
      { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true });
    ok += 1;
    console.log(`  ✓ ${t.email} ${info.messageId}`);
  } catch (e) {
    console.error(`  ✗ ${t.email} — ${e?.message}`);
    if (/Too many login attempts|5\.4\.5|quota/i.test(e?.message ?? "")) {
      console.error("Gmail 한도로 중단합니다. 다음 회차에 남은 대상만 이어서 보냅니다.");
      break;
    }
  }
}
tr.close();
console.log(`\n발송 ${ok}/${batch.length}`);
