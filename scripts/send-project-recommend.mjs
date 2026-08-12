// 공고 추천 메일 발송 (남자 댄서 대상, 기지원·수신거부 제외).
//
// 대상 = recipients_project_recommend_male RPC (남자 + 계정·이메일 있음 + 미지원
//        + email_unsubscribed_all=false + email_project_match!=false).
// 멱등: project_notification_log(channel='email_recommend') — 이미 보낸 사람은 재발송 안 함.
// 각 메일 하단에 원클릭 수신거부 링크(/unsubscribe/<token>) 포함.
//
//   node scripts/send-project-recommend.mjs 4dzwtq                 # dry-run (대상만, 발송 안 함)
//   node scripts/send-project-recommend.mjs 4dzwtq --test you@x.com # 테스트 1통만 발송
//   node scripts/send-project-recommend.mjs 4dzwtq --send          # 실제 전체 발송
//   node scripts/send-project-recommend.mjs 4dzwtq --dump          # 미리보기 HTML 파일로 저장

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const args = process.argv.slice(2);
const send = args.includes("--send");
const dump = args.includes("--dump");
const testIdx = args.indexOf("--test");
const testEmail = testIdx >= 0 ? args[testIdx + 1] : null;
const code = args.find((a) => !a.startsWith("--") && a !== testEmail) ?? "4dzwtq";

const FROM_NAME = "deetz 에이전시 & 매거진";
const BASE = "https://www.deetz.kr";
const THROTTLE_MS = 1300; // Gmail 안전 간격

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// deetz 공식 메일 양식(560px 카드 + SNS 푸터). 1문장=1줄.
function buildEmail({ name, project, token }) {
  const unsub = `${BASE}/unsubscribe/${token}`;
  const cta = `${BASE}/projects/${project.short_code}`;
  const safeName = esc(name);

  const text = [
    `안녕하세요 ${name}님,`,
    ``,
    `${name}님께 맞을 것 같은 새 공고가 deetz에 올라와 안내드립니다.`,
    ``,
    `[${project.title}]`,
    `북미 10개 도시 · 총 10회 공연 (10월 11일 ~ 11월 13일)`,
    `모집: 남자 댄서 2명 · K-팝 장르`,
    `페이: 1,700만원 (12월 지급 예정)`,
    `숙박 · 식사 · 항공권 전액 지원`,
    `지원 마감: 7월 27일`,
    ``,
    `공고 보고 지원하기: ${cta}`,
    ``,
    `이 메일이 불필요하시면 아래 링크에서 수신거부하실 수 있습니다.`,
    `수신거부: ${unsub}`,
    ``,
    `deetz · 댄서 매거진 & 캐스팅 플랫폼`,
    `deetz.kr · contact@deetz.kr`,
  ].join("\n");

  const html = `<html lang="ko"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="${BASE}/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">댄서 매거진 &amp; 캐스팅 플랫폼</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#eef4ff;color:#2456c8;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">새 공고 추천</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${safeName}님께 맞는 공고가 올라왔어요</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">남자 솔로 아티스트 미주 투어 무대에 함께 설 남자 댄서를 찾고 있습니다.<br>조건을 확인하고 관심 있으시면 지원해 주세요.</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <p style="font-size:15px;font-weight:700;color:#111;margin:0 0 12px;line-height:1.5;">${esc(project.title)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tbody>
    <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">공연</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">북미 10개 도시 · 총 10회 (10.11~11.13)</td></tr>
    <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">모집</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">남자 댄서 2명 · K-팝 장르</td></tr>
    <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">페이</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">1,700만원 (12월 지급 예정)</td></tr>
    <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">지원</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">숙박 · 식사 · 항공권 전액 지원</td></tr>
    <tr><td style="vertical-align:top;width:76px;color:#6b7280;font-size:13px;padding:4px 0;">마감</td><td style="font-size:14px;line-height:1.6;color:#33363b;padding:4px 0;">7월 27일</td></tr>
    </tbody></table></div></td></tr>
<tr><td style="padding:16px 32px 24px;">
  <a href="${cta}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">공고 보고 지원하기 →</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="${BASE}/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">댄서 매거진 &amp; 캐스팅 플랫폼</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.7;">© 2026 deetz. All rights reserved.<br>이 메일은 deetz에 가입하신 주소로 발송되었습니다.<br><a href="${unsub}" style="color:#6b7280;text-decoration:underline;">추천·소식 메일 수신거부</a></div></td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `[deetz] ${name}님께 맞는 새 공고 — 미주 투어 남자 댄서 모집`, text, html };
}

function transporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD 누락");
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

async function sendOne(t, to, mail) {
  await t.sendMail({
    from: `"${FROM_NAME}" <${process.env.GMAIL_USER}>`,
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maskEmail = (e) => e.replace(/^(.).*(@.*)$/, "$1***$2");

// ── main ──
const { data: project } = await admin
  .from("projects")
  .select("id, title, short_code, status, visibility, deleted_at")
  .eq("short_code", code)
  .maybeSingle();
if (!project || project.deleted_at) throw new Error(`공고 없음: ${code}`);
if (project.status !== "open" || project.visibility !== "public") {
  throw new Error(`공고가 공개·모집중이 아님: ${project.status}/${project.visibility}`);
}
console.log(`공고: ${project.title} (${project.short_code}) — ${project.status}/${project.visibility}`);

// 테스트 발송: 대상 조회 없이 테스트 주소로 1통.
if (testEmail) {
  const mail = buildEmail({
    name: "테스트",
    project,
    token: "00000000-0000-0000-0000-000000000000",
  });
  const t = transporter();
  await sendOne(t, testEmail, mail);
  console.log(`✓ 테스트 발송 완료 → ${testEmail}`);
  process.exit(0);
}

const { data: rows, error } = await admin.rpc("recipients_project_recommend_male", { p_id: project.id });
if (error) throw new Error(`RPC 실패: ${error.message}`);
const recipients = (rows ?? []).filter((r) => r.profile_id && r.email);
console.log(`대상: ${recipients.length}명 (남자 · 미지원 · 수신거부 아님)`);

// 미리보기 HTML 저장
if (dump) {
  const sample = recipients[0] ?? { name: "샘플", profile_id: "x" };
  const mail = buildEmail({ name: sample.name, project, token: "preview-token" });
  const out = new URL("../tmp-recommend-preview.html", import.meta.url);
  writeFileSync(out, mail.html, "utf8");
  console.log(`미리보기 저장: ${out.pathname}`);
}

if (!send) {
  console.log("── dry-run (발송 안 함). 샘플 5명:");
  for (const r of recipients.slice(0, 5)) console.log(`  · ${r.name} <${maskEmail(r.email)}>`);
  console.log(`실제 발송하려면 --send, 테스트 1통은 --test <email>`);
  process.exit(0);
}

// prefs 행 보장 + 토큰 확보 (수신거부 링크용)
const ids = recipients.map((r) => r.profile_id);
await admin
  .from("notification_preferences")
  .upsert(ids.map((id) => ({ user_id: id })), { onConflict: "user_id", ignoreDuplicates: true });
const { data: prefRows } = await admin
  .from("notification_preferences")
  .select("user_id, unsubscribe_token, email_unsubscribed_all")
  .in("user_id", ids);
const tokenByUser = new Map((prefRows ?? []).map((p) => [p.user_id, p]));

// 멱등 로그: 이미 보낸 사람 제외
const { data: inserted, error: logErr } = await admin
  .from("project_notification_log")
  .upsert(
    ids.map((id) => ({ project_id: project.id, recipient_id: id, channel: "email_recommend" })),
    { onConflict: "project_id,recipient_id,channel", ignoreDuplicates: true },
  )
  .select("recipient_id");
if (logErr) throw new Error(`로그 실패: ${logErr.message}`);
const freshIds = new Set((inserted ?? []).map((r) => r.recipient_id));
const toSend = recipients.filter((r) => freshIds.has(r.profile_id));
console.log(`신규 발송 대상: ${toSend.length}명 (이미 보낸 ${recipients.length - toSend.length}명 제외)`);

const t = transporter();
let sent = 0;
const failed = [];
for (const r of toSend) {
  const pref = tokenByUser.get(r.profile_id);
  if (pref?.email_unsubscribed_all) continue; // 방어적: 사이에 수신거부한 사람 스킵
  const mail = buildEmail({ name: r.name, project, token: pref?.unsubscribe_token ?? "" });
  try {
    await sendOne(t, r.email, mail);
    sent += 1;
    if (sent % 20 === 0) console.log(`  … ${sent}/${toSend.length}`);
  } catch (e) {
    failed.push({ email: maskEmail(r.email), error: (e.message ?? "").slice(0, 120) });
    // 실패한 사람은 로그를 되돌려 다음 실행에서 재시도되게 함
    await admin.from("project_notification_log").delete()
      .match({ project_id: project.id, recipient_id: r.profile_id, channel: "email_recommend" });
  }
  await sleep(THROTTLE_MS);
}

console.log(`\n완료: 발송 ${sent}건 / 실패 ${failed.length}건`);
if (failed.length) console.log(JSON.stringify(failed.slice(0, 10), null, 2));
process.exit(0);
