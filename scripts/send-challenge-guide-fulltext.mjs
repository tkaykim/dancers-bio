#!/usr/bin/env node
/**
 * 제작 가이드 전문을 메일 본문에 그대로 담아 보낸다.
 *
 * 왜: 노션 링크가 안 열린다는 회신이 2건 들어왔다(유수정·임금비).
 *     회신한 사람이 2명이면 말없이 못 본 사람은 더 많다. 링크 의존을 끊는다.
 *
 * 대상 = 확정(accepted) + 아직 제출 안 한 사람. 이미 낸 사람에게는 가지 않는다.
 * 멱등 = project_notification_log(channel='challenge_guide_fulltext').
 *
 *   node scripts/send-challenge-guide-fulltext.mjs
 *   node scripts/send-challenge-guide-fulltext.mjs --send --confirm-send=CHALLENGE_GUIDE_FULLTEXT
 *   node scripts/send-challenge-guide-fulltext.mjs --fixed-note=<email> --send --confirm-send=...
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
const CHANNEL = "challenge_guide_fulltext";
const CAMPAIGN = "challenge-guide-fulltext-2026-08";
const SITE = "https://www.deetz.kr";
const CONFIRM = "CHALLENGE_GUIDE_FULLTEXT";
const SUBJECT = "[deetz] 릴스 챌린지 제작 가이드 전문 안내 (링크 없이 바로 확인)";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--send");
const CONFIRM_ARG = argv.find((a) => a.startsWith("--confirm-send="))?.split("=")[1] ?? "";
const ONLY = argv.find((a) => a.startsWith("--only="))?.split("=")[1] ?? "";
// 가입 이메일 오타로 안내가 잘못 나간 분께는 사정을 함께 설명한다.
const FIXED_EMAIL = argv.find((a) => a.startsWith("--fixed-note="))?.split("=")[1] ?? "";

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

// 노션 가이드 전문을 줄글로 옮긴 것. 링크를 못 열어도 이것만 읽으면 촬영·업로드가 된다.
const SECTIONS = [
  ["이번 캠페인은", [
    "인스타그램 릴스 안에서 캠페인 공식 음원이 자연스럽게 반복 노출되도록 하는 챌린지입니다.",
    "전달드리는 댄스 포맷 중 1개를 골라 그대로 따라 제작해 주시면 됩니다.",
  ]],
  ["음원과 안무", [
    "영상 제작 시에는 전달드린 풀버전 음원만 사용해 주세요.",
    "활용 안무는 후보 3개 중 하나를 선택하시면 되며, 거울모드는 사용하지 않습니다.",
    "후보1 안무는 12~28초 구간을 활용합니다.",
    "",
    "후보1 안무는 공식 안무로 대외비 자료입니다.",
    "외부 공유 및 유출은 엄격히 금지되어 있습니다.",
  ]],
  ["업로드할 때 음원 선택 (가장 중요합니다)", [
    "업로드 시 인스타그램 오디오 탭에서 아래 공식 음원을 반드시 직접 선택해 주세요.",
    "",
    "곡명 : AI-DOL I Wash",
    "",
    "I Wash 만 검색하면 바로 안 나올 수 있습니다.",
    "이럴 때는 AI DOL 또는 ai dol I wash 로 검색해 주세요.",
    "",
    "음원 볼륨은 반드시 1 이상으로 설정해 주세요.",
    "0으로 두면 공식 음원이 연결되지 않습니다.",
    "공식 음원이 연결되지 않은 채 올라가면 재업로드를 요청드리게 됩니다.",
  ]],
  ["필수 해시태그", [
    "#광고",
    "#iwash",
    "#aidol",
    "",
    "#aidol 은 게시글과 댓글 중 어디에 넣으셔도 괜찮습니다.",
    "추가 해시태그나 캡션 문구가 생기면 업로드 전에 따로 안내드리겠습니다.",
  ]],
  ["필수 브랜드 계정 태그", [
    "@awc.ent",
  ]],
  ["표기하시면 안 되는 것", [
    "영상 자막, 게시글, 댓글 어디에도 아래 내용을 넣지 말아 주세요.",
    "",
    "AI WashCombo, AI 워시콤보 등 공식 음원 가사",
    "브랜드명",
    "제품명",
    "",
    "I Wash 는 사용하셔도 괜찮습니다.",
    "제품명과 겹치는 이슈가 있어 위 문구만 제외해 주시면 됩니다.",
  ]],
  ["영상에 담기면 안 되는 것", [
    "업로드 전 광고주 브랜드 검수가 진행됩니다.",
    "아래에 해당하면 수정 요청이 발생할 수 있습니다.",
    "",
    "선정적이거나 과도한 노출이 있는 장면",
    "폭력적이거나 위협적인 장면",
    "정치, 종교, 사회적 갈등과 연결되는 표현",
    "혐오, 비하, 조롱, 차별 표현",
    "위험 행위나 안전사고 우려가 있는 연출",
    "음주, 흡연, 도박, 약물 등 부적절한 소재",
    "미성년자, 아동, 반려동물에게 무리한 연출을 요구하는 장면",
    "타 브랜드 비방",
    "운전 중 촬영",
    "촬영 동의를 받지 않은 타인의 얼굴이 명확하게 노출되는 장면",
  ]],
  ["촬영 팁", [
    "가급적 자연광이 드는 야외나 댄스스튜디오, 연습실에서 촬영해 주세요.",
    "집에서 촬영하시더라도 앵글에 신경 써서 대충 찍은 영상처럼 보이지 않도록 부탁드립니다.",
  ]],
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

const FIXED_NOTE_LINES = [
  "안내가 늦어진 점 먼저 사과드립니다.",
  "가입 시 등록해 주신 이메일 주소의 마지막 숫자가 실제 주소와 달라, 그동안 안내 메일이 다른 주소로 발송되었습니다.",
  "확인 후 올바른 주소로 다시 보내드리니 이 메일부터 참고해 주세요.",
];

function buildHtml(name, handle, token, email, fixedNote) {
  const intro = lines([
    `${name}님, 안녕하세요.`,
    "deetz 입니다.",
    "",
    "제작 가이드 링크가 열리지 않는다는 문의가 있어, 가이드 전문을 메일 본문에 그대로 담아 다시 보내드립니다.",
    "링크를 열지 않으셔도 아래 내용만 확인하시면 촬영과 업로드가 가능합니다.",
  ]);

  const fixed = fixedNote
    ? `<div style="margin:22px 0 0;padding:16px;border:1px solid #fde68a;border-radius:12px;background:#fffbeb;">${lines(FIXED_NOTE_LINES)}</div>`
    : "";

  const upload = `<div style="margin:26px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장됩니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
</div>`;

  const closing = `<div style="margin:24px 0 0;">${lines([
    "궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다.",
    "일정이 맞지 않아 참여가 어려우시면 그것도 회신으로 알려주세요.",
    "알려주시는 데 어떤 불이익도 없습니다.",
  ])}</div>`;

  const body = intro + fixed + SECTIONS.map(([t, b]) => section(t, b)).join("") + upload + closing;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">제작 가이드 전문</span>${body}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:10px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div></td></tr>
</table></td></tr></table>${pixel(email)}</body></html>`;
}

function buildText(name, handle, token, fixedNote) {
  const out = [
    `${name}님, 안녕하세요.`,
    "deetz 입니다.",
    "",
    "제작 가이드 링크가 열리지 않는다는 문의가 있어 가이드 전문을 그대로 보내드립니다.",
    "",
  ];
  if (fixedNote) out.push(...FIXED_NOTE_LINES, "");
  for (const [t, b] of SECTIONS) out.push(`[${t}]`, ...b, "");
  out.push(
    "[영상 업로드 - 본인 전용 링크]",
    `${SITE}/submit/${token}`,
    "로그인이나 회원가입은 필요 없습니다.",
    `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`,
    "",
    "궁금하신 점은 이 메일로 회신 주세요.",
  );
  return out.join("\n");
}

// ── 대상 ────────────────────────────────────────────────────────
const { data: subs } = await db
  .from("project_submissions")
  .select("application_id, dancer_id, instagram_handle, display_name, token, uploaded_at")
  .eq("project_id", PROJECT_ID);
const { data: apps } = await db
  .from("applications")
  .select("id")
  .eq("project_id", PROJECT_ID)
  .eq("status", "accepted")
  .is("archived_at", null);
const accepted = new Set((apps ?? []).map((a) => a.id));
const { data: dancers } = await db
  .from("dancers")
  .select("id, profile_id")
  .in("id", (subs ?? []).map((s) => s.dancer_id).filter(Boolean));
const pidBy = new Map((dancers ?? []).map((d) => [d.id, d.profile_id]));
const { data: sent } = await db
  .from("project_notification_log")
  .select("recipient_id")
  .eq("project_id", PROJECT_ID)
  .eq("channel", CHANNEL);
const already = new Set((sent ?? []).map((l) => l.recipient_id));

const targets = [];
for (const s of subs ?? []) {
  if (!accepted.has(s.application_id) || s.uploaded_at || !s.token) continue;
  const pid = pidBy.get(s.dancer_id);
  if (!pid || already.has(pid)) continue;
  const { data: u } = await db.auth.admin.getUserById(pid);
  const email = u?.user?.email;
  if (!email) continue;
  if (ONLY && email.toLowerCase() !== ONLY.toLowerCase()) continue;
  targets.push({
    pid,
    email,
    name: s.display_name ?? s.instagram_handle,
    handle: s.instagram_handle,
    token: s.token,
  });
}

console.log(`\n가이드 전문 발송 대상 ${targets.length}명${ONLY ? ` (--only=${ONLY})` : ""}`);
for (const t of targets) {
  const mark = FIXED_EMAIL && t.email.toLowerCase() === FIXED_EMAIL.toLowerCase() ? "  ← 주소 정정 안내 포함" : "";
  console.log(`  · ${t.name} <${t.email}>${mark}`);
}

if (!targets.length) {
  console.log("\n보낼 대상이 없습니다.");
  process.exit(0);
}
if (!LIVE) {
  console.log(`\ndry-run 입니다. 실제 발송은 --send --confirm-send=${CONFIRM}`);
  process.exit(0);
}
if (CONFIRM_ARG !== CONFIRM) {
  console.error(`--confirm-send=${CONFIRM} 이 필요합니다.`);
  process.exit(1);
}

const user = process.env.DEETZ_GMAIL_USER;
const pass = process.env.DEETZ_GMAIL_APP_PASSWORD;
if (!user || !pass) {
  console.error("DEETZ_GMAIL_USER / DEETZ_GMAIL_APP_PASSWORD 미설정");
  process.exit(1);
}
const tr = nodemailer.createTransport({
  service: "gmail",
  auth: { user, pass },
  pool: true,
  maxConnections: 1,
  maxMessages: 100,
  rateDelta: 3000,
  rateLimit: 1,
});

let ok = 0;
for (const t of targets) {
  const fixedNote = Boolean(FIXED_EMAIL) && t.email.toLowerCase() === FIXED_EMAIL.toLowerCase();
  try {
    const info = await tr.sendMail({
      from: `"deetz 에이전시 & 매거진" <${user}>`,
      to: t.email,
      subject: SUBJECT,
      text: buildText(t.name, t.handle, t.token, fixedNote),
      html: buildHtml(t.name, t.handle, t.token, t.email, fixedNote),
    });
    await db.from("project_notification_log").upsert(
      { project_id: PROJECT_ID, recipient_id: t.pid, channel: CHANNEL },
      { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
    );
    ok += 1;
    console.log(`  ✓ ${t.email} ${info.messageId}`);
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (/550[- ]?5\.4\.5|Daily user sending limit|454[- ]?4\.7\.0|Too many login/i.test(msg)) {
      console.error(`\n⛔ Gmail 한도 도달로 중단합니다. 여기까지 ${ok}건.`);
      break;
    }
    console.error(`  ✗ ${t.email} — ${msg}`);
  }
}
tr.close();
console.log(`\n발송 완료 ${ok}/${targets.length}건`);
