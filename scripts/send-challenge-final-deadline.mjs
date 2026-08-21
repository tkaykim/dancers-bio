#!/usr/bin/env node
/**
 * 최종 마감(8/23 23:59) 안내.
 *
 * 두 갈래로 나눈다.
 *   pending  — 확정됐지만 미제출. 마감 연장 + 최종임을 알리고 포기 의사를 묻는다.
 *   declined — 이미 포기·철회. 일정이 늘어난 사실만 알리고 문을 열어둔다. 재촉하지 않는다.
 *
 * 제출 완료자는 대상이 아니다. 이미 검수 결과와 업로드 안내를 받았고,
 * 이 메일은 그분들에게 아무 새 정보도 주지 않는다.
 *
 * 멱등 = project_notification_log(channel='challenge_final_deadline').
 * 기본 dry-run. 실발송은 --send --confirm-send=CHALLENGE_FINAL_DEADLINE.
 *
 *   node scripts/send-challenge-final-deadline.mjs            # 대상 집계
 *   node scripts/send-challenge-final-deadline.mjs --preview  # 변형별 본문 전문
 *   node scripts/send-challenge-final-deadline.mjs --send --confirm-send=CHALLENGE_FINAL_DEADLINE
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
const CHANNEL = "challenge_final_deadline";
const CAMPAIGN = "challenge-final-deadline-2026-08";
const CONFIRM = "CHALLENGE_FINAL_DEADLINE";
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

const INTRO = {
  pending: [
    "촉박한 일정에도 챌린지를 준비해 주셔서 감사합니다.",
    "",
    `영상 원본 제출 기한이 ${DEADLINE}까지로 연장되었습니다.`,
    "주말이 포함되어 있어 촬영하실 시간은 조금 넉넉해졌습니다.",
    "",
    "다만 이번이 마지막 연장이고, 이후에는 접수를 받을 수 없습니다.",
    "광고주 검수와 업로드 일정이 이미 잡혀 있어 저희도 더 미룰 수 없는 상황입니다.",
  ],
  declined: [
    "앞서 참여가 어렵다고 알려주셔서 감사합니다.",
    "덕분에 인원을 정확히 파악할 수 있었습니다.",
    "",
    `제출 기한이 ${DEADLINE}까지로 연장되어 안내드립니다.`,
    "주말이 포함되어 일정이 달라지신 분들이 계실 것 같아 한 번만 더 알려드립니다.",
    "",
    "가능해지셨다면 아직 참여하실 수 있습니다.",
    "여전히 어려우시면 이 메일은 그냥 지나치셔도 괜찮습니다. 따로 회신하지 않으셔도 됩니다.",
  ],
};

const SCHEDULE = [
  `영상 원본 제출 : ${DEADLINE}까지 (최종 마감 — 이 이상 연장되지 않습니다)`,
  `인스타그램 릴스 업로드 : ${UPLOAD_DAY}`,
  "   검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있습니다.",
  "",
  "안내된 8/24~8/25 외 일정에 게시되면 광고 건으로 인정되지 않을 수 있습니다.",
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

const CLOSING = {
  pending: [
    "일정상 참여가 어려우시면 꼭 알려주세요.",
    "정확한 인원 파악이 되어야 광고주와 일정을 맞출 수 있어, 포기 의사를 알려주시는 것도 큰 도움이 됩니다.",
    "",
    "deetz 웹사이트 [내 지원 내역]에서 참여 포기를 누르시거나, 이 메일에 회신해 주시면 됩니다.",
    `${SITE}/applications`,
    "",
    "궁금하신 점도 이 메일로 회신 주시면 안내드리겠습니다.",
  ],
  declined: [
    "참여를 원하시면 이 메일에 회신해 주시면 다시 안내드리겠습니다.",
    "",
    "궁금하신 점도 이 메일로 회신 주시면 됩니다.",
  ],
};

const SUBJECT = {
  pending: `[deetz] 영상 제출 최종 마감 안내 — ${DEADLINE}까지`,
  declined: `[deetz] 릴스 챌린지 일정 연장 안내 — ${DEADLINE}까지`,
};

const PILL = { pending: "최종 마감 안내", declined: "일정 연장 안내" };

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

function buildHtml(v, name, handle, token, email) {
  const body =
    lines([`${name}님, 안녕하세요.`, "deetz 입니다.", "", ...INTRO[v]]) +
    section("일정", SCHEDULE) +
    (v === "pending" ? uploadBox(handle, token) : "") +
    section("촬영 전 확인", CRITERIA) +
    section("안내", CLOSING[v]);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(PILL[v])}</span>${body}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table>${pixel(email)}</body></html>`;
}

function buildText(v, name, handle, token) {
  const out = [`${name}님, 안녕하세요.`, "deetz 입니다.", "", ...INTRO[v], ""];
  out.push("[일정]", ...SCHEDULE, "");
  if (v === "pending") {
    out.push("[영상 업로드 - 본인 전용 링크]", `${SITE}/submit/${token}`,
      "로그인이나 회원가입은 필요 없습니다.", `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`, "");
  }
  out.push("[촬영 전 확인]", ...CRITERIA, "", "[안내]", ...CLOSING[v]);
  return out.join("\n");
}

if (PREVIEW) {
  for (const v of ["pending", "declined"]) {
    console.log("\n" + "=".repeat(72));
    console.log(`[${v}] 제목: ${SUBJECT[v]}`);
    console.log("=".repeat(72));
    console.log(buildText(v, "홍길동", "example_handle", "TOKEN"));
  }
  process.exit(0);
}

// ── 대상 ────────────────────────────────────────────────────────
const { data: apps } = await db
  .from("applications")
  .select("id, status, applicant_id")
  .eq("project_id", PROJECT_ID)
  .is("archived_at", null)
  .in("status", ["accepted", "declined", "withdrawn"]);

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
for (const a of apps ?? []) {
  const sub = subByApp.get(a.id);
  // 제출을 마친 사람은 대상이 아니다. 이미 검수 결과와 업로드 안내를 받았다.
  if (sub?.uploaded_at) continue;
  if (already.has(a.applicant_id)) continue;

  const variant = a.status === "accepted" ? "pending" : "declined";
  // 미제출자에게는 업로드 링크를 함께 보내야 하므로 토큰이 없으면 보내지 않는다.
  if (variant === "pending" && !sub?.token) {
    skipped.push(`${sub?.display_name ?? a.applicant_id} — 업로드 토큰 없음`);
    continue;
  }

  const { data: u } = await db.auth.admin.getUserById(a.applicant_id);
  const email = u?.user?.email;
  if (!email) { skipped.push(`${sub?.display_name ?? a.applicant_id} — 이메일 없음`); continue; }

  targets.push({
    pid: a.applicant_id,
    email,
    name: sub?.display_name ?? sub?.instagram_handle ?? "참여자",
    handle: sub?.instagram_handle ?? "",
    token: sub?.token ?? "",
    variant,
  });
}

const counts = targets.reduce((a, t) => ((a[t.variant] = (a[t.variant] ?? 0) + 1), a), {});
console.log(`\n대상 ${targets.length}명 — 미제출 ${counts.pending ?? 0} · 포기/철회 ${counts.declined ?? 0}`);
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
      subject: SUBJECT[t.variant],
      text: buildText(t.variant, t.name, t.handle, t.token),
      html: buildHtml(t.variant, t.name, t.handle, t.token, t.email),
    });
    await db.from("project_notification_log").upsert(
      { project_id: PROJECT_ID, recipient_id: t.pid, channel: CHANNEL },
      { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true });
    ok += 1;
    console.log(`  ✓ [${t.variant}] ${t.email} ${info.messageId}`);
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
