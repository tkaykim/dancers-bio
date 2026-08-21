#!/usr/bin/env node
/**
 * 영상 검수 결과 안내 + 8/24 업로드 시간 기준.
 *
 * ⚠ 가이드라인 전문은 이미 두 번 나갔다(challenge_guideline_mail, challenge_upload_notice).
 *   여기서 새로 전하는 것은 두 가지뿐이라 본문을 그 둘에 집중시킨다.
 *     ① 검수 통과 — 지금까지 어떤 메일도 결과를 알린 적이 없다
 *     ② 8/24 하루 중 아무 시각이나 가능하다는 사실 — 날짜만 갔고 시간 기준은 안 갔다
 *   나머지 기준은 세 줄 리마인드 + 링크로 줄인다.
 *
 * 대상은 제출자 중 시트에 검수 결과가 있는 사람만이다.
 *   pass     — 검수 통과. 그대로 올리시면 된다고 알린다.
 *   recheck  — 담당자 추가 의견이 있음. 결과를 단정하지 않고 검수중이라고 알린다.
 * 미제출자는 대상에서 뺀다. 8/19 에 마감 안내가 이미 나갔고, 또 보내면 재촉으로만 읽힌다.
 *
 * 검수 결과는 담당자가 관리하는 구글 시트에서 뽑은 CSV 를 읽는다(핸들,결과,비고).
 * 시트를 정본으로 삼고 여기서 판정하지 않는다. 시트에 행이 없으면 발송하지 않는다.
 *
 * 멱등 = project_notification_log(channel='challenge_review_result').
 * 기본 dry-run. 실발송은 --send --confirm-send=CHALLENGE_REVIEW_RESULT.
 *
 *   node scripts/send-challenge-review-result.mjs            # 대상 집계
 *   node scripts/send-challenge-review-result.mjs --preview  # 변형별 본문 전문
 *   node scripts/send-challenge-review-result.mjs --send --confirm-send=CHALLENGE_REVIEW_RESULT
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
const CHANNEL = "challenge_review_result";
const CAMPAIGN = "challenge-review-result-2026-08";
const CONFIRM = "CHALLENGE_REVIEW_RESULT";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const REVIEW_CSV =
  process.env.REVIEW_CSV || "C:/Users/tkay/Desktop/deliverables/challenge-review-results.csv";
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
  pass: [
    "보내주신 영상 검수가 끝났습니다.",
    "",
    "수정하실 부분 없이 통과되었습니다.",
    `이제 ${UPLOAD_DAY}에 본인 인스타그램 계정에 올려주시기만 하면 됩니다.`,
  ],
  recheck: [
    "보내주신 재촬영 영상 잘 받았습니다.",
    "",
    "현재 검수를 진행하고 있고, 결과가 나오는 대로 따로 연락드리겠습니다.",
    "",
    `업로드 일자와 기준은 동일하니 ${UPLOAD_DAY} 업로드를 염두에 두시고 아래 내용을 확인해 주세요.`,
  ],
};

// ── 업로드 시간 기준 (이번에 처음 안내하는 내용) ──────────────────
const UPLOAD_TIME = [
  `${UPLOAD_DAY} 하루 중 편하신 시간에 올려주시면 됩니다.`,
  "새벽이든 늦은 밤이든 상관없습니다.",
  "",
  "기준은 게시 시각이 '8월 24일' 이어야 하는 점 꼭 인지 부탁드려요!",
  "",
  "8월 24일 새벽 2시 — 인정됩니다.",
  "8월 25일 새벽 2시 — 인정되지 않습니다.",
  "",
  "날짜가 넘어가지 않도록 자정 전에 올려주세요.",
];

// ── 전원 공통 ────────────────────────────────────────────────────
// 전문은 이미 두 번 보냈다. 여기서는 빠지기 쉬운 세 가지만 다시 짚는다.
const CRITERIA = [
  "이미 안내드린 내용이지만, 하나라도 빠지면 광고 건으로 인정되지 않습니다.",
  "",
  "음원 : 인스타그램 오디오 탭에서 'AI-DOL I Wash' 를 직접 선택, 볼륨 1 이상",
  "       (가급적 잘 들리도록 업로드 전 한번 더 체크 부탁드립니다)",
  "해시태그 : #광고 #iwash #aidol",
  "계정 태그 : @awc.ent",
  "",
  "전체 가이드",
  GUIDE_URL,
];

const LIABILITY = [
  "가이드라인은 광고주가 정한 기준이라 저희가 조정할 수 없는 부분입니다.",
  "지키지 않았거나 확인하지 못하여 광고주 측에서 인정하지 않는 경우,",
  "저희가 페이 지급을 보장해 드리기 어렵습니다.",
];

const CLOSING = {
  pass: [
    "궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다.",
    "",
    `업로드해 주시면 ${UPLOAD_DAY} 중으로 저희가 확인하겠습니다.`,
  ],
  recheck: ["궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다."],
};

const SUBJECT = {
  pass: `[deetz] 영상 검수 완료 — ${UPLOAD_DAY} 업로드 안내`,
  recheck: `[deetz] 재촬영 영상 접수 완료 — ${UPLOAD_DAY} 업로드 안내`,
};

const PILL = { pass: "검수 완료", recheck: "재촬영 접수" };

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
    section("업로드 시간", UPLOAD_TIME) +
    section("업로드 전 마지막 확인", CRITERIA) +
    section("꼭 확인해 주세요", LIABILITY) +
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
  out.push(
    "[업로드 시간]", ...UPLOAD_TIME, "",
    "[업로드 전 마지막 확인]", ...CRITERIA, "",
    "[꼭 확인해 주세요]", ...LIABILITY, "",
    "[안내]", ...CLOSING[v],
  );
  return out.join("\n");
}

if (PREVIEW) {
  for (const v of ["pass", "recheck"]) {
    console.log("\n" + "=".repeat(72));
    console.log(`[${v}] 제목: ${SUBJECT[v]}`);
    console.log("=".repeat(72));
    console.log(buildText(v, "홍길동", "example_handle", "TOKEN"));
  }
  process.exit(0);
}

// ── 검수 결과(담당자 시트 정본) ──────────────────────────────────
const review = new Map();
for (const line of readFileSync(REVIEW_CSV, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
  if (!line.trim()) continue;
  const [handle, result] = line.split(",");
  if (handle) review.set(handle.trim().toLowerCase(), (result ?? "").trim());
}
console.log(`검수 시트 ${review.size}명 로드 (${REVIEW_CSV})`);

// ── 대상 ────────────────────────────────────────────────────────
const { data: apps } = await db
  .from("applications")
  .select("id, status")
  .eq("project_id", PROJECT_ID)
  .is("archived_at", null)
  .eq("status", "accepted");
const accepted = new Set((apps ?? []).map((a) => a.id));

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
const skipped = [];
for (const s of subs ?? []) {
  if (!accepted.has(s.application_id) || !s.token) continue;
  const pid = pidBy.get(s.dancer_id);
  if (!pid || already.has(pid)) continue;

  // 미제출자는 대상이 아니다. 8/19 마감 안내가 이미 나갔다.
  if (!s.uploaded_at) continue;

  const r = review.get((s.instagram_handle ?? "").toLowerCase());
  if (r === undefined) {
    // 제출은 됐는데 시트에 없다 = 아직 검수 전. 결과를 지어내지 않고 건너뛴다.
    skipped.push(`${s.display_name ?? s.instagram_handle} (@${s.instagram_handle}) — 시트에 검수 행 없음`);
    continue;
  }
  const variant = r.startsWith("A") ? "pass" : "recheck";

  const { data: u } = await db.auth.admin.getUserById(pid);
  const email = u?.user?.email;
  if (!email) { skipped.push(`${s.display_name ?? s.instagram_handle} — 이메일 없음`); continue; }
  targets.push({ pid, email, name: s.display_name ?? s.instagram_handle, handle: s.instagram_handle, token: s.token, variant });
}

const counts = targets.reduce((a, t) => ((a[t.variant] = (a[t.variant] ?? 0) + 1), a), {});
console.log(`\n대상 ${targets.length}명 — 검수통과 ${counts.pass ?? 0} · 재검수 ${counts.recheck ?? 0} · 미제출 ${counts.pending ?? 0}`);
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
