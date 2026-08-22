// deetz 프로필 채우기 독려 메일 — 빌더 + 테스트/실발송 (분할)
// 사용:
//   node scripts/profile-nudge.mjs test you@example.com   — 테스트 1통
//   node scripts/profile-nudge.mjs plan                   — 남은 대상 현황(발송 안 함)
//   node scripts/profile-nudge.mjs send --max 25          — 남은 대상 중 최대 25통 발송
// 대상 = RPC deetz_profile_nudge_recipients() (Segment A 라이브, 부실 순). 완성자는 자동 제외.
// 멱등: scripts/.profile-nudge-sent.json 원장에 기록된 dancer는 재발송 안 함.
// 양식: deetz 공식 560px 카드 + SNS 푸터 + 열람 추적 픽셀 (rejection-mail.ts 기준)
import nodemailer from "nodemailer";
import { listUnsubscribeHeaders } from "./lib/list-unsubscribe.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 직접 파싱 (dotenv 의존 없이)
function loadEnv() {
  const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const ENV = loadEnv();

const CAMPAIGN = "deetz-profile-nudge-2026-06";
// 발신은 deetz 공식 도메인 메일함이 정본. 구 개인 Gmail 은 폴백일 뿐이다.
// ⚠ 이 메일은 "답장 주시면 대신 등록해드린다"고 안내하므로,
//   발신함이 반드시 사람이 읽는 메일함(contact@deetz.kr, IMAP 모니터링 중)이어야 한다.
const MAIL_USER = () => ENV.DEETZ_GMAIL_USER || ENV.GMAIL_USER;
const MAIL_PASS = () => ENV.DEETZ_GMAIL_APP_PASSWORD || ENV.GMAIL_APP_PASSWORD;
const MAIL_FROM_NAME = "deetz 에이전시 & 매거진";
const REPLY_TO = "contact@deetz.kr";
const EDIT_URL = "https://deetz.kr/me/portfolio";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function trackingPixel(email) {
  const key = ENV.SUPABASE_SERVICE_ROLE_KEY;
  const e = Buffer.from(email, "utf8").toString("base64url");
  const s = createHmac("sha256", key).update(`${CAMPAIGN}|${email}`).digest("base64url");
  const url = `https://deetz.kr/api/track/open?c=${encodeURIComponent(CAMPAIGN)}&e=${e}&s=${s}`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">`;
}

// 빠진 항목 체크리스트 행
function checkRow(label, done, hint) {
  const icon = done
    ? `<span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:#e7f6ec;color:#0f7b3f;font-size:13px;font-weight:800;text-align:center;line-height:20px;">✓</span>`
    : `<span style="display:inline-block;width:20px;height:20px;border-radius:6px;background:#fdecec;color:#d14343;font-size:13px;font-weight:800;text-align:center;line-height:20px;">!</span>`;
  const status = done
    ? `<span style="color:#0f7b3f;font-weight:700;">작성 완료</span>`
    : `<span style="color:#d14343;font-weight:700;">미작성</span>`;
  return `<tr>
    <td style="width:28px;padding:9px 0;vertical-align:top;">${icon}</td>
    <td style="padding:9px 0;vertical-align:top;">
      <div style="font-size:14px;font-weight:700;color:#111111;line-height:1.4;">${esc(label)} · ${status}</div>
      <div style="font-size:12.5px;color:#6b7280;line-height:1.6;margin-top:2px;">${esc(hint)}</div>
    </td></tr>`;
}

function unsubRow(d) {
  if (!d.unsubscribeToken) return "";
  return `<br><a href="https://www.deetz.kr/unsubscribe/${d.unsubscribeToken}" style="color:#a1a1aa;text-decoration:underline;">수신거부</a>`;
}

// d = { name, email, hasPhoto, careerCount, hasBio, hasSns, unsubscribeToken }
// ⚠ hasSns 미전달 시 전원 "미연결"로 표시된다. 호출부(대상 조회)에서 social_links 를 함께 읽을 것.
export function buildEmail(d) {
  const name = d.name || "댄서";
  const safeName = esc(name);
  const careerDone = (d.careerCount || 0) >= 3;

  const text = [
    `안녕하세요 ${name}님,`,
    ``,
    `deetz 프로필을 더 채워주시면 매칭과 캐스팅 진행 확률이 크게 올라갑니다.`,
    `캐스팅 담당자는 사진·경력·소개를 보고 섭외 여부를 결정합니다.`,
    `이 세 가지가 비어 있으면, 검색에 떠도 그냥 지나치게 됩니다.`,
    ``,
    `${name}님의 현재 프로필 상태:`,
    `- 프로필 사진: ${d.hasPhoto ? "작성 완료" : "미작성"}`,
    `- 경력(작품/활동): ${careerDone ? "작성 완료" : "미작성 또는 부족"}`,
    `- 소개글: ${d.hasBio ? "작성 완료" : "미작성"}`,
    `- SNS 연결: ${d.hasSns ? "연결 완료" : "미연결"}`,
    ``,
    `2~3분이면 채울 수 있어요.`,
    ``,
    `직접 채우기가 번거로우시다면,`,
    `가지고 계신 포트폴리오 페이지 주소나 이력을 적은 텍스트, PDF 파일 등 무엇이든`,
    `이 메일에 그대로 답장해 주세요.`,
    `저희가 대신 프로필로 정리해서 등록해 드리고 있습니다.`,
    ``,
    `내 프로필 채우러 가기: ${EDIT_URL}`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
    ...(d.unsubscribeToken
      ? [``, `수신거부: https://www.deetz.kr/unsubscribe/${d.unsubscribeToken}`]
      : []),
  ].join("\n");

  const html = `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:6px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#f1f1f3;color:#6b7280;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">프로필 채우기 안내</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${safeName}님, 프로필이 거의 비어 있어요.</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">사진·경력·소개 — 이 세 가지가 채워져야 매칭과 캐스팅 제안이 들어옵니다.<br>캐스팅 담당자는 이 정보를 보고 섭외를 결정해요.<br>지금은 검색에 떠도 그냥 지나치게 됩니다.</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:8px 18px 10px;">
    <div style="font-size:12px;font-weight:700;color:#6b7280;padding:10px 0 4px;letter-spacing:0.2px;">${safeName}님의 현재 프로필 상태</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>
    ${checkRow("프로필 사진", d.hasPhoto, "얼굴이 잘 보이는 대표 사진 1장이면 충분해요.")}
    ${checkRow("경력 (작품·활동)", careerDone, "참여한 안무·영상·공연·대회를 추가해 주세요. 영상 링크도 좋아요.")}
    ${checkRow("소개글", d.hasBio, "어떤 장르·스타일의 댄서인지 2~3줄이면 됩니다.")}
    ${checkRow("SNS 연결", d.hasSns, "인스타그램 등 활동 계정을 연결해 주세요. 캐스팅 담당자가 실제 영상을 확인합니다.")}
    </tbody></table></div></td></tr>
<tr><td style="padding:14px 32px 6px;">
  <p style="font-size:14px;line-height:1.75;color:#44474d;margin:0;">2~3분이면 채울 수 있어요.<br>채워둔 프로필은 캐스팅·매칭에서 먼저 노출됩니다.</p></td></tr>
<tr><td style="padding:6px 32px 0;">
  <div style="background:#f0f7ff;border:1px solid #cfe3fb;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">직접 채우기가 번거로우시다면</div>
    <div style="font-size:13px;line-height:1.75;color:#33363b;">
      포트폴리오 페이지 주소, 이력을 적은 텍스트, PDF 파일 — <strong>무엇이든 이 메일에 그대로 답장</strong>해 주세요.<br>
      저희가 대신 프로필로 정리해서 등록해 드리고 있습니다.
    </div>
  </div></td></tr>
<tr><td style="padding:16px 32px 24px;">
  <a href="${EDIT_URL}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">내 프로필 채우러 가기 →</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:6px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp;
    <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a> &nbsp;·&nbsp;
    <a href="https://www.instagram.com/deetz.kr/" style="color:#44474d;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
    <a href="https://www.youtube.com/@deetzmagazine" style="color:#44474d;text-decoration:none;">YouTube</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 등록된 주소로 발송되었습니다.${unsubRow(d)}</div></td></tr>
</table></td></tr></table>
${trackingPixel(d.email)}
</body></html>`;

  return { subject: `${name}님, deetz 프로필을 채우면 캐스팅 제안이 들어와요`, text, html };
}

// ---- 원장(멱등) + 로그 ----
const LEDGER = join(__dirname, ".profile-nudge-sent.json");
const CSVLOG = join(__dirname, "profile-nudge-log.csv");

function loadLedger() {
  if (!existsSync(LEDGER)) return { sent: {} };
  try { return JSON.parse(readFileSync(LEDGER, "utf8")); } catch { return { sent: {} }; }
}
function saveLedger(l) { writeFileSync(LEDGER, JSON.stringify(l, null, 2)); }
function logCsv(row) {
  if (!existsSync(CSVLOG)) appendFileSync(CSVLOG, "ts,dancer_id,email,score,result\n");
  appendFileSync(CSVLOG, row + "\n");
}

function supa() {
  return createClient(ENV.NEXT_PUBLIC_SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}
async function getRecipients() {
  const { data, error } = await supa().rpc("deetz_profile_nudge_recipients");
  if (error) throw new Error("rpc failed: " + error.message);
  const rows = data || [];

  // RPC 는 SNS 정보를 돌려주지 않는다. 여기서 안 채우면 체크리스트가 전원 "미연결"로 뜬다.
  const ids = rows.map((r) => r.dancer_id).filter(Boolean);
  const snsBy = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ds } = await supa()
      .from("dancers")
      .select("id, social_links")
      .in("id", ids.slice(i, i + 200));
    for (const d of ds ?? []) {
      const n = Object.values(d.social_links ?? {}).filter(
        (v) => typeof v === "string" && v.trim(),
      ).length;
      snsBy.set(d.id, n > 0);
    }
  }
  for (const r of rows) r.has_sns = snsBy.get(r.dancer_id) ?? false;

  // 수신거부 토큰 확보 + 전체 수신거부자 제외.
  // dancer -> profile 매핑이 필요하므로 dancers 에서 함께 읽는다.
  const ownerBy = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ds } = await supa()
      .from("dancers").select("id, profile_id").in("id", ids.slice(i, i + 200));
    for (const d of ds ?? []) if (d.profile_id) ownerBy.set(d.id, d.profile_id);
  }
  const owners = [...new Set([...ownerBy.values()])];
  const prefBy = new Map();
  for (let i = 0; i < owners.length; i += 200) {
    const { data: ps } = await supa()
      .from("notification_preferences")
      .select("user_id, email_unsubscribed_all, unsubscribe_token")
      .in("user_id", owners.slice(i, i + 200));
    for (const p of ps ?? []) prefBy.set(p.user_id, p);
  }
  // RPC 는 approval_status / is_active 를 필터하지 않는다.
  // 실측(2026-08-14): 649명 안에 approved 136 · rejected 1 · inactive 4 가 섞여 있었다.
  // 승인된 사람에게 "프로필이 거의 비어 있어요" 를 보내면 안 되고,
  // 거절·비활성 프로필은 애초에 발송 대상이 아니다.
  const stateBy = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ds } = await supa()
      .from("dancers")
      .select("id, approval_status, is_active")
      .in("id", ids.slice(i, i + 200));
    for (const d of ds ?? []) stateBy.set(d.id, d);
  }

  // 원장 파일이 유실돼도 같은 사람에게 두 번 보내지 않도록,
  // 열람 기록(email_opens)에 남은 주소는 무조건 억제한다.
  // ⚠ 열람자는 실제 수신자의 부분집합일 뿐이라 이것만으로는 부족하다 —
  //    정확한 복원은 Gmail 보낸편지함(IMAP) 조회가 필요하다.
  const suppressed = new Set();
  {
    const { data: opens } = await supa()
      .from("email_opens")
      .select("recipient_email")
      .eq("campaign", CAMPAIGN);
    for (const e of opens ?? []) {
      if (e.recipient_email) suppressed.add(e.recipient_email.toLowerCase());
    }
  }

  const kept = [];
  const drop = { 수신거부: 0, 승인됨: 0, 비활성: 0, 거절됨: 0, 기발송추정: 0 };
  for (const r of rows) {
    const st = stateBy.get(r.dancer_id);
    if (st?.is_active === false) { drop.비활성 += 1; continue; }
    if (st?.approval_status === "rejected") { drop.거절됨 += 1; continue; }
    if (st?.approval_status === "approved") { drop.승인됨 += 1; continue; }
    if (suppressed.has((r.email ?? "").toLowerCase())) { drop.기발송추정 += 1; continue; }
    const pref = prefBy.get(ownerBy.get(r.dancer_id));
    if (pref?.email_unsubscribed_all) { drop.수신거부 += 1; continue; }
    r.unsubscribeToken = pref?.unsubscribe_token ?? null;
    kept.push(r);
  }
  console.log(`  제외 — ${Object.entries(drop).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  return kept;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSend(maxN) {
  const ledger = loadLedger();
  const all = await getRecipients();           // 부실 순 정렬, 완성자 자동 제외
  const pending = all.filter((r) => !ledger.sent[r.dancer_id]);
  const batch = pending.slice(0, maxN);
  console.log(`recipients=${all.length} pending=${pending.length} sending=${batch.length}`);
  if (batch.length === 0) { console.log("nothing to send."); return; }

  // pool 연결 — 메일마다 SMTP 로그인을 새로 열면 Gmail 454-4.7.0 Too many login attempts 에 걸린다.
  // 2026-08-05 에 실제로 발생했고, 이 스크립트에 pool 이 없던 것이 유력한 원인이다.
  const t = nodemailer.createTransport({
    service: "gmail",
    auth: { user: MAIL_USER(), pass: MAIL_PASS() },
    pool: true,
    maxConnections: 1,
    maxMessages: 100,
  });

  let ok = 0, fail = 0;
  for (const r of batch) {
    const { subject, text, html } = buildEmail({
      name: r.name, email: r.email,
      hasPhoto: r.has_photo, careerCount: r.career_count, hasBio: r.has_bio, hasSns: r.has_sns, unsubscribeToken: r.unsubscribeToken,
    });
    const ts = new Date().toISOString();
    try {
      const info = await t.sendMail({
        from: `"${MAIL_FROM_NAME}" <${MAIL_USER()}>`,
        replyTo: REPLY_TO,
        to: r.email, subject, text, html,
        // 안내성(bulk) — 본문 하단 링크와 같은 토큰으로 수신거부 헤더도 붙인다.
        headers: listUnsubscribeHeaders(r.unsubscribeToken),
      });
      ledger.sent[r.dancer_id] = { email: r.email, at: ts, score: r.score };
      saveLedger(ledger);                         // 매 통마다 저장 — 중단돼도 안전
      logCsv(`${ts},${r.dancer_id},${r.email},${r.score},ok`);
      console.log(`  ok  ${r.email} (score=${r.score}) ${info.messageId}`);
      ok++;
    } catch (e) {
      logCsv(`${ts},${r.dancer_id},${r.email},${r.score},"fail:${String(e.message).replace(/"/g, "'").slice(0, 120)}"`);
      console.error(`  FAIL ${r.email}: ${e.message}`);
      fail++;
    }
    await sleep(2500);                            // 페이싱 (스팸 회피)
  }
  console.log(`done. ok=${ok} fail=${fail} cumulativeSent=${Object.keys(ledger.sent).length}`);
}

async function runPlan() {
  const ledger = loadLedger();
  const all = await getRecipients();
  const pending = all.filter((r) => !ledger.sent[r.dancer_id]);
  console.log(`Segment A 현재 대상: ${all.length}명 (라이브, 완성자 제외)`);
  console.log(`이미 발송: ${Object.keys(ledger.sent).length}명`);
  console.log(`남은 발송: ${pending.length}명 (그중 최악 score0: ${pending.filter((r) => r.score === 0).length}명)`);
}

async function main() {
  const [, , mode, arg1, arg2] = process.argv;
  if (mode === "test" && arg1) {
    const sample = { name: "홍길동", email: arg1, hasPhoto: true, careerCount: 1, hasBio: false };
    const { subject, text, html } = buildEmail(sample);
    const t = nodemailer.createTransport({
      service: "gmail", auth: { user: MAIL_USER(), pass: MAIL_PASS() },
    });
    const info = await t.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_USER()}>`,
        replyTo: REPLY_TO,
      to: arg1, subject: `[테스트] ${subject}`, text, html,
      headers: listUnsubscribeHeaders("00000000-0000-0000-0000-000000000000"),
    });
    console.log("sent:", info.messageId, "->", arg1);
    return;
  }
  if (mode === "plan") return runPlan();
  if (mode === "send") {
    const max = arg1 === "--max" ? parseInt(arg2, 10) || 25 : 25;
    return runSend(max);
  }
  console.error("usage: test <email> | plan | send --max <N>");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
