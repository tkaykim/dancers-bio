#!/usr/bin/env node
/**
 * 승인 완료 안내 메일 배치 발송.
 *
 * 기본은 dry-run 이다. 실제 발송은 --send --confirm-send=APPROVAL_WELCOME 가 모두 있을 때만.
 * (레포의 비자 안내 메일 스크립트와 같은 관례)
 *
 * Gmail 한도 방어 — 과거에 실제로 두 번 터졌다(INTEGRATIONS.md):
 *   1) 454-4.7.0 Too many login attempts  → pool 연결 + maxConnections=1 로 로그인 재사용
 *   2) 550-5.4.5 Daily user sending limit → --limit 로 하루 상한을 나눠 보내고,
 *      한도 에러를 만나면 **즉시 전체 중단**한다. 계속 두드리면 계정이 더 오래 잠긴다.
 * 재개는 career_reminder_log(stage='approval_welcome', status='sent') 기준 멱등이라
 * 그냥 다시 실행하면 남은 대상만 이어서 보낸다.
 *
 * 사용:
 *   node scripts/send-approval-welcome.mjs --mode=new            # 신규 승인자 (dry-run)
 *   node scripts/send-approval-welcome.mjs --mode=retro --limit=100
 *   node scripts/send-approval-welcome.mjs --mode=new --limit=80 --send --confirm-send=APPROVAL_WELCOME
 */

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { listUnsubscribeHeaders } from "./lib/list-unsubscribe.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ── env 로드 (.env.local) ────────────────────────────────────────
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        const [, k, v] = m;
        if (!process.env[k]) {
          process.env[k] = v.replace(/^["']|["']$/g, "");
        }
      }
    } catch {
      /* 파일 없으면 무시 */
    }
  }
}
loadEnv();

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);

const MODE = args.get("mode") ?? "new"; // new | retro
const LIMIT = Number(args.get("limit") ?? 50);
const SEND = args.get("send") === "true";
const CONFIRMED = args.get("confirm-send") === "APPROVAL_WELCOME";
const DELAY_MS = Number(args.get("delay") ?? 4000); // 통당 간격 (기본 4초 → 시간당 ~900 이론치, 실제는 limit 이 제어)

const LIVE = SEND && CONFIRMED;
const RETRO = MODE === "retro";

const SITE = "https://www.deetz.kr";
const VANITY = "https://dancers.bio";
const STAGE = "approval_welcome";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const gmailUser = process.env.DEETZ_GMAIL_USER || process.env.GMAIL_USER;
const gmailPass =
  process.env.DEETZ_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;

// ── 본문 (src/lib/notify/approval-welcome-mail.ts 와 동일 문구) ──
const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// retro = 이미 오래전에 승인된 분들에게 보내는 소급 안내.
// "승인되었습니다" 라고 하면 앞뒤가 안 맞으므로 문구를 바꾼다.
function buildText(name, slug, igVerified, retro = false) {
  return [
    `안녕하세요 ${name}님,`,
    ``,
    retro
      ? `deetz에 공개 중인 ${name}님의 프로필 링크를 안내드립니다.`
      : `deetz 프로필이 승인되었습니다.`,
    ``,
    retro ? `[프로필이 공개되면 이렇게 활용됩니다]` : `[승인되면 이렇게 달라집니다]`,
    `deetz 댄서 목록과 검색에 노출됩니다.`,
    `구글 등 검색엔진에 프로필이 등록됩니다.`,
    `조건에 맞는 새 공고가 올라오면 알림을 받습니다.`,
    `캐스팅 담당자의 추천 후보에 포함됩니다.`,
    `캐스팅 제안을 직접 받을 수 있습니다.`,
    ``,
    `[내 프로필 링크]`,
    `${VANITY}/${slug}`,
    ``,
    `이 주소를 인스타그램 프로필에 걸어두시면 좋습니다.`,
    `프로필 편집 화면의 웹사이트 칸에 위 주소를 붙여넣으시면 됩니다.`,
    `경력과 영상, 연락 경로가 한 페이지에 정리되어 전달됩니다.`,
    ``,
    `내 프로필 관리: ${SITE}/me/portfolio`,
    ``,
    `감사합니다.`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
  ].join("\n");
}

function buildHtml(name, slug, igVerified, unsubscribeUrl, retro = false) {
  const safeName = escapeHtml(name);
  const badge = retro ? "프로필 링크 안내" : "프로필 승인 완료";
  const headline = retro
    ? `${safeName}님, 프로필 링크를 안내드립니다.`
    : `${safeName}님, 프로필이 승인되었습니다.`;
  const lede = retro
    ? "deetz에 공개 중인 프로필 주소입니다. 인스타그램 프로필에 걸어두시면 좋습니다."
    : "이제 deetz에서 프로필이 공개되고, 캐스팅 제안을 받으실 수 있습니다.";
  const benefitTitle = retro
    ? "프로필이 공개되면 이렇게 활용됩니다"
    : "승인되면 이렇게 달라집니다";
  const link = `${VANITY}/${escapeHtml(slug)}`;
  const vanityPlain = `dancers.bio/${escapeHtml(slug)}`;
  const benefits = [
    "deetz 댄서 목록과 검색에 노출됩니다",
    "구글 등 검색엔진에 프로필이 등록됩니다",
    "조건에 맞는 새 공고가 올라오면 알림을 받습니다",
    "캐스팅 담당자의 추천 후보에 포함됩니다",
    "캐스팅 제안을 직접 받을 수 있습니다",
  ]
    .map((t) => `<tr><td style="padding:5px 0;font-size:14px;line-height:1.6;color:#33363b;">· ${t}</td></tr>`)
    .join("");
  // 인스타 본인인증 안내는 메일에서 뺀다.
  // 인증의 실제 효익이 "공고 직접 등록" 하나인데 그 기능이 아직 미출시라,
  // 안내하면 없는 기능을 약속하는 셈이 된다. (2026-08-14 대표 지시)
  const verifyBlock = "";
  const unsubRow = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">수신거부</a>`
    : "";

  return `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="${SITE}/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${badge}</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${headline}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${lede}</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:6px;">${benefitTitle}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>${benefits}</tbody></table></td></tr>
<tr><td style="padding:18px 32px 8px;">
  <div style="font-size:13px;font-weight:700;color:#6b7280;margin-bottom:10px;">내 프로필 링크</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f11;border-radius:14px;">
    <tr><td align="center" style="padding:22px 20px;">
      <a href="${link}" style="display:block;color:#ffffff;text-decoration:none;font-size:19px;font-weight:700;letter-spacing:-0.2px;word-break:break-all;line-height:1.4;">${vanityPlain}</a>
      <div style="font-size:11px;color:#8a8a93;margin-top:8px;">탭하면 내 프로필이 열립니다</div>
    </td></tr>
  </table>
  <div style="font-size:13px;line-height:1.85;color:#44474d;margin-top:14px;">
    이 주소를 <strong>인스타그램 프로필</strong>에 걸어두시면 좋습니다.<br>
    인스타그램 → 프로필 편집 → 웹사이트 칸에 붙여넣기.<br>
    경력과 영상, 연락 경로가 한 페이지에 정리되어 전달됩니다.
  </div></td></tr>
<tr><td style="padding:16px 32px 6px;">
  <a href="${SITE}/me/portfolio" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">링크 복사하기 →</a>
  <div style="font-size:11px;color:#a1a1aa;text-align:center;margin-top:8px;">내 프로필 화면에서 복사 버튼을 누르면 바로 복사됩니다</div></td></tr>
${verifyBlock}
<tr><td style="padding:14px 32px 26px;">
  <a href="${link}" style="display:block;border:1px solid #d4d4d8;color:#111111;text-decoration:none;text-align:center;font-size:14px;font-weight:700;padding:13px 0;border-radius:12px;">내 프로필 미리보기</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="${SITE}/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 12px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp;
    <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a> &nbsp;·&nbsp;
    <a href="https://www.instagram.com/deetz.kr/" style="color:#44474d;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
    <a href="https://www.youtube.com/@deetzmagazine" style="color:#44474d;text-decoration:none;">YouTube</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 등록하신 주소로 발송되었습니다.${unsubRow}</div></td></tr>
</table></td></tr></table></body></html>`;
}

// 내부 테스트 계정 — 실제 사람이 아니므로 발송 대상에서 뺀다.
const TEST_PATTERN = /(^|[^a-z])e2e|test|테스트/i;

// ── 대상 수집 ────────────────────────────────────────────────────
async function collectTargets() {
  const { data: dancers, error } = await db
    .from("dancers")
    .select("id, stage_name, korean_name, slug, profile_id, approved_at, is_active")
    .eq("approval_status", "approved")
    .not("slug", "is", null)
    .not("profile_id", "is", null)
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) throw new Error(`dancers: ${error.message}`);

  const { data: sentRows } = await db
    .from("career_reminder_log")
    .select("dancer_id, status")
    .eq("stage", STAGE);
  const sent = new Set((sentRows ?? []).filter((r) => r.status === "sent").map((r) => r.dancer_id));

  // 인스타 인증 완료 여부 — 완료자에게 "인증하세요" 블록을 붙이면 안 된다.
  const profileIds = [...new Set((dancers ?? []).map((d) => d.profile_id).filter(Boolean))];
  const verified = new Set();
  for (let i = 0; i < profileIds.length; i += 200) {
    const { data: profs } = await db
      .from("profiles")
      .select("id, instagram_verified_at")
      .in("id", profileIds.slice(i, i + 200));
    for (const p of profs ?? []) if (p.instagram_verified_at) verified.add(p.id);
  }

  const excluded = { already_sent: 0, inactive: 0, test_account: 0 };
  const targets = [];
  for (const d of dancers ?? []) {
    if (sent.has(d.id)) {
      excluded.already_sent += 1;
      continue;
    }
    // is_active=false 는 관리자가 숨긴 프로필이다.
    // "목록에 노출됩니다" 라고 안내하면 사실과 다르다.
    if (d.is_active === false) {
      excluded.inactive += 1;
      continue;
    }
    if (TEST_PATTERN.test(d.stage_name ?? "") || TEST_PATTERN.test(d.slug ?? "")) {
      excluded.test_account += 1;
      continue;
    }
    targets.push({ ...d, igVerified: verified.has(d.profile_id) });
  }
  return { targets, excluded };
}

async function resolveEmail(d) {
  const { data: u } = await db.auth.admin.getUserById(d.profile_id);
  if (u?.user?.email) return u.user.email;
  const { data: priv } = await db
    .from("dancer_private_info")
    .select("email")
    .eq("dancer_id", d.id)
    .maybeSingle();
  return priv?.email ?? null;
}

async function resolvePrefs(profileId) {
  const { data } = await db
    .from("notification_preferences")
    .select("email_unsubscribed_all, unsubscribe_token")
    .eq("user_id", profileId)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await db
    .from("notification_preferences")
    .upsert({ user_id: profileId }, { onConflict: "user_id" })
    .select("email_unsubscribed_all, unsubscribe_token")
    .single();
  return created ?? null;
}

// ── 실행 ─────────────────────────────────────────────────────────
const DAILY_LIMIT_PATTERNS = [/5\.4\.5/, /Daily user sending limit/i, /quota/i];

async function main() {
  const { targets, excluded } = await collectTargets();
  console.log(`대상 ${targets.length}명 · mode=${MODE} · limit=${LIMIT}`);
  console.log(
    `제외 — 이미발송 ${excluded.already_sent} · 비활성 ${excluded.inactive} · 테스트계정 ${excluded.test_account}`,
  );
  console.log(LIVE ? "*** 실제 발송 모드 ***" : "dry-run (실제 발송 없음)");

  // --preview=<경로> : 첫 대상 기준 HTML 을 파일로 떨궈 눈으로 확인한다. 발송 없음.
  const previewPath = args.get("preview");
  if (previewPath && previewPath !== "true") {
    const d = targets[0];
    if (!d) {
      console.log("미리보기할 대상이 없습니다.");
      return;
    }
    const name = (d.korean_name ?? "").trim() || d.stage_name;
    writeFileSync(
      resolve(process.cwd(), previewPath),
      buildHtml(name, d.slug, d.igVerified, `${SITE}/unsubscribe/PREVIEW-TOKEN`, RETRO),
      "utf8",
    );
    console.log(`미리보기 저장: ${previewPath} (${name} / ${VANITY}/${d.slug})`);
    return;
  }

  // --test-to=<주소> : 첫 대상 본문을 지정 주소로 1통만 보낸다.
  // 대량 발송 전 실제 수신 화면(모바일 Gmail/네이버)을 눈으로 확인하는 용도.
  // 로그를 남기지 않으므로 실제 대상자의 발송 상태에 영향이 없다.
  const testTo = args.get("test-to");
  if (testTo && testTo !== "true") {
    if (!gmailUser || !gmailPass) {
      console.error("DEETZ_GMAIL_USER / DEETZ_GMAIL_APP_PASSWORD 가 없습니다.");
      process.exit(1);
    }
    const d = targets[0];
    const name = (d.korean_name ?? "").trim() || d.stage_name;
    const t = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    await t.sendMail({
      from: `"deetz 에이전시 & 매거진" <${gmailUser}>`,
      to: testTo,
      subject: `[테스트] ${MODE === "retro" ? "[deetz] 내 프로필 링크 안내" : "[deetz] 프로필이 승인되었습니다"}`,
      text: buildText(name, d.slug, d.igVerified, RETRO),
      html: buildHtml(name, d.slug, d.igVerified, `${SITE}/unsubscribe/TEST-TOKEN`, RETRO),
      headers: listUnsubscribeHeaders("TEST-TOKEN"),
    });
    t.close();
    console.log(`테스트 1통 발송 완료 → ${testTo} (본문 기준: ${name} / ${VANITY}/${d.slug})`);
    return;
  }

  let transporter = null;
  if (LIVE) {
    if (!gmailUser || !gmailPass) {
      console.error("DEETZ_GMAIL_USER / DEETZ_GMAIL_APP_PASSWORD 가 없습니다.");
      process.exit(1);
    }
    // pool 연결 — 메일마다 로그인하지 않게. 454 Too many login attempts 방어.
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
      pool: true,
      maxConnections: 1,
      maxMessages: 100,
    });
  }

  const stats = { sent: 0, skipped: 0, failed: 0, reasons: {} };
  const skip = (why) => {
    stats.skipped += 1;
    stats.reasons[why] = (stats.reasons[why] ?? 0) + 1;
  };

  let processed = 0;
  for (const d of targets) {
    if (processed >= LIMIT) {
      console.log(`\n--limit=${LIMIT} 도달. 나머지 ${targets.length - processed}명은 다음 회차에.`);
      break;
    }

    const email = await resolveEmail(d);
    if (!email) {
      skip("no_email");
      continue;
    }
    const prefs = d.profile_id ? await resolvePrefs(d.profile_id) : null;
    if (prefs?.email_unsubscribed_all) {
      skip("unsubscribed");
      continue;
    }

    const name = (d.korean_name ?? "").trim() || d.stage_name;
    const subject =
      MODE === "retro" ? "[deetz] 내 프로필 링크 안내" : "[deetz] 프로필이 승인되었습니다";
    const unsubscribeUrl = prefs?.unsubscribe_token
      ? `${SITE}/unsubscribe/${prefs.unsubscribe_token}`
      : null;

    processed += 1;

    if (!LIVE) {
      console.log(
        `  [dry] ${name} <${email}> → ${VANITY}/${d.slug}${d.igVerified ? " (인증완료)" : ""}`,
      );
      stats.sent += 1;
      continue;
    }

    try {
      await transporter.sendMail({
        from: `"deetz 에이전시 & 매거진" <${gmailUser}>`,
        to: email,
        subject,
        text: buildText(name, d.slug, d.igVerified, RETRO),
        html: buildHtml(name, d.slug, d.igVerified, unsubscribeUrl, RETRO),
        // 안내성(bulk) — 본문 하단 링크와 같은 토큰으로 수신거부 헤더도 붙인다.
        headers: listUnsubscribeHeaders(prefs?.unsubscribe_token ?? null),
      });
      await db.from("career_reminder_log").upsert(
        {
          dancer_id: d.id,
          profile_id: d.profile_id,
          stage: STAGE,
          email,
          subject,
          status: "sent",
          detail: { slug: d.slug, mode: MODE },
          sent_at: new Date().toISOString(),
        },
        { onConflict: "dancer_id,stage" },
      );
      stats.sent += 1;
      console.log(`  ✓ ${name} <${email}>`);
    } catch (e) {
      const msg = String(e?.message ?? e);
      stats.failed += 1;
      await db.from("career_reminder_log").upsert(
        {
          dancer_id: d.id,
          profile_id: d.profile_id,
          stage: STAGE,
          email,
          subject,
          status: "failed",
          detail: { slug: d.slug, error: msg.slice(0, 500) },
          sent_at: new Date().toISOString(),
        },
        { onConflict: "dancer_id,stage" },
      );
      console.error(`  ✗ ${name} <${email}> — ${msg.slice(0, 160)}`);

      // 일일 한도에 걸리면 즉시 중단. 계속 두드리면 계정이 더 오래 잠긴다.
      if (DAILY_LIMIT_PATTERNS.some((re) => re.test(msg))) {
        console.error("\n🛑 Gmail 일일 발송 한도로 판단됩니다. 즉시 중단합니다.");
        console.error("   한도 리셋 후 같은 명령을 다시 실행하면 남은 대상만 이어서 보냅니다.");
        break;
      }
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  if (transporter) transporter.close();
  console.log(
    `\n결과 — 발송 ${stats.sent} · 실패 ${stats.failed} · 건너뜀 ${stats.skipped}`,
    stats.reasons,
  );
  if (!LIVE) {
    console.log("\n실제 발송: --send --confirm-send=APPROVAL_WELCOME 를 함께 넘기세요.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
