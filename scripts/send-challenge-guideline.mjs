#!/usr/bin/env node
/**
 * 릴스 챌린지 참여 확정 안내 메일 — 제작 가이드라인 + 본인 전용 업로드 링크.
 *
 * 기본은 dry-run 이다. 실제 발송은 --send --confirm-send=CHALLENGE_GUIDELINE 가 모두 있을 때만.
 * (레포의 send-approval-welcome.mjs 와 같은 관례)
 *
 * Gmail 한도 방어 — 이 계정에서 과거에 두 번 터졌다(INTEGRATIONS.md):
 *   1) 454-4.7.0 Too many login attempts  → pool 연결 + maxConnections=1 로 로그인 재사용
 *   2) 550-5.4.5 Daily user sending limit → 08-05 300통 + 08-06 210통 = 누적 510통에서 도달.
 *      실질 한도는 하루 약 500통이다. --limit 으로 나눠 보내고, 한도 에러를 만나면
 *      **즉시 전체 중단**한다. 계속 두드리면 계정이 더 오래 잠긴다.
 *
 * 멱등: project_notification_log (PK = project_id + recipient_id + channel).
 *   새 테이블·새 컬럼을 만들지 않는다. 중간에 끊겨도 그냥 다시 실행하면 남은 대상만 이어서 보낸다.
 *
 * ⚠ 외부 이미지를 쓰지 않는다. 2026-08-06 Supabase Storage egress 사고 때문에
 *   대량 발송 메일에서 SNS 아이콘을 뺐다(profile-nudge.mjs 와 동일 방침).
 *
 * 사용:
 *   node scripts/send-challenge-guideline.mjs                                   # 대상 확인 (dry-run)
 *   node scripts/send-challenge-guideline.mjs --limit=5
 *   node scripts/send-challenge-guideline.mjs --limit=5 --send --confirm-send=CHALLENGE_GUIDELINE
 */

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── env 로드 (.env.local) ────────────────────────────────────────
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 파일 없으면 무시 */
  }
}

const PROJECT_ID = "06232945-3563-431e-b399-edc6c7b21dc5";
const CHANNEL = "challenge_guideline_mail";
const SITE = "https://www.deetz.kr";
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";
const SUBJECT = "[deetz] 릴스 챌린지 참여 확정 — 제작 가이드라인 및 영상 업로드 안내";
const CONFIRM = "CHALLENGE_GUIDELINE";

const argv = process.argv.slice(2);
const LIVE = argv.includes("--send");
const CONFIRM_ARG = argv.find((a) => a.startsWith("--confirm-send="))?.split("=")[1] ?? "";
const LIMIT = Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0") || 9999;
// --accept: 신규 pending 지원자를 자동 수락한다(무인 운영용).
// 모집 정원을 넘지 않도록 상한을 지킨다.
const AUTO_ACCEPT = argv.includes("--accept");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── 인스타 핸들 정규화 ────────────────────────────────────────────
export function toHandle(raw) {
  if (!raw) return null;
  let v = String(raw).trim().replace(/^@/, "");
  v = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  v = v.split(/[?#]/)[0].replace(/\/+$/, "").split("/")[0];
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v.toLowerCase() : null;
}

// ── 열람 추적 픽셀 ────────────────────────────────────────────────
// 기존 인프라를 그대로 쓴다: GET /api/track/open?c&e&s → email_opens 적재.
// 서명 키는 deetz SUPABASE_SERVICE_ROLE_KEY (route.ts:52 와 동일 값).
const CAMPAIGN = "challenge-guideline-2026-08";

function trackingPixel(email) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "";
  const e = Buffer.from(email, "utf8").toString("base64url");
  const s = createHmac("sha256", key).update(`${CAMPAIGN}|${email}`).digest("base64url");
  const url = `${SITE}/api/track/open?c=${encodeURIComponent(CAMPAIGN)}&e=${e}&s=${s}`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;">`;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 본문 ─────────────────────────────────────────────────────────
// 업로드 버튼은 가이드·필수사항·금지사항을 전부 지난 뒤에 나온다.
// 위에 두면 가이드를 안 읽고 올려버린다(대표 피드백 2026-08-14).
const SECTIONS = [
  ["일정", [
    "영상 원본 제출 : 8월 23일(일) 23:59까지",
    "인스타그램 릴스 업로드 : 8월 24일(월)",
    "   검수 소요 시간에 따라 8월 25일(화)로 변경될 가능성이 있습니다.",
    "",
    "안내된 8/24~8/25 외 일정에 게시되면 광고 건으로 인정되지 않을 수 있습니다.",
  ]],
  ["제작 가이드 (촬영 전 필독)", [
    "음원, 활용 안무, 촬영 유의사항이 모두 정리되어 있습니다.",
    GUIDE_URL,
  ]],
  ["광고 인정 기준 (지키지 않으면 인정되지 않을 수 있습니다)", [
    "1. 인스타그램 오디오 탭에서 캠페인 공식 음원을 직접 선택해 주세요.",
    "   곡명 : AI-DOL I Wash",
    "   검색이 안 되면 'AI DOL' 또는 'ai dol I wash' 로 찾아주세요.",
    "2. 음원 볼륨을 1 이상으로 설정해 주세요.",
    "   볼륨이 너무 작으면 시스템이 음원 사용으로 인식하지 못합니다. 잘 들리도록 설정해 주세요.",
    "3. 필수 해시태그를 넣어주세요.",
    "   #광고 #iwash #aidol",
    "   #aidol 은 게시글과 댓글 중 어디에 넣으셔도 괜찮습니다.",
    "4. 브랜드 계정을 태그해 주세요.",
    "   @awc.ent",
    "5. 8월 24일(월)에 업로드해 주세요.",
    "   검수 일정에 따라 8월 25일(화)로 변경될 수 있으며, 변경되면 따로 안내드립니다.",
    "   안내된 날짜 외에 게시되면 광고 건으로 인정되지 않을 수 있습니다.",
  ]],
  ["표기하시면 안 되는 것", [
    "영상 자막, 게시글, 댓글 어디에도 아래 내용을 넣지 말아 주세요.",
    "",
    "AI WashCombo, AI 워시콤보 등 공식 음원 가사",
    "브랜드명과 제품명",
    "",
    "'I Wash' 는 사용하셔도 됩니다.",
  ]],
  ["영상에 담기면 안 되는 것", [
    "업로드 전 광고주 브랜드 검수가 진행됩니다.",
    "아래에 해당하면 수정 요청을 드릴 수 있습니다.",
    "",
    "선정적이거나 과도한 노출, 폭력적이거나 위협적인 장면",
    "정치·종교·사회적 갈등, 혐오·비하·차별 표현",
    "위험 행위나 안전사고 우려가 있는 연출",
    "음주·흡연·도박·약물",
    "미성년자·아동·반려동물에게 무리한 연출",
    "타 브랜드 비방, 운전 중 촬영",
    "촬영 동의를 받지 않은 타인의 얼굴이 명확히 노출되는 장면",
  ]],
  ["촬영 팁", [
    "가급적 자연광이 드는 야외나 댄스스튜디오, 연습실에서 촬영해 주세요.",
    "집에서 촬영하시더라도 앵글에 신경 써서 '대충 찍은 영상'처럼 보이지 않도록 부탁드립니다.",
  ]],
];

const CLOSING = [
  "전달드리는 음원과 안무 자료는 대외비입니다.",
  "외부 공유 및 유출은 엄격히 금지되어 있습니다.",
  "",
  "가이드라인에서 크게 벗어나 광고주 측에서 인정하지 않는 경우 페이 지급이 어려울 수 있습니다.",
  "궁금하신 점은 이 메일로 회신 주시면 안내드리겠습니다.",
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

function section(title, body) {
  return `<div style="margin:24px 0 0;"><div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">${esc(title)}</div>${lines(body)}</div>`;
}

function buildHtml(name, handle, token, email) {
  const intro = lines([
    `${name}님, 안녕하세요.`,
    "deetz 입니다.",
    "",
    "릴스 챌린지 참여가 확정되어 제작 가이드라인과 영상 업로드 방법을 안내드립니다.",
    "촬영 전에 아래 내용을 꼭 끝까지 읽어봐 주세요.",
  ]);

  const uploadBox = `<div style="margin:26px 0 0;padding:18px;border:1px solid #ececef;border-radius:14px;background:#fafafa;">
<div style="font-size:13px;font-weight:800;color:#111;margin-bottom:8px;">영상 업로드 (본인 전용 링크)</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">위 가이드를 모두 확인하셨다면 아래 버튼으로 영상을 올려주세요.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">로그인이나 회원가입은 필요 없습니다.</div>
<div style="font-size:14px;line-height:1.7;color:#33363b;">파일 이름은 자동으로 <b>${esc(handle)}</b> 으로 저장되니 직접 바꾸실 필요 없습니다.</div>
<div style="margin-top:14px;"><a href="${SITE}/submit/${esc(token)}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">영상 올리러 가기</a></div>
<div style="font-size:12px;color:#6b7280;margin-top:10px;">본인에게만 발급된 링크입니다. 다른 분과 공유하지 말아 주세요.</div>
</div>`;

  const body =
    intro + SECTIONS.map(([t, b]) => section(t, b)).join("") + uploadBox + section("안내", CLOSING);

  // 외부 이미지 없음 (2026-08-06 Storage egress 사고 이후 방침)
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;"><div style="font-size:26px;font-weight:800;color:#111;line-height:1;">deetz<span style="color:#d4d4d8;">.</span></div><div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 28px;color:#111;"><span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">참여 확정 안내</span>${body}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;"><div style="font-size:16px;font-weight:800;color:#111;">deetz<span style="color:#d4d4d8;">.</span></div>
<div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:10px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
<div style="font-size:11px;color:#a1a1aa;margin-top:12px;">© 2026 deetz. All rights reserved.</div></td></tr>
</table></td></tr></table>${trackingPixel(email)}</body></html>`;
}

function buildText(name, handle, token) {
  const out = [`${name}님, 안녕하세요.`, "deetz 입니다.", "", "릴스 챌린지 참여가 확정되어 제작 가이드라인과 영상 업로드 방법을 안내드립니다.", ""];
  for (const [t, b] of SECTIONS) out.push(`[${t}]`, ...b, "");
  out.push(
    "[영상 업로드 - 본인 전용 링크]",
    "위 가이드를 모두 확인하신 뒤 아래 링크로 올려주세요.",
    `${SITE}/submit/${token}`,
    "로그인이나 회원가입은 필요 없습니다.",
    `파일 이름은 자동으로 ${handle} 으로 저장됩니다.`,
    "",
    ...CLOSING,
  );
  return out.join("\n");
}

// ── 신규 지원자 자동 수락 ─────────────────────────────────────────
// 무인 실행이므로 정원(recruitment_count)을 절대 넘지 않게 상한을 지킨다.
async function autoAccept() {
  const { data: project } = await db
    .from("projects")
    .select("recruitment_count, status")
    .eq("id", PROJECT_ID)
    .maybeSingle();
  const cap = project?.recruitment_count ?? 0;

  const { count: acceptedNow } = await db
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("project_id", PROJECT_ID)
    .eq("status", "accepted")
    .is("archived_at", null);

  const room = cap - (acceptedNow ?? 0);
  if (room <= 0) {
    console.log(`정원 ${cap}명 도달(현재 ${acceptedNow}명). 추가 수락하지 않습니다.`);
    return 0;
  }

  const { data: pend } = await db
    .from("applications")
    .select("id")
    .eq("project_id", PROJECT_ID)
    .eq("status", "pending")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(room);
  if (!pend?.length) return 0;

  // 앱의 수락 서버액션과 동일하게 responded_at 을 함께 채운다.
  const { error } = await db
    .from("applications")
    .update({ status: "accepted", responded_at: new Date().toISOString(), rejection_reason: null })
    .in("id", pend.map((p) => p.id));
  if (error) throw new Error(`자동 수락 실패: ${error.message}`);
  console.log(`신규 지원자 ${pend.length}명 자동 수락 (정원 ${cap} / 여유 ${room})`);
  return pend.length;
}

// ── 대상 조회 ────────────────────────────────────────────────────
async function loadTargets() {
  const problems = [];

  const { data: apps, error } = await db
    .from("applications")
    .select("id, dancer_id")
    .eq("project_id", PROJECT_ID)
    .eq("status", "accepted")
    .is("archived_at", null);
  if (error) throw new Error(`지원서 조회 실패: ${error.message}`);
  if (!apps?.length) return { targets: [], problems, accepted: 0, mailed: 0 };

  const { data: dancers } = await db
    .from("dancers")
    .select("id, stage_name, korean_name, profile_id, social_links")
    .in("id", apps.map((a) => a.dancer_id));
  const byId = new Map((dancers ?? []).map((d) => [d.id, d]));

  const [{ data: subs }, { data: logs }] = await Promise.all([
    db.from("project_submissions").select("application_id, token").eq("project_id", PROJECT_ID),
    db.from("project_notification_log").select("recipient_id").eq("project_id", PROJECT_ID).eq("channel", CHANNEL),
  ]);
  const subByApp = new Map((subs ?? []).map((s) => [s.application_id, s]));
  const mailedSet = new Set((logs ?? []).map((l) => l.recipient_id));

  const seen = new Map();
  const rows = [];
  const toCreate = [];

  for (const a of apps) {
    const d = byId.get(a.dancer_id);
    const name = (d?.korean_name ?? "").trim() || d?.stage_name || "(이름없음)";
    if (!d?.profile_id) {
      problems.push(`${name}: deetz 계정 미연결(profile_id 없음)`);
      continue;
    }
    const handle = toHandle(d.social_links?.instagram);
    if (!handle) {
      problems.push(`${name}: 인스타그램 링크 없음 또는 형식 이상`);
      continue;
    }
    const dup = seen.get(handle);
    if (dup) {
      // 파일명이 겹치면 Drive 에서 누구 영상인지 구분할 수 없다 → 발송 자체를 막는다.
      problems.push(`인스타 핸들 중복 @${handle} — ${dup} / ${name}`);
      continue;
    }
    seen.set(handle, name);

    const { data: u } = await db.auth.admin.getUserById(d.profile_id);
    const email = u?.user?.email;
    if (!email) {
      problems.push(`${name}: 이메일 없음`);
      continue;
    }

    let token = subByApp.get(a.id)?.token ?? null;
    if (!token) toCreate.push({ project_id: PROJECT_ID, application_id: a.id, dancer_id: d.id, instagram_handle: handle, display_name: name });

    rows.push({ appId: a.id, profileId: d.profile_id, email, name, handle, token, mailed: mailedSet.has(d.profile_id) });
  }

  // 제출창구가 없는 확정자에게 행을 만들어 준다(append only).
  if (toCreate.length) {
    const { error: insErr } = await db.from("project_submissions").insert(toCreate);
    if (insErr) throw new Error(`제출창구 생성 실패: ${insErr.message}`);
    const { data: re } = await db.from("project_submissions").select("application_id, token").eq("project_id", PROJECT_ID);
    const m = new Map((re ?? []).map((s) => [s.application_id, s.token]));
    for (const r of rows) if (!r.token) r.token = m.get(r.appId) ?? null;
    console.log(`제출창구 ${toCreate.length}건 신규 생성`);
  }

  const targets = rows.filter((r) => !r.mailed && r.token);
  return { targets, problems, accepted: rows.length, mailed: rows.filter((r) => r.mailed).length };
}

function isQuotaError(msg) {
  return /550[- ]?5\.4\.5|Daily user sending limit|454[- ]?4\.7\.0|Too many login attempts|Quota exceeded/i.test(msg);
}

// ── 실행 ─────────────────────────────────────────────────────────
if (AUTO_ACCEPT) await autoAccept();

const { targets, problems, accepted, mailed } = await loadTargets();

// 문제 있는 사람은 그 사람만 건너뛴다.
// 예전에는 한 명만 이상해도 전체 발송을 멈췄는데, 30분마다 무인으로 도는 지금 구조에서는
// 그러면 한 명 때문에 나머지 전원이 계속 안 나간다.
if (problems.length) {
  console.log("\n⚠ 건너뛴 대상:");
  for (const p of problems) console.log("  -", p);
}

const batch = targets.slice(0, LIMIT);
console.log(
  `\n확정자 ${accepted}명 / 이미발송 ${mailed}명 / 미발송 ${targets.length}명 / 이번 회차 ${batch.length}명 (--limit=${LIMIT === 9999 ? "제한없음" : LIMIT})`,
);
for (const t of batch) console.log(`  · ${t.name} <${t.email}> @${t.handle}`);

if (!batch.length) {
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

const gmailUser = process.env.DEETZ_GMAIL_USER;
const gmailPass = process.env.DEETZ_GMAIL_APP_PASSWORD;
if (!gmailUser || !gmailPass) {
  console.error("DEETZ_GMAIL_USER / DEETZ_GMAIL_APP_PASSWORD 미설정");
  process.exit(1);
}

// pool 연결 — 메일마다 로그인하지 않게. 454 Too many login attempts 방어.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: gmailUser, pass: gmailPass },
  pool: true,
  maxConnections: 1,
  maxMessages: 100,
  rateDelta: 3000,
  rateLimit: 1,
});

let sent = 0;
for (const t of batch) {
  try {
    // 업로드 링크가 개인 전용이므로 반드시 1인 1통으로 보낸다.
    const info = await transporter.sendMail({
      from: `"deetz 에이전시 & 매거진" <${gmailUser}>`,
      to: t.email,
      subject: SUBJECT,
      text: buildText(t.name, t.handle, t.token),
      html: buildHtml(t.name, t.handle, t.token, t.email),
    });
    // 성공 즉시 기록한다. 중간에 끊겨도 여기까지는 남아 재실행 시 건너뛴다.
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
      // 계속 두드리면 계정이 더 오래 잠긴다 → 즉시 전체 중단.
      console.error(`\n⛔ Gmail 한도 도달로 중단합니다: ${msg}`);
      console.error(`   여기까지 ${sent}건. 한도 리셋 후 같은 명령을 다시 실행하면 남은 대상만 이어서 보냅니다.`);
      break;
    }
    console.error(`  ✗ ${t.email} — ${msg}`);
  }
}
transporter.close();
console.log(`\n발송 완료 ${sent}/${batch.length}건`);
