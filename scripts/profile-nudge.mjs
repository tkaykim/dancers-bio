// deetz 프로필 채우기 독려 메일 — 빌더 + 테스트/실발송 (분할)
// 사용:
//   node scripts/profile-nudge.mjs test you@example.com   — 테스트 1통
//   node scripts/profile-nudge.mjs plan                   — 남은 대상 현황(발송 안 함)
//   node scripts/profile-nudge.mjs send --max 25          — 남은 대상 중 최대 25통 발송
// 대상 = RPC deetz_profile_nudge_recipients() (Segment A 라이브, 부실 순). 완성자는 자동 제외.
// 멱등: scripts/.profile-nudge-sent.json 원장에 기록된 dancer는 재발송 안 함.
// 양식: deetz 공식 560px 카드 + SNS 푸터 + 열람 추적 픽셀 (rejection-mail.ts 기준)
import nodemailer from "nodemailer";
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

// d = { name, email, hasPhoto, careerCount, hasBio, hasSns }
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
    `내 프로필 채우러 가기: ${EDIT_URL}`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
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
<tr><td style="padding:16px 32px 24px;">
  <a href="${EDIT_URL}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">내 프로필 채우러 가기 →</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:6px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 등록된 주소로 발송되었습니다.</div></td></tr>
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
  return data || [];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runSend(maxN) {
  const ledger = loadLedger();
  const all = await getRecipients();           // 부실 순 정렬, 완성자 자동 제외
  const pending = all.filter((r) => !ledger.sent[r.dancer_id]);
  const batch = pending.slice(0, maxN);
  console.log(`recipients=${all.length} pending=${pending.length} sending=${batch.length}`);
  if (batch.length === 0) { console.log("nothing to send."); return; }

  const t = nodemailer.createTransport({
    service: "gmail",
    auth: { user: ENV.GMAIL_USER, pass: ENV.GMAIL_APP_PASSWORD },
  });

  let ok = 0, fail = 0;
  for (const r of batch) {
    const { subject, text, html } = buildEmail({
      name: r.name, email: r.email,
      hasPhoto: r.has_photo, careerCount: r.career_count, hasBio: r.has_bio,
    });
    const ts = new Date().toISOString();
    try {
      const info = await t.sendMail({
        from: `"${ENV.GMAIL_FROM_NAME || "deetz"}" <${ENV.GMAIL_USER}>`,
        to: r.email, subject, text, html,
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
      service: "gmail", auth: { user: ENV.GMAIL_USER, pass: ENV.GMAIL_APP_PASSWORD },
    });
    const info = await t.sendMail({
      from: `"${ENV.GMAIL_FROM_NAME || "deetz"}" <${ENV.GMAIL_USER}>`,
      to: arg1, subject: `[테스트] ${subject}`, text, html,
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
