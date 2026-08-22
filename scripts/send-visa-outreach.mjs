// deetz E-6-1 비자 온보딩 아웃리치 메일 (외국인 댄서 대상).
// 정본 메일 양식(560px 카드 + 로고 이미지 + SNS 푸터). 영어/일본어 2언어 × 2세그먼트.
//   세그먼트 A = 마이그레이션 때 비자정보 제출함 → 등록된 비자 확인/갱신 + (필요시)E-6-1 상담, CTA=회신(mailto)
//   세그먼트 B = 비자 없음 → /visa 설문 유도
//
//   node scripts/send-visa-outreach.mjs list   # 수신자 목록만 출력
//   node scripts/send-visa-outreach.mjs test   # tommy062166@gmail.com 으로 A/B × en/ja 4통
//   node scripts/send-visa-outreach.mjs send    # 실발송
//
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { listUnsubscribeHeaders } from "./lib/list-unsubscribe.mjs";
import { createClient } from "@supabase/supabase-js";

const TEST_TO = "tommy062166@gmail.com";
const VISA_URL = "https://deetz.kr/visa";
const REPLY_TO = "dancers.bio.kr@gmail.com";
const LOGO = "https://www.deetz.kr/brand/deetz-logo-black.png";
const YT = "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png";
const IG = "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png";
const EXCLUDE = new Set(["tommy062166@gmail.com"]);
const EXCLUDE_DOMAINS = ["example.com"];

function loadEnv(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return;
  for (const line of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(".env.local");
loadEnv(".env");

function req(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
}
function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function assertMailSafe(s) {
  if (s.includes("�")) throw new Error("mail has replacement chars");
  if (/\?{3,}/.test(s)) throw new Error("mail has mojibake");
}

// 세그먼트 A: 등록된 비자 확인/갱신
const A = {
  en: {
    subject: "deetz has your visa on file — please confirm it's current",
    tagline: "Dancer magazine &amp; casting platform",
    eyebrow: "Visa support",
    greeting: (n) => `Hi ${esc(n)},`,
    intro: "We're reaching out from deetz about your visa for dancing in Korea. Here's what we have on file for you:",
    boxLabel: "Your visa on file",
    body2:
      "Is this still correct? If it's changed or expiring soon, just reply to this email and we'll update it.<br><br>" +
      "One note: student (D-2 / D-4), working-holiday (H-1) or job-seeking (D-10) visas usually don't allow paid performance work — for that you may need an <b>E-6-1 (Arts &amp; Entertainment)</b> visa. If you plan to perform professionally, reply and we'll help you check and prepare.",
    cta: "Confirm or update my visa",
    optout: "You're receiving this because you're in the deetz dancer network. Reply \"unsubscribe\" to opt out.",
  },
  ja: {
    subject: "deetzにご登録のビザ情報のご確認のお願い",
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    eyebrow: "ビザサポート",
    greeting: (n) => `${esc(n)}様`,
    intro: "韓国での活動に関するビザについて、deetzよりご連絡します。現在、以下の情報をお預かりしています：",
    boxLabel: "ご登録のビザ",
    body2:
      "内容に変更や有効期限が近い場合は、このメールにご返信ください。更新いたします。<br><br>" +
      "なお、留学（D-2 / D-4）・ワーキングホリデー（H-1）・求職（D-10）などのビザでは、有給の公演活動ができない場合があります。プロとして公演される予定の方は、<b>E-6-1（芸術興行）</b>ビザが必要になることがあります。ご返信いただければ確認・準備をお手伝いします。",
    cta: "ビザ情報を確認・更新する",
    optout: "deetzダンサーネットワークの方へお送りしています。配信停止は「unsubscribe」とご返信ください。",
  },
};

// 세그먼트 B: 비자 없음 → /visa 설문
const B = {
  en: {
    subject: "Dancing in Korea? You'll need an E-6-1 visa — we can help",
    tagline: "Dancer magazine &amp; casting platform",
    eyebrow: "Visa support",
    greeting: (n) => `Hi ${esc(n)},`,
    intro:
      "To perform as a dancer in Korea, you need an <b>E-6-1 (Arts &amp; Entertainment)</b> visa. deetz helps foreign dancers prepare for it — from checking your situation to guiding the documents you'll need and supporting your application.",
    body2: "It starts with a short questionnaire (a few minutes). Once you submit, our team gathers applicants and reaches out with a clear next step.",
    cta: "Start the visa questionnaire",
    optout: "You're receiving this because you're in the deetz dancer network. Reply \"unsubscribe\" to opt out.",
  },
  ja: {
    subject: "韓国で踊るにはE-6-1ビザが必要です — deetzがサポートします",
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    eyebrow: "ビザサポート",
    greeting: (n) => `${esc(n)}様`,
    intro:
      "韓国でダンサーとして活動するには、<b>E-6-1（芸術興行）</b>ビザが必要です。状況の確認から必要書類のご案内、申請まで、deetzがサポートします。",
    body2: "まずは数分の簡単なアンケートから。ご提出後、担当者が申請者を取りまとめ、次のステップをご案内します。",
    cta: "ビザのアンケートを始める",
    optout: "deetzダンサーネットワークの方へお送りしています。配信停止は「unsubscribe」とご返信ください。",
  },
};

function shell(c, innerHtml) {
  return `<html lang="auto"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="${LOGO}" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${c.tagline}</div></td></tr>
${innerHtml}
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="${LOGO}" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${c.tagline}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="${YT}" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz_magazine/"><img src="${IG}" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;"><a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:${REPLY_TO}" style="color:#44474d;text-decoration:none;">${REPLY_TO}</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${esc(c.optout)}</div></td></tr>
</table></td></tr></table></body></html>`;
}

function renderA(lang, name, visaDetail) {
  const c = A[lang] ?? A.en;
  const box = esc(visaDetail || "").replace(/\r?\n/g, "<br>");
  const mailto = `mailto:${REPLY_TO}?subject=${encodeURIComponent("[Visa] " + name)}`;
  const inner = `<tr><td style="padding:30px 32px 8px;color:#111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c.eyebrow)}</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${c.greeting(name)}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${c.intro}</p></td></tr>
<tr><td style="padding:14px 32px 4px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:14px 16px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin-bottom:6px;">${esc(c.boxLabel)}</div>
    <div style="font-size:15px;font-weight:700;color:#111;line-height:1.6;">${box || "-"}</div></div></td></tr>
<tr><td style="padding:14px 32px 8px;color:#33363b;">
  <p style="font-size:14px;line-height:1.75;margin:0;">${c.body2}</p></td></tr>
<tr><td style="padding:14px 32px 26px;">
  <a href="${mailto}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${esc(c.cta)} →</a></td></tr>`;
  const subject = c.subject;
  const text = [
    c.greeting(name).replace(/<[^>]+>/g, ""),
    "",
    c.intro.replace(/<[^>]+>/g, ""),
    `  [${c.boxLabel}] ${visaDetail || "-"}`,
    "",
    c.body2.replace(/<br>/g, "\n").replace(/<[^>]+>/g, ""),
    "",
    `${c.cta}: ${REPLY_TO} 로 회신`,
    "",
    `deetz · deetz.kr · ${REPLY_TO}`,
    c.optout,
  ].join("\n");
  const html = shell(c, inner);
  assertMailSafe(`${subject}\n${text}\n${html}`);
  return { subject, text, html };
}

function renderB(lang, name) {
  const c = B[lang] ?? B.en;
  const inner = `<tr><td style="padding:30px 32px 8px;color:#111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c.eyebrow)}</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${c.greeting(name)}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0 0 12px;">${c.intro}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${c.body2}</p></td></tr>
<tr><td style="padding:18px 32px 26px;">
  <a href="${VISA_URL}" style="display:block;background:#111;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${esc(c.cta)} →</a></td></tr>`;
  const subject = c.subject;
  const text = [
    c.greeting(name).replace(/<[^>]+>/g, ""),
    "",
    c.intro.replace(/<[^>]+>/g, ""),
    "",
    c.body2.replace(/<[^>]+>/g, ""),
    "",
    `${c.cta}: ${VISA_URL}`,
    "",
    `deetz · deetz.kr · ${REPLY_TO}`,
    c.optout,
  ].join("\n");
  const html = shell(c, inner);
  assertMailSafe(`${subject}\n${text}\n${html}`);
  return { subject, text, html };
}

function renderMail(segment, lang, name, visaDetail) {
  return segment === "A" ? renderA(lang, name, visaDetail) : renderB(lang, name);
}

function displayName(stage, korean) {
  const junk = !stage || stage.length > 24 || stage.includes(",") || stage.trim() === "ㅡ";
  const base = (junk ? korean || stage : stage) || "there";
  return String(base).trim().split("/")[0].split(/\s+/)[0];
}

function makeTransport() {
  const user = req("GMAIL_USER");
  const pass = req("GMAIL_APP_PASSWORD");
  return { t: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }), user };
}

async function getRecipients() {
  const url = req("NEXT_PUBLIC_SUPABASE_URL");
  const key = req("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("dancer_private_info")
    .select("email, nationality, has_visa, visa_details, dancers(stage_name, korean_name)")
    .not("nationality", "is", null)
    .neq("nationality", "대한민국")
    .not("email", "is", null);
  if (error) throw error;
  const seen = new Set();
  const out = [];
  for (const r of data) {
    const email = (r.email || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    if (EXCLUDE.has(email)) continue;
    if (EXCLUDE_DOMAINS.some((d) => email.endsWith("@" + d))) continue;
    seen.add(email);
    const d = r.dancers || {};
    const hasInfo = r.has_visa === true || (r.visa_details && r.visa_details.trim());
    out.push({
      email: r.email.trim(),
      nationality: r.nationality,
      lang: r.nationality === "일본" ? "ja" : "en",
      segment: hasInfo ? "A" : "B",
      visaDetail: r.visa_details || "",
      name: displayName(d.stage_name, d.korean_name),
    });
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mode = process.argv[2] || "list";

  if (mode === "list") {
    const rs = await getRecipients();
    const a = rs.filter((r) => r.segment === "A").length;
    console.log(`수신자 ${rs.length}명 (A=비자정보있음 ${a} / B=비자없음 ${rs.length - a}):`);
    for (const r of rs)
      console.log(`  [${r.segment}][${r.lang}] ${r.name.padEnd(14)} ${r.nationality.padEnd(8)} ${r.email}${r.segment === "A" ? "  ← " + r.visaDetail.replace(/\s+/g, " ").slice(0, 40) : ""}`);
    return;
  }

  const { t, user } = makeTransport();
  const from = `"deetz" <${user}>`;

  if (mode === "test") {
    const samples = [
      ["A", "en", "Mei", "E-6 (2027.06.05)"],
      ["A", "ja", "Kaede", "H-1 워킹홀리데이"],
      ["B", "en", "Sarah", ""],
      ["B", "ja", "Kaede", ""],
    ];
    for (const [seg, lang, name, vd] of samples) {
      const m = renderMail(seg, lang, name, vd);
      await t.sendMail({ from, to: TEST_TO, subject: `[TEST ${seg}/${lang}] ${m.subject}`, text: m.text, html: m.html, headers: listUnsubscribeHeaders(null) });
      console.log(`test ${seg}/${lang} → ${TEST_TO} ✓`);
    }
    return;
  }

  if (mode === "send") {
    const rs = await getRecipients();
    console.log(`실발송 시작: ${rs.length}명`);
    let ok = 0, fail = 0;
    for (const r of rs) {
      const m = renderMail(r.segment, r.lang, r.name, r.visaDetail);
      try {
        // 계정 미연결 수신자가 대부분이라 토큰이 없다 → mailto 수신거부만 (원클릭 미선언).
        // 본문 optout 문구("Reply unsubscribe")와 같은 경로다.
        await t.sendMail({ from, to: r.email, subject: m.subject, text: m.text, html: m.html, headers: listUnsubscribeHeaders(null) });
        ok++;
        console.log(`  ✓ [${r.segment}/${r.lang}] ${r.email}`);
      } catch (e) {
        fail++;
        console.log(`  ✗ ${r.email}: ${(e && e.message) || e}`);
      }
      await sleep(1500);
    }
    console.log(`완료: 성공 ${ok} / 실패 ${fail}`);
    return;
  }

  console.log("usage: node scripts/send-visa-outreach.mjs [list|test|send]");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
