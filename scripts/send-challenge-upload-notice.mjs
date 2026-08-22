#!/usr/bin/env node
/**
 * 업로드 일자 확정(8/24) + 광고 인정 기준 + 최종 마감 안내.
 *
 * 대상을 3갈래로 나눠 문구를 달리한다.
 *   submitted  — 이미 제출함. 업로드 안내만. 제출 재촉 없음.
 *   pending    — 확정됐지만 미제출. 업로드 안내 + 최종 마감 촉구.
 *   declined   — 중도 포기. 연장 사실만 알리고 재참여 여지를 연다. 재촉하지 않는다.
 *
 * 멱등 = project_notification_log(channel='challenge_upload_notice').
 * 기본 dry-run. 실발송은 --send --confirm-send=CHALLENGE_UPLOAD_NOTICE.
 *
 *   node scripts/send-challenge-upload-notice.mjs                 # 대상·문구 확인
 *   node scripts/send-challenge-upload-notice.mjs --preview       # 변형별 본문 전문 출력
 *   node scripts/send-challenge-upload-notice.mjs --send --confirm-send=CHALLENGE_UPLOAD_NOTICE
 */
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import {
  fetchUnsubscribePrefs,
  listUnsubscribeHeaders,
} from "./lib/list-unsubscribe.mjs";
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
const CHANNEL = "challenge_upload_notice";
const CAMPAIGN = "challenge-upload-notice-2026-08";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const CONFIRM = "CHALLENGE_UPLOAD_NOTICE";
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

// ── 변형별 도입부 ────────────────────────────────────────────────
const INTRO = {
  submitted: [
    "영상 제출해 주셔서 감사합니다.",
    "",
    `인스타그램 업로드 일자가 ${UPLOAD_DAY}로 확정되어 안내드립니다.`,
    "업로드는 참여자분께서 직접 본인 계정에 올려주셔야 합니다.",
  ],
  pending: [
    "촉박한 일정에도 챌린지를 준비해 주셔서 감사합니다.",
    "",
    `인스타그램 업로드 일자가 ${UPLOAD_DAY}로 확정되었습니다.`,
    "",
    `영상 원본 제출 기한은 ${DEADLINE}까지로 최종 연장되었습니다.`,
    "새벽에 작업하시는 분들이 많아 아침까지 열어두었습니다.",
    "",
    "다만 마감 시각에 맞추기보다 최대한 빨리 보내주시는 편이 좋습니다.",
    "제출해 주신 영상은 저희 검수와 광고주 확인을 거쳐야 하는데, 마감에 몰리면 그 일정에 차질이 생깁니다.",
    "지금 준비가 되셨다면 오늘 중으로 보내주시면 가장 좋습니다.",
    "",
    "이번이 마지막 연장이라 이후에는 접수가 어려울 수 있습니다.",
  ],
  resubmit: [
    "재촬영 요청에 응해주셔서 감사합니다.",
    "문의 주신 제출 기한과 방법을 안내드립니다.",
    "",
    "재촬영 영상은 아래 업로드 링크로 그대로 보내주시면 됩니다.",
    "처음에 보내드린 링크와 같은 링크이며, 다시 올리시면 마지막에 올린 영상이 최종본이 됩니다.",
    "메일에 파일을 첨부하지 않으셔도 됩니다.",
    "",
    `제출 기한은 ${DEADLINE}까지입니다.`,
    "다만 검수 일정이 있어 가능한 한 빨리 보내주시면 감사하겠습니다.",
    "",
    `인스타그램 업로드 일자는 ${UPLOAD_DAY}로 확정되었습니다.`,
  ],
  declined: [
    "이번 챌린지 참여가 어렵다고 알려주셔서 감사합니다.",
    "덕분에 인원을 정확히 파악할 수 있었습니다.",
    "",
    `일정이 ${DEADLINE}까지로 최종 연장되어 안내드립니다.`,
    `인스타그램 업로드 일자는 ${UPLOAD_DAY}로 확정되었습니다.`,
    "",
    "혹시 일정이 되신다면 아직 참여하실 수 있습니다.",
    "부담 갖지 마시고, 어려우시면 이 메일은 지나치셔도 괜찮습니다.",
  ],
};

// ── 전원 공통 ────────────────────────────────────────────────────
const CRITERIA = [
  "아래 세 가지를 지키지 않으면 광고 건으로 인정되지 않을 수 있습니다.",
  "",
  "1. 음원",
  "   인스타그램에 등록된 공식 음원을 오디오 탭에서 직접 선택해 업로드해 주세요.",
  "   곡명 : AI-DOL I Wash",
  "   음원 볼륨이 너무 작으면 시스템이 음원 사용으로 인식하지 못합니다.",
  "   음원이 잘 들리도록 볼륨을 설정해 주세요.",
  "",
  "2. 게시일",
  `   ${UPLOAD_DAY}에 업로드해 주세요.`,
  "   안내된 날짜 외에 게시될 경우 광고 건으로 인정되지 않을 수 있습니다.",
  "",
  "3. 태그와 해시태그",
  "   계정 태그 : @awc.ent",
  "   필수 해시태그 : #광고 #iwash #aidol",
];

const LIABILITY = [
  "가이드라인은 광고주가 정한 기준이라 저희가 조정할 수 없는 부분입니다.",
  "가이드라인을 지키지 않았거나 확인하지 못하여 광고주 측에서 인정하지 않는 경우,",
  "저희가 페이 지급을 보장해 드리기 어렵습니다.",
  "",
  "번거로우시더라도 업로드 전에 위 세 가지를 꼭 다시 확인해 주세요.",
  "",
  "전체 가이드는 아래에서 확인하실 수 있습니다.",
  GUIDE_URL,
];

const CLOSING = [
  "궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다.",
  "",
  "참여가 어려우신 경우에도 꼭 알려주세요.",
  `deetz 웹사이트 [내 지원 내역]에서 참여 포기를 눌러주시거나 회신해 주시면 됩니다.`,
  `${SITE}/applications`,
];

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

const RESUBMIT_EMAILS = new Set(["valerialkim@gmail.com"]);

const SUBJECT = {
  resubmit: `[deetz] 재촬영 영상 제출 안내 — ${DEADLINE}까지`,
  submitted: `[deetz] 릴스 챌린지 업로드 일자 확정 안내 — ${UPLOAD_DAY}`,
  pending: `[deetz] 릴스 챌린지 최종 마감 안내 — ${DEADLINE}까지`,
  declined: `[deetz] 릴스 챌린지 일정 연장 안내 — ${DEADLINE}까지`,
};

const PILL = { resubmit: "재촬영 제출 안내", submitted: "업로드 일자 확정", pending: "최종 마감 안내", declined: "일정 연장 안내" };

function uploadBox(handle, token) {
  return `<div style="margin:26px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장됩니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
</div>`;
}

function buildHtml(v, name, handle, token, email) {
  const intro = lines([`${name}님, 안녕하세요.`, "deetz 입니다.", "", ...INTRO[v]]);
  const box = v === "submitted" ? "" : uploadBox(handle, token);
  const body =
    intro +
    box +
    section("광고 인정 기준", CRITERIA) +
    section("꼭 확인해 주세요", LIABILITY) +
    section("안내", CLOSING);

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
  if (v !== "submitted") {
    out.push("[영상 업로드 - 본인 전용 링크]", `${SITE}/submit/${token}`,
      "로그인이나 회원가입은 필요 없습니다.", `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`, "");
  }
  out.push("[광고 인정 기준]", ...CRITERIA, "", "[꼭 확인해 주세요]", ...LIABILITY, "", "[안내]", ...CLOSING);
  return out.join("\n");
}

if (PREVIEW) {
  for (const v of ["submitted", "pending", "declined", "resubmit"]) {
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
  .select("id, status")
  .eq("project_id", PROJECT_ID)
  .is("archived_at", null)
  .in("status", ["accepted", "declined", "withdrawn"]);
const statusBy = new Map((apps ?? []).map((a) => [a.id, a.status]));

const { data: subs } = await db
  .from("project_submissions")
  .select("application_id, dancer_id, instagram_handle, display_name, token, uploaded_at")
  .eq("project_id", PROJECT_ID);
const { data: dancers } = await db
  .from("dancers")
  .select("id, profile_id")
  .in("id", (subs ?? []).map((s) => s.dancer_id).filter(Boolean));
const pidBy = new Map((dancers ?? []).map((d) => [d.id, d.profile_id]));
const { data: sentLog } = await db
  .from("project_notification_log")
  .select("recipient_id")
  .eq("project_id", PROJECT_ID)
  .eq("channel", CHANNEL);
const already = new Set((sentLog ?? []).map((l) => l.recipient_id));

const targets = [];
for (const s of subs ?? []) {
  const st = statusBy.get(s.application_id);
  if (!st || !s.token) continue;
  const pid = pidBy.get(s.dancer_id);
  if (!pid || already.has(pid)) continue;
  let variant = s.uploaded_at ? "submitted" : st === "accepted" ? "pending" : "declined";
  const { data: u } = await db.auth.admin.getUserById(pid);
  const email = u?.user?.email;
  if (!email) continue;
  // 재촬영 요청을 이미 드리고 회신까지 받은 분은 별도 문구로 보낸다.
  if (RESUBMIT_EMAILS.has(email.toLowerCase())) variant = "resubmit";
  targets.push({ pid, email, name: s.display_name ?? s.instagram_handle, handle: s.instagram_handle, token: s.token, variant });
}

const counts = targets.reduce((a, t) => ((a[t.variant] = (a[t.variant] ?? 0) + 1), a), {});
console.log(`\n대상 ${targets.length}명 — 제출완료 ${counts.submitted ?? 0} · 미제출 ${counts.pending ?? 0} · 포기 ${counts.declined ?? 0} · 재촬영 ${counts.resubmit ?? 0}`);

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
// 안내성(bulk) 메일이라 수신거부 헤더를 붙인다 — 신생 도메인 평판 방어.
// ⚠ 여기서 쓰는 토큰은 notification_preferences.unsubscribe_token 이다.
//   본문의 t.token(개인 업로드 링크)과 다른 값이니 섞지 말 것.
const unsubBy = await fetchUnsubscribePrefs(db, batch.map((t) => t.pid));

for (const t of batch) {
  try {
    const info = await tr.sendMail({
      from: `"deetz 에이전시 & 매거진" <${user}>`,
      to: t.email,
      subject: SUBJECT[t.variant],
      text: buildText(t.variant, t.name, t.handle, t.token),
      html: buildHtml(t.variant, t.name, t.handle, t.token, t.email),
      headers: listUnsubscribeHeaders(unsubBy.get(t.pid)?.token ?? null),
    });
    await db.from("project_notification_log").upsert(
      { project_id: PROJECT_ID, recipient_id: t.pid, channel: CHANNEL },
      { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true });
    ok += 1;
    console.log(`  ✓ [${t.variant}] ${t.email} ${info.messageId}`);
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (/550[- ]?5\.4\.5|Daily user sending limit|454[- ]?4\.7\.0|Too many login/i.test(msg)) {
      console.error(`\n⛔ Gmail 한도 도달로 중단. 여기까지 ${ok}건.`); break;
    }
    console.error(`  ✗ ${t.email} — ${msg}`);
  }
}
tr.close();
console.log(`\n발송 완료 ${ok}/${batch.length}건`);
