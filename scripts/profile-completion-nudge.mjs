#!/usr/bin/env node
/**
 * 프로필 보완 안내 메일 — 승인 대기 중인데 승인 기준(2026-09-11 대표 지시)에 못 미치는 댄서에게
 * "무엇을 채우면 승인되는지" 항목별로 안내한다.
 *
 * 승인 기준 = ① 프로필 사진 ② SNS 계정 1개 이상 연결 ③ 경력 또는 포트폴리오 1건 이상.
 * 셋을 다 갖춘 사람은 이미 일괄 승인됐고(admin_bulk_approve_dancers), 여기서는 하나라도 빠진 사람만 대상이다.
 *
 * 기본 dry-run. 실발송은 send --confirm-send=PROFILE_COMPLETION 일 때만.
 *   node scripts/profile-completion-nudge.mjs plan                       # 대상 현황
 *   node scripts/profile-completion-nudge.mjs test you@example.com       # 테스트 1통
 *   node scripts/profile-completion-nudge.mjs send --max 50 --confirm-send=PROFILE_COMPLETION
 *
 * 발송 안전장치 (INTEGRATIONS.md 대량발송 주의 반영):
 *   - pool 연결 maxConnections=1 (454-4.7.0 Too many login attempts 방지)
 *   - 통당 2.5초 페이싱, --max 로 회차 상한
 *   - 일일 한도(550-5.4.5) / 로그인 제한(454) 에러를 만나면 즉시 전체 중단
 *   - 멱등 = career_reminder_log(dancer_id, stage='profile_completion_202609') DB 원장 (로컬 파일 X)
 *   - 수신거부(notification_preferences.email_unsubscribed_all) 제외 + List-Unsubscribe 원클릭 헤더
 */

import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { fetchUnsubscribePrefs, listUnsubscribeHeaders, unsubscribeUrl } from "./lib/list-unsubscribe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = {};
  for (const f of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(join(__dirname, "..", f), "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {}
  }
  return env;
}
const ENV = loadEnv();

const STAGE = "profile_completion_202609";
const CAMPAIGN = "deetz-profile-completion-2026-09";
const MAIL_USER = ENV.DEETZ_GMAIL_USER || ENV.GMAIL_USER;
const MAIL_PASS = ENV.DEETZ_GMAIL_APP_PASSWORD || ENV.GMAIL_APP_PASSWORD;
const MAIL_FROM_NAME = ENV.DEETZ_GMAIL_FROM_NAME || "deetz 에이전시 & 매거진";
const REPLY_TO = "contact@deetz.kr";
const EDIT_URL = "https://deetz.kr/me/portfolio";
const TEST_PATTERN = /(^|[^a-z])e2e|test|테스트/i;
const CSVLOG = join(__dirname, "profile-completion-log.csv");
const PACE_MS = 2500;
const STOP_PATTERNS = [/5\.4\.5/, /Daily user sending limit/i, /quota/i, /4\.7\.0/, /Too many login attempts/i];

if (!ENV.NEXT_PUBLIC_SUPABASE_URL || !ENV.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE env 누락 (.env.local)");
  process.exit(1);
}
const db = createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function trackingPixel(email) {
  const e = Buffer.from(email, "utf8").toString("base64url");
  const s = createHmac("sha256", ENV.SUPABASE_SERVICE_ROLE_KEY).update(`${CAMPAIGN}|${email}`).digest("base64url");
  const url = `https://deetz.kr/api/track/open?c=${encodeURIComponent(CAMPAIGN)}&e=${e}&s=${s}`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">`;
}

// ── 대상 수집 (PostgREST 1,000행 상한 → 페이지 루프) ────────────────
async function fetchAll(table, cols, apply) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function listAuthUsers(ids) {
  // listUsers(perPage 1000) 가 "Database error finding users" 로 실패해 개별 조회로 대체 (동시 5건).
  const users = new Map();
  const queue = [...new Set(ids.filter(Boolean))];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const { data } = await db.auth.admin.getUserById(id);
      if (data?.user) users.set(id, data.user);
    }
  }));
  return users;
}

function hasSns(dancer, profile) {
  if (profile?.instagram_handle && profile.instagram_handle.trim()) return true;
  const links = dancer.social_links;
  if (links && typeof links === "object" && !Array.isArray(links)) {
    return Object.values(links).some((v) => typeof v === "string" && v.trim());
  }
  return false;
}

async function collectTargets() {
  const dancers = await fetchAll(
    "dancers",
    "id, profile_id, stage_name, korean_name, profile_img, social_links, portfolio, portfolio_file_url, is_active, archived_at, created_at",
    (q) => q.eq("approval_status", "pending").eq("is_active", true).not("profile_id", "is", null).order("created_at", { ascending: true }),
  );
  const profileIds = [...new Set(dancers.map((d) => d.profile_id).filter(Boolean))];
  const profiles = new Map();
  for (let i = 0; i < profileIds.length; i += 200) {
    const { data, error } = await db
      .from("profiles")
      .select("id, display_name, instagram_handle, preferred_lang")
      .in("id", profileIds.slice(i, i + 200));
    if (error) throw new Error(`profiles: ${error.message}`);
    for (const p of data ?? []) profiles.set(p.id, p);
  }
  const careerBy = new Map();
  for (const c of await fetchAll("careers", "dancer_id")) careerBy.set(c.dancer_id, (careerBy.get(c.dancer_id) ?? 0) + 1);

  const sentRows = await fetchAll("career_reminder_log", "dancer_id, status", (q) => q.eq("stage", STAGE));
  const alreadySent = new Set(sentRows.filter((r) => r.status === "sent").map((r) => r.dancer_id));

  const users = await listAuthUsers(profileIds);
  const prefs = await fetchUnsubscribePrefs(db, profileIds);

  const excluded = { archived: 0, test_account: 0, complete: 0, already_sent: 0, no_email: 0, unsubscribed: 0 };
  const targets = [];
  for (const d of dancers) {
    if (d.archived_at) { excluded.archived += 1; continue; }
    if (TEST_PATTERN.test(d.stage_name ?? "")) { excluded.test_account += 1; continue; }
    const profile = profiles.get(d.profile_id);
    const photo = !!(d.profile_img && String(d.profile_img).trim());
    const sns = hasSns(d, profile);
    const careers = careerBy.get(d.id) ?? 0;
    const portfolio = (Array.isArray(d.portfolio) && d.portfolio.length > 0) || !!d.portfolio_file_url;
    const work = careers > 0 || portfolio;
    if (photo && sns && work) { excluded.complete += 1; continue; }
    if (alreadySent.has(d.id)) { excluded.already_sent += 1; continue; }
    const user = users.get(d.profile_id);
    const email = user?.email ?? null;
    if (!email) { excluded.no_email += 1; continue; }
    const pref = prefs.get(d.profile_id);
    if (pref?.unsubscribedAll) { excluded.unsubscribed += 1; continue; }
    targets.push({
      dancer: d,
      email,
      name: (d.stage_name || profile?.display_name || d.korean_name || "댄서").trim(),
      lang: profile?.preferred_lang ?? null,
      lastLogin: user?.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0,
      missing: { photo: !photo, sns: !sns, work: !work },
      token: pref?.token ?? null,
    });
  }
  // 최근 로그인한 사람부터 — 열어볼 확률이 높은 수신자를 먼저 보내는 편이 발신 평판에 유리하다.
  targets.sort((a, b) => b.lastLogin - a.lastLogin || new Date(b.dancer.created_at) - new Date(a.dancer.created_at));
  return { targets, excluded };
}

// ── 본문 ─────────────────────────────────────────────────────────
const ITEMS = {
  photo: { ko: "프로필 사진", en: "a profile photo", hint: "얼굴이 잘 보이는 대표 사진 1장이면 충분합니다." },
  sns: { ko: "SNS 계정 연결", en: "at least one social account (Instagram, YouTube, TikTok)", hint: "인스타그램·유튜브·틱톡 중 하나면 됩니다." },
  work: { ko: "경력 또는 포트폴리오", en: "at least one career entry or portfolio link/file", hint: "참여한 안무·공연·영상 1건, 또는 포트폴리오 링크·파일 1개면 됩니다." },
};

function missingList(missing) {
  return Object.keys(ITEMS).filter((k) => missing[k]);
}

function checkRow(label, done, hint) {
  const icon = done
    ? `<span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:#e7f6ec;color:#0f7b3f;font-size:13px;font-weight:800;text-align:center;line-height:20px;">✓</span>`
    : `<span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:#fdecec;color:#d14343;font-size:13px;font-weight:800;text-align:center;line-height:20px;">!</span>`;
  const status = done
    ? `<span style="color:#0f7b3f;font-weight:700;">완료</span>`
    : `<span style="color:#d14343;font-weight:700;">필요</span>`;
  return `<tr>
    <td style="width:28px;padding:9px 0;vertical-align:top;">${icon}</td>
    <td style="padding:9px 0;vertical-align:top;">
      <div style="font-size:14px;font-weight:700;color:#111111;line-height:1.4;">${esc(label)} · ${status}</div>
      <div style="font-size:12.5px;color:#6b7280;line-height:1.6;margin-top:2px;">${esc(hint)}</div>
    </td></tr>`;
}

export function buildEmail(t) {
  const name = t.name || "댄서";
  const miss = missingList(t.missing);
  const missKo = miss.map((k) => ITEMS[k].ko).join(" · ");
  const missEn = miss.map((k) => ITEMS[k].en).join(", ");
  const unsub = t.token ? unsubscribeUrl(t.token) : null;

  const subject = `[deetz] ${name}님, ${missKo}만 채우시면 프로필이 승인됩니다`;

  const text = [
    `안녕하세요 ${name}님, deetz입니다.`,
    `등록해 주신 프로필을 확인했습니다.`,
    `아래 항목이 채워지면 승인되어 댄서 명단에 공개됩니다.`,
    ``,
    `[${name}님의 현재 상태]`,
    ...Object.keys(ITEMS).map((k) => `- ${ITEMS[k].ko}: ${t.missing[k] ? "필요" : "완료"}`),
    ``,
    `채우는 데 2~3분이면 충분합니다.`,
    `채우신 뒤에는 따로 연락 주지 않으셔도 됩니다.`,
    `저희가 확인해 승인해 드립니다.`,
    ``,
    `직접 채우기가 번거로우시면 이 메일에 답장으로 포트폴리오 링크나 이력을 보내 주세요.`,
    `저희가 대신 프로필에 정리해 드립니다.`,
    ``,
    `내 프로필 채우러 가기: ${EDIT_URL}`,
    ``,
    `English`,
    `Your deetz profile is almost ready.`,
    `Please add ${missEn}.`,
    `Once added, we will approve your profile and list it for casting.`,
    `Edit your profile: ${EDIT_URL}`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
    ...(unsub ? [``, `수신거부 / Unsubscribe: ${unsub}`] : []),
  ].join("\n");

  const html = `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#f1f1f3;color:#6b7280;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">프로필 승인 안내</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${esc(name)}님, ${esc(missKo)}만 채우시면 승인됩니다.</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">등록해 주신 프로필을 확인했습니다.<br>아래 항목이 채워지면 승인되어 댄서 명단에 공개됩니다.</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:8px 18px 10px;">
    <div style="font-size:12px;font-weight:700;color:#6b7280;padding:10px 0 4px;letter-spacing:0.2px;">${esc(name)}님의 현재 상태</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>
    ${Object.keys(ITEMS).map((k) => checkRow(ITEMS[k].ko, !t.missing[k], ITEMS[k].hint)).join("")}
    </tbody></table></div></td></tr>
<tr><td style="padding:14px 32px 6px;">
  <p style="font-size:14px;line-height:1.75;color:#44474d;margin:0;">채우는 데 2~3분이면 충분합니다.<br>채우신 뒤에는 따로 연락 주지 않으셔도 됩니다.<br>저희가 확인해 승인해 드립니다.</p></td></tr>
<tr><td style="padding:6px 32px 0;">
  <div style="background:#f0f7ff;border:1px solid #cfe3fb;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">직접 채우기가 번거로우시다면</div>
    <div style="font-size:13px;line-height:1.75;color:#33363b;">이 메일에 답장으로 포트폴리오 링크나 이력을 보내 주세요.<br>저희가 대신 프로필에 정리해 드립니다.</div>
  </div></td></tr>
<tr><td style="padding:16px 32px 20px;">
  <a href="${EDIT_URL}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">내 프로필 채우러 가기 →</a></td></tr>
<tr><td style="padding:0 32px 24px;">
  <div style="border-top:1px dashed #e4e4e7;padding-top:14px;font-size:12.5px;line-height:1.75;color:#6b7280;">
    <strong style="color:#44474d;">English</strong><br>Your deetz profile is almost ready.<br>Please add ${esc(missEn)}.<br>Once added, we will approve your profile and list it for casting.<br><a href="${EDIT_URL}" style="color:#1d4ed8;">Edit your profile →</a>
  </div></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:6px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp;
    <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a> &nbsp;·&nbsp;
    <a href="https://www.instagram.com/deetz.kr/" style="color:#44474d;text-decoration:none;">Instagram</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 가입하신 주소로 발송되었습니다.${unsub ? `<br><a href="${unsub}" style="color:#a1a1aa;text-decoration:underline;">수신거부 / Unsubscribe</a>` : ""}</div></td></tr>
</table></td></tr></table>
${trackingPixel(t.email)}
</body></html>`;
  return { subject, text, html };
}

// ── 원장(DB) + CSV ─────────────────────────────────────────────
async function logResult(t, status, detail) {
  const { error } = await db.from("career_reminder_log").upsert(
    {
      dancer_id: t.dancer.id,
      profile_id: t.dancer.profile_id,
      stage: STAGE,
      email: t.email,
      subject: detail.subject ?? null,
      status,
      detail: { source: "scripts/profile-completion-nudge.mjs", missing: missingList(t.missing), ...detail },
      sent_at: new Date().toISOString(),
    },
    { onConflict: "dancer_id,stage" },
  );
  if (error) console.error(`  (원장 기록 실패 ${t.email}: ${error.message})`);
  if (!existsSync(CSVLOG)) appendFileSync(CSVLOG, "ts,dancer_id,email,missing,status,note\n");
  appendFileSync(
    CSVLOG,
    `${new Date().toISOString()},${t.dancer.id},${t.email},${missingList(t.missing).join("|")},${status},"${String(detail.error ?? detail.messageId ?? "").replace(/"/g, "'").slice(0, 120)}"\n`,
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function transport(pool) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    ...(pool ? { pool: true, maxConnections: 1, maxMessages: 100 } : {}),
  });
}

async function runPlan() {
  const { targets, excluded } = await collectTargets();
  const by = { photo: 0, sns: 0, work: 0 };
  for (const t of targets) for (const k of missingList(t.missing)) by[k] += 1;
  console.log(`대상 ${targets.length}명 · 제외 ${JSON.stringify(excluded)}`);
  console.log(`빠진 항목 — 사진 ${by.photo} · SNS ${by.sns} · 경력/포트폴리오 ${by.work}`);
  console.log(`미리보기(상위 10):`);
  for (const t of targets.slice(0, 10)) console.log(`  ${t.name} <${t.email}> 부족: ${missingList(t.missing).join(",")}`);
}

async function runTest(to) {
  const sample = {
    dancer: { id: "00000000-0000-0000-0000-000000000000", profile_id: null, created_at: new Date().toISOString() },
    email: to,
    name: "홍길동",
    missing: { photo: false, sns: true, work: true },
    token: null,
  };
  const { subject, text, html } = buildEmail(sample);
  const info = await transport(false).sendMail({
    from: `"${MAIL_FROM_NAME}" <${MAIL_USER}>`,
    replyTo: REPLY_TO,
    to,
    subject: `[테스트] ${subject}`,
    text,
    html,
    headers: listUnsubscribeHeaders(null),
  });
  console.log("sent:", info.messageId, "->", to);
}

async function runSend(max, confirmed) {
  const { targets, excluded } = await collectTargets();
  const batch = targets.slice(0, max);
  console.log(`대상 ${targets.length}명 (제외 ${JSON.stringify(excluded)}) · 이번 회차 ${batch.length}명 · ${confirmed ? "실발송" : "dry-run"}`);
  if (!confirmed) {
    for (const t of batch) console.log(`  [dry] ${t.name} <${t.email}> 부족: ${missingList(t.missing).join(",")}`);
    console.log(`실발송: send --max ${max} --confirm-send=PROFILE_COMPLETION`);
    return;
  }
  const t = transport(true);
  let ok = 0, fail = 0, stopped = false;
  for (const target of batch) {
    const { subject, text, html } = buildEmail(target);
    try {
      const info = await t.sendMail({
        from: `"${MAIL_FROM_NAME}" <${MAIL_USER}>`,
        replyTo: REPLY_TO,
        to: target.email,
        subject,
        text,
        html,
        headers: listUnsubscribeHeaders(target.token),
      });
      await logResult(target, "sent", { subject, messageId: info.messageId });
      console.log(`  ok  ${target.email} (${missingList(target.missing).join(",")})`);
      ok += 1;
    } catch (e) {
      const msg = String(e?.message ?? e);
      await logResult(target, "failed", { subject, error: msg });
      console.error(`  FAIL ${target.email}: ${msg.slice(0, 160)}`);
      fail += 1;
      if (STOP_PATTERNS.some((re) => re.test(msg))) {
        console.error("⛔ Gmail 한도/로그인 제한 감지 — 즉시 중단합니다. 한도 리셋 후 같은 명령으로 재개하세요.");
        stopped = true;
        break;
      }
    }
    await sleep(PACE_MS);
  }
  t.close();
  console.log(`done. ok=${ok} fail=${fail} stopped=${stopped} remaining=${targets.length - ok}`);
  process.exit(stopped ? 2 : 0);
}

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  const flag = (name, dflt) => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i < 0) return dflt;
    const a = argv[i];
    return a.includes("=") ? a.split("=").slice(1).join("=") : argv[i + 1] ?? dflt;
  };
  if (mode === "plan") return runPlan();
  if (mode === "test" && argv[1]) return runTest(argv[1]);
  if (mode === "send") {
    const max = Math.max(1, parseInt(flag("max", "50"), 10) || 50);
    return runSend(max, flag("confirm-send", "") === "PROFILE_COMPLETION");
  }
  console.error("usage: plan | test <email> | send --max <N> [--confirm-send=PROFILE_COMPLETION]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
