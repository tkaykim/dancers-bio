#!/usr/bin/env node
/**
 * 릴스 챌린지 — 미제출자 리마인드 메일.
 *
 * 대상 = 확정(accepted) + 가이드라인 메일 수신 + **아직 제출 안 한** 사람.
 * 이미 낸 사람에게는 절대 가지 않는다.
 *
 * 기본은 dry-run 이다. 실제 발송은 --send --confirm-send=CHALLENGE_REMINDER 가 모두 있을 때만.
 *
 * 회차(--round)마다 멱등 채널이 갈린다. 같은 회차는 두 번 안 나가고, 다음 회차는 새로 나간다.
 *   round=1 → project_notification_log.channel = 'challenge_reminder_1'
 *
 * Gmail 한도 방어는 가이드라인 발송 스크립트와 동일하다.
 * 이 계정 실질 한도는 하루 약 500통이고(INTEGRATIONS.md), 한도 에러를 만나면 즉시 전체 중단한다.
 *
 * 사용:
 *   node scripts/send-challenge-reminder.mjs --round=1
 *   node scripts/send-challenge-reminder.mjs --round=1 --send --confirm-send=CHALLENGE_REMINDER
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
const GUIDELINE_CHANNEL = "challenge_guideline_mail";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const CONFIRM = "CHALLENGE_REMINDER";
const DEADLINE = "8월 23일(일) 23:59";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--send");
const CONFIRM_ARG = argv.find((a) => a.startsWith("--confirm-send="))?.split("=")[1] ?? "";
const LIMIT = Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || 9999;
const ROUND = Number(argv.find((a) => a.startsWith("--round="))?.split("=")[1] ?? "1");

if (!Number.isInteger(ROUND) || ROUND < 1 || ROUND > 9) {
  console.error("--round 는 1~9 사이 정수여야 합니다.");
  process.exit(1);
}
const CHANNEL = `challenge_reminder_${ROUND}`;
const CAMPAIGN = `challenge-reminder-${ROUND}-2026-08`;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trackingPixel(email) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "";
  const e = Buffer.from(email, "utf8").toString("base64url");
  const s = createHmac("sha256", key).update(`${CAMPAIGN}|${email}`).digest("base64url");
  return `<img src="${SITE}/api/track/open?c=${encodeURIComponent(CAMPAIGN)}&e=${e}&s=${s}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">`;
}

// ── 본문 ─────────────────────────────────────────────────────────
// 리마인드라 짧게 간다. 전체 가이드를 다시 붙이지 않고 링크로 보낸다.
// 톤 원칙(대표 지시 2026-08-17): 미제출을 지적하거나 눈치 주지 않는다.
// 준비 기간이 실제로 짧았고 그건 참여자 잘못이 아니다.
// 감사 먼저, 그리고 "못 하겠으면 알려달라"를 명확히 — 그래야 우리가 인원을 정확히 파악한다.
const BODY_LINES = [
  "촉박한 일정에도 챌린지를 준비해 주셔서 감사합니다.",
  "",
  "1차 제출일이 지났지만 아직 검수를 진행 중이라, 늦게 제출해 주시는 영상도 최대한 받아보려 합니다.",
  "제출 기한이 8월 23일(일) 밤 11시 59분까지로 연장되었습니다.",
  "새벽에 작업하시는 분들을 위해 아침까지 열어두었습니다.",
  "이번이 마지막 연장이라 이후에는 접수가 어려울 수 있습니다.",
  "",
  "일정이 지났다고 포기하지 마시고, 늦게라도 가급적 빨리 제출 부탁드립니다.",
  "준비되신 분은 아래 버튼으로 바로 올려주세요.",
];

const CHECK_LINES = [
  "업로드 전 아래 세 가지만 다시 확인해 주세요.",
  "",
  "1. 인스타그램 오디오 탭에서 공식 음원을 직접 선택 (곡명 AI-DOL I Wash)",
  "2. 음원 볼륨 1 이상 — 0이면 공식 음원이 연결되지 않습니다",
  "3. 필수 해시태그 #광고 #iwash #aidol 와 브랜드 계정 태그 @awc.ent",
  "4. 인스타그램 게시는 8월 24일(월) — 검수 일정에 따라 8월 25일(화)로 변경될 수 있습니다",
  "",
  "전체 가이드는 아래에서 다시 확인하실 수 있습니다.",
  GUIDE_URL,
];

const CLOSING = [
  "이번에는 참여가 어려우신 경우에도 꼭 알려주세요.",
  "",
  "deetz 웹사이트 [내 지원 내역]에서 참여 포기 버튼을 누르시거나,",
  "이 메일로 회신해 주시면 됩니다.",
  `${SITE}/applications`,
  "",
  "정확한 참여 인원을 파악해야 남은 자리를 조정할 수 있어 부탁드립니다.",
  "참여가 어렵다고 알려주시는 데 어떤 불이익도 없습니다.",
  "",
  "짧은 일정에 함께해 주셔서 다시 한번 감사드립니다.",
];

function lines(arr) {
  return arr
    .map((l) =>
      l.trim() === ""
        ? `<div style="height:12px;line-height:12px;">&nbsp;</div>`
        : `<div style="font-size:15px;line-height:1.75;color:#33363b;">${esc(l)}</div>`,
    )
    .join("");
}

function buildHtml(name, handle, token, email) {
  const intro = lines([`${name}님, 안녕하세요.`, "deetz 입니다.", "", ...BODY_LINES]);

  const uploadBox = `<div style="margin:24px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장됩니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
<div style="font-size:12px;color:#6b7280;margin-top:10px;">본인에게만 발급된 링크입니다. 다른 분과 공유하지 말아 주세요.</div>
</div>`;

  const check = `<div style="margin:24px 0 0;">${lines(CHECK_LINES)}</div>`;
  const closing = `<div style="margin:24px 0 0;">${lines(CLOSING)}</div>`;

  // 외부 이미지 없음 (2026-08-06 Storage egress 사고 이후 방침)
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#dcfce7;color:#166534;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">제출 기한 연장</span>${intro}${uploadBox}${check}${closing}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:10px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table>${trackingPixel(email)}</body></html>`;
}

function buildText(name, handle, token) {
  return [
    `${name}님, 안녕하세요.`,
    "deetz 입니다.",
    "",
    ...BODY_LINES,
    "",
    "[영상 업로드 - 본인 전용 링크]",
    `${SITE}/submit/${token}`,
    "로그인이나 회원가입은 필요 없습니다.",
    `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`,
    "",
    ...CHECK_LINES,
    "",
    ...CLOSING,
  ].join("\n");
}

// ── 대상 조회 ────────────────────────────────────────────────────
async function loadTargets() {
  // 확정자 + 제출창구 (uploaded_at 이 곧 제출 여부다)
  const { data: subs } = await db
    .from("project_submissions")
    .select("application_id, dancer_id, instagram_handle, display_name, token, uploaded_at")
    .eq("project_id", PROJECT_ID);
  if (!subs?.length) return { targets: [], stats: { 확정: 0, 제출: 0, 미제출: 0, 이미리마인드: 0 } };

  const { data: apps } = await db
    .from("applications")
    .select("id, status, archived_at")
    .eq("project_id", PROJECT_ID)
    .eq("status", "accepted")
    .is("archived_at", null);
  const acceptedIds = new Set((apps ?? []).map((a) => a.id));

  const { data: dancers } = await db
    .from("dancers")
    .select("id, profile_id")
    .in("id", subs.map((s) => s.dancer_id).filter(Boolean));
  const profileByDancer = new Map((dancers ?? []).map((d) => [d.id, d.profile_id]));

  const [{ data: guideLogs }, { data: remindLogs }] = await Promise.all([
    db.from("project_notification_log").select("recipient_id").eq("project_id", PROJECT_ID).eq("channel", GUIDELINE_CHANNEL),
    db.from("project_notification_log").select("recipient_id").eq("project_id", PROJECT_ID).eq("channel", CHANNEL),
  ]);
  const guided = new Set((guideLogs ?? []).map((l) => l.recipient_id));
  const reminded = new Set((remindLogs ?? []).map((l) => l.recipient_id));

  const stats = { 확정: 0, 제출: 0, 미제출: 0, 이미리마인드: 0 };
  const targets = [];

  for (const s of subs) {
    if (!acceptedIds.has(s.application_id)) continue;
    stats.확정 += 1;
    if (s.uploaded_at) {
      stats.제출 += 1;
      continue; // 이미 낸 사람에게는 보내지 않는다
    }
    stats.미제출 += 1;

    const pid = profileByDancer.get(s.dancer_id);
    if (!pid || !guided.has(pid) || !s.token) continue;
    if (reminded.has(pid)) {
      stats.이미리마인드 += 1;
      continue;
    }
    const { data: u } = await db.auth.admin.getUserById(pid);
    const email = u?.user?.email;
    if (!email) continue;

    targets.push({
      profileId: pid,
      email,
      name: s.display_name ?? s.instagram_handle,
      handle: s.instagram_handle,
      token: s.token,
    });
  }
  return { targets, stats };
}

function isQuotaError(msg) {
  return /550[- ]?5\.4\.5|Daily user sending limit|454[- ]?4\.7\.0|Too many login attempts|Quota exceeded/i.test(msg);
}

// ── 실행 ─────────────────────────────────────────────────────────
const { targets, stats } = await loadTargets();
const batch = targets.slice(0, LIMIT);

console.log(
  `\n[리마인드 ${ROUND}회차] 확정 ${stats.확정} · 제출완료 ${stats.제출} · 미제출 ${stats.미제출} · 이번 회차 이미발송 ${stats.이미리마인드}`,
);
console.log(`보낼 대상 ${batch.length}명 (--limit=${LIMIT === 9999 ? "제한없음" : LIMIT})\n`);
for (const t of batch) console.log(`  · ${t.name} <${t.email}> @${t.handle}`);

if (!batch.length) {
  console.log("\n보낼 대상이 없습니다.");
  process.exit(0);
}
if (!LIVE) {
  console.log(`\ndry-run 입니다. 실제 발송은 --round=${ROUND} --send --confirm-send=${CONFIRM}`);
  process.exit(0);
}
if (CONFIRM_ARG !== CONFIRM) {
  console.error(`--confirm-send=${CONFIRM} 이 필요합니다.`);
  process.exit(1);
}

const gmailUser = process.env.DEETZ_GMAIL_USER;
const gmailPass = process.env.DEETZ_GMAIL_APP_PASSWORD;
if (!gmailUser || !gmailPass) {
  console.error("DEETZ_GMAIL_USER / DEETZ_GMAIL_APP_PASSWORD 미설정");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: gmailUser, pass: gmailPass },
  pool: true,
  maxConnections: 1,
  maxMessages: 100,
  rateDelta: 3000,
  rateLimit: 1,
});

const SUBJECT = "[deetz] 릴스 챌린지 — 늦은 제출도 받습니다 (8/19까지)";
let sent = 0;
for (const t of batch) {
  try {
    const info = await transporter.sendMail({
      from: `"deetz 에이전시 & 매거진" <${gmailUser}>`,
      to: t.email,
      subject: SUBJECT,
      text: buildText(t.name, t.handle, t.token),
      html: buildHtml(t.name, t.handle, t.token, t.email),
    });
    await db
      .from("project_notification_log")
      .upsert(
        { project_id: PROJECT_ID, recipient_id: t.profileId, channel: CHANNEL },
        { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
      );
    sent += 1;
    console.log(`  ✓ ${t.email} ${info.messageId}`);
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (isQuotaError(msg)) {
      console.error(`\n⛔ Gmail 한도 도달로 중단합니다: ${msg}`);
      console.error(`   여기까지 ${sent}건. 한도 리셋 후 같은 명령을 다시 실행하면 남은 대상만 이어서 보냅니다.`);
      break;
    }
    console.error(`  ✗ ${t.email} — ${msg}`);
  }
}
transporter.close();
console.log(`\n발송 완료 ${sent}/${batch.length}건`);
