#!/usr/bin/env node
/**
 * 포기·철회하신 분께 "회신 없이 바로 제출 가능"을 알린다.
 *
 * 왜 필요한가
 *   앞선 연장 안내에 '참여를 원하시면 회신해 주세요'라고 써서, 마음이 바뀐 분들이
 *   회신만 하고 답을 기다리다 하루를 흘려보냈다. 제출 페이지도 포기 상태에서는
 *   막혀 있었다. 이제 게이트를 열었으니(제출하면 참여로 자동 복구), 그 사실을 알린다.
 *
 * 대상: declined·withdrawn 이면서 아직 제출하지 않은 사람 중 업로드 토큰이 있는 사람.
 *   확정(accepted) 상태인 분들은 어제 최종 마감 안내를 이미 받았으므로 제외한다.
 *
 * 멱등 = project_notification_log(channel='challenge_reopen').
 * 기본 dry-run. 실발송은 --send --confirm-send=CHALLENGE_REOPEN.
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
const CHANNEL = "challenge_reopen";
const CAMPAIGN = "challenge-reopen-2026-08";
const CONFIRM = "CHALLENGE_REOPEN";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const DEADLINE = "8월 23일(일) 밤 11시 59분";
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
  "앞서 참여가 어렵다고 알려주셔서 감사합니다.",
  "",
  "그동안 안내 메일이 여러 번 나가 번거로우셨을 것 같습니다.",
  "이번이 마지막 안내입니다.",
  "",
  "일정이 달라져 다시 참여가 가능해지신 경우, 아래 링크로 영상을 올려주시면 됩니다.",
  "별도로 회신하지 않으셔도 되고, 저희 확인을 기다리실 필요도 없습니다.",
  "",
  "여전히 어려우시면 이 메일은 그냥 지나치셔도 괜찮습니다.",
];

const SCHEDULE = [
  `영상 원본 제출 : ${DEADLINE}까지 (최종 마감 — 이 이상 연장되지 않습니다)`,
  `인스타그램 릴스 업로드 : ${UPLOAD_DAY}`,
  "   검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있습니다.",
];

const SHOOTING = [
  "세로형으로 촬영해 주세요.",
  "전면 카메라와 후면 카메라 중 어느 쪽을 쓰셔도 상관없습니다.",
  "",
  "아래 세 가지는 하나라도 빠지면 광고 건으로 인정되지 않습니다.",
  "",
  "음원 : 인스타그램 오디오 탭에서 'AI-DOL I Wash' 를 직접 선택, 볼륨 1 이상",
  "해시태그 : #광고 #iwash #aidol",
  "계정 태그 : @awc.ent",
  "",
  "전체 가이드",
  GUIDE_URL,
];

const CLOSING = [
  "궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다.",
  "",
  "그동안 관심 가져주셔서 감사합니다.",
];

const SUBJECT = `[deetz] 릴스 챌린지 마지막 안내 — 가능하시면 ${DEADLINE}까지`;

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

function uploadBox(handle, token) {
  return `<div style="margin:26px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장됩니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
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
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">마지막 안내</span>${body}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table>${pixel(email)}</body></html>`;
}

function buildText(name, handle, token) {
  return [
    `${name}님, 안녕하세요.`, "deetz 입니다.", "", ...INTRO, "",
    "[영상 업로드 - 본인 전용 링크]", `${SITE}/submit/${token}`,
    "로그인이나 회원가입은 필요 없습니다.", `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`, "",
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
  .in("status", ["declined", "withdrawn"]);

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

const targets = [];
const skipped = [];
const seenRecipient = new Set();
for (const a of apps ?? []) {
  const sub = subByApp.get(a.id);
  if (!sub?.token) { skipped.push(`${a.id} — 업로드 토큰 없음`); continue; }
  if (sub.uploaded_at) continue;             // 이미 제출한 사람은 대상 아님
  if (already.has(a.applicant_id)) continue; // 멱등
  if (seenRecipient.has(a.applicant_id)) continue; // 같은 사람 지원 2건이면 1통만

  const { data: u } = await db.auth.admin.getUserById(a.applicant_id);
  const email = u?.user?.email;
  if (!email) { skipped.push(`${sub.display_name ?? a.id} — 이메일 없음`); continue; }

  seenRecipient.add(a.applicant_id);
  targets.push({
    pid: a.applicant_id, email,
    name: sub.display_name ?? sub.instagram_handle ?? "참여자",
    handle: sub.instagram_handle ?? "", token: sub.token,
    status: a.status,
  });
}

console.log(`\n대상 ${targets.length}명 (포기 ${targets.filter(t=>t.status==="declined").length} · 철회 ${targets.filter(t=>t.status==="withdrawn").length})`);
for (const t of targets) console.log(`  - ${t.name} @${t.handle} <${t.email}> [${t.status}]`);
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
