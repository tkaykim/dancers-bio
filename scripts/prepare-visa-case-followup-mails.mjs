import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT_DIR = "C:\\Users\\tkay\\Documents\\Codex\\2026-07-23\\deetz\\outputs\\visa-followup-mails";
const FALLBACK_ENV = "C:\\Users\\tkay\\Desktop\\dev\\dancers-bio\\.env.local";
const DEETZ_FROM_NAME = "deetz 에이전시 & 매거진";
const REPLY_TO = "contact@deetz.kr";
const TRACKING_CAMPAIGN = "visa_case_followup_20260723";

function loadEnv(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return;
  for (const line of fs.readFileSync(resolved, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function argValue(name, fallback = null) {
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sign(payload, key) {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function makeVisaCaseToken(applicationId) {
  const payload = `vc:${applicationId}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))}`;
}

function makeVisaFollowupTrackingToken(applicationId) {
  const payload = `vf:${applicationId}:${TRACKING_CAMPAIGN}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))}`;
}

function normalizeLang(value) {
  return value === "ja" || value === "ko" ? value : "en";
}

function safeFilePart(value) {
  return String(value ?? "applicant")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "applicant";
}

function formatKst(value) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COPY = {
  en: {
    htmlLang: "en",
    subject: "[deetz] Next step for your Korea dance program",
    tagline: "Dancer magazine &amp; casting platform",
    eyebrow: "Next step",
    title: "Please complete your deetz case information",
    cta: "Submit additional info + video meeting times",
    copyright: "This email was sent to the address used for your deetz application.",
    lines: (name) => [
      `Hi ${name},`,
      "Thank you for applying to the deetz Korea dance program.",
      "GRIGO Entertainment has been working in Korea for about seven years across dance management, agency work, choreography production, and event production.",
      "We work with represented artists and a dancer network in Korea, so deetz can guide overseas dancers toward a realistic next step.",
      "We reviewed your initial application, and the next step is to complete your personal case form.",
      "Please open the link below and share three times when you can join an online meeting by Zoom or Google Meet.",
      "The form also asks what support you may need in Korea, such as dance training, housing, Korean language support, and arrival or transport support.",
      "deetz project opportunities may be shared with you, but casting, paid work, and visa approval are not guaranteed.",
      "If you have any questions, please reply to this email.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    htmlLang: "ja",
    subject: "[deetz] 韓国活動プログラムの次のステップ",
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    eyebrow: "次のステップ",
    title: "deetz専用フォームへのご入力をお願いします",
    cta: "追加情報＋オンラインミーティング日時を提出する",
    copyright: "このメールはdeetz申込時の登録アドレスへ送信されました。",
    lines: (name) => [
      `${name}様`,
      "deetzの韓国活動プログラムにお申し込みいただきありがとうございます。",
      "GRIGO Entertainmentは、韓国で約7年にわたり、ダンスマネジメント、エージェンシー、振付制作、イベント制作などを行っている会社です。",
      "所属アーティストと韓国のダンサーネットワークを基盤に、海外ダンサーの韓国活動に向けた現実的な次のステップをご案内しています。",
      "初回のお申し込み内容を確認し、次のステップとして専用フォームへの追加入力をお願いしております。",
      "下のリンクを開き、ZoomまたはGoogle Meetでのオンラインミーティングが可能な日時を3つご入力ください。",
      "フォームでは、ダンストレーニング、住居、韓国語、入国・交通など、韓国での活動に必要なサポートも確認します。",
      "deetzの案件をご案内する場合がありますが、キャスティング、有償のお仕事、ビザ発給を保証するものではありません。",
      "ご不明な点がありましたら、このメールにそのままご返信ください。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
  ko: {
    htmlLang: "ko",
    subject: "[deetz] 한국 활동 프로그램 다음 단계 안내",
    tagline: "댄서 매거진 &amp; 캐스팅 플랫폼",
    eyebrow: "다음 단계",
    title: "deetz 전용 질문지 입력을 부탁드립니다",
    cta: "추가정보 + 화상 미팅 일정 제출하기",
    copyright: "이 메일은 deetz 신청 주소로 발송되었습니다.",
    lines: (name) => [
      `안녕하세요, ${name}님.`,
      "deetz 한국 활동 프로그램에 지원해 주셔서 감사합니다.",
      "그리고엔터테인먼트는 약 7년 동안 한국에서 댄스 매니지먼트, 에이전시, 안무 제작, 행사 제작 등을 해온 회사입니다.",
      "현재 소속 아티스트들과 댄서 네트워크를 기반으로, 한국 활동을 준비하는 해외 댄서에게 현실적인 다음 단계를 안내하고 있습니다.",
      "최초 지원 내용을 확인했고, 다음 단계로 개인 케이스 질문지 입력을 부탁드립니다.",
      "아래 링크를 열고 온라인 미팅 (Zoom 또는 Google Meet)이 가능한 날짜와 시간을 3개 입력해 주세요.",
      "질문지에서는 댄스 트레이닝, 주거, 한국어 언어, 입국·교통 등 한국 활동을 위해 필요한 지원도 함께 확인합니다.",
      "deetz 프로젝트 기회를 안내할 수 있지만, 캐스팅과 유급 일거리, 비자 발급을 보장하는 것은 아닙니다.",
      "문의사항이 있으시면 이 메일에 바로 답장해 주세요.",
      "감사합니다.",
      "deetz",
    ],
  },
};

function renderMail({ lang, name, trackingUrl, openPixelUrl }) {
  const c = COPY[lang];
  const lines = c.lines(name);
  const bodyHtml = lines
    .map((line) => `<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0 0 12px;">${escapeHtml(line)}</p>`)
    .join("");
  const text = [
    ...lines,
    "",
    `${c.cta}: ${trackingUrl}`,
    "",
    `deetz · deetz.kr · ${REPLY_TO}`,
  ].join("\n");
  const html = `<html lang="${c.htmlLang}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${c.tagline}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${escapeHtml(c.eyebrow)}</span>
  <p style="font-size:20px;font-weight:800;margin:18px 0 14px;line-height:1.45;color:#111;">${escapeHtml(c.title)}</p>
  ${bodyHtml}</td></tr>
<tr><td style="padding:18px 32px 28px;">
  <a href="${escapeHtml(trackingUrl)}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${escapeHtml(c.cta)}</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${c.tagline}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz_magazine/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:${REPLY_TO}" style="color:#44474d;text-decoration:none;">${REPLY_TO}</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${escapeHtml(c.copyright)}</div>
  <img src="${escapeHtml(openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;"></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: c.subject, text, html };
}

function assertMailSafe({ subject, text, html }) {
  const combined = `${subject}\n${text}\n${html}`;
  const forbidden = [
    "Zoom 상담",
    "합정",
    "신촌",
    "8월 1회",
    "9월 1회",
    "은행·휴대폰",
    "기본 안내 단가",
    "예상 단가",
    "예상 단가 400만원",
    "400만원",
    "想定料金",
    "400万",
    "₩4,000,000",
    "4,000,000",
    "estimated ₩",
    "estimated fee",
    "fee includes",
    "\uFFFD",
  ];
  const hit = forbidden.find((needle) => combined.includes(needle));
  if (hit) throw new Error(`mail content contains forbidden wording: ${hit}`);
  if (/\?{3,}/.test(combined)) throw new Error("mail content contains suspicious question-mark mojibake");
}

loadEnv(".env.local");
loadEnv(FALLBACK_ENV);

const send = process.argv.includes("--send");
const confirmSend = argValue("--confirm-send");
const force = process.argv.includes("--force");
const outputRoot = argValue("--out", DEFAULT_OUTPUT_DIR);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");
const batch = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.join(outputRoot, batch);
fs.mkdirSync(outputDir, { recursive: true });

if (send && confirmSend !== "VISA_CASE_FOLLOWUP") {
  throw new Error("Refusing to send without --confirm-send=VISA_CASE_FOLLOWUP");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is missing");

const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
const { data, error } = await sb
  .from("dancer_visa_applications")
  .select("id, created_at, email, preferred_lang, source, status, case_stage, follow_up_submitted_at, dancer_id, dancers(stage_name,korean_name)")
  .order("created_at", { ascending: false });
if (error) throw error;

const candidates = (data ?? []).filter((row) =>
  row.source === "program" &&
  !row.follow_up_submitted_at &&
  row.status !== "rejected" &&
  row.status !== "on_hold"
);

const sentLogPath = path.join(outputRoot, "sent-log.jsonl");
const sentIds = new Set();
if (fs.existsSync(sentLogPath) && !force) {
  for (const line of fs.readFileSync(sentLogPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.applicationId) sentIds.add(parsed.applicationId);
    } catch {
      // Ignore malformed historical log lines.
    }
  }
}

// --only=a@b.com,c@d.com 로 수신자를 명시 지정한다.
// sent-log.jsonl 이 유실되면 이미 받은 사람까지 후보로 잡히므로, 특정 인원만 보낼 때는 항상 이 필터를 쓴다.
const onlyRaw = argValue("--only");
const onlyKeys = onlyRaw
  ? new Set(onlyRaw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean))
  : null;
if (onlyKeys) {
  const matched = candidates.filter(
    (row) => onlyKeys.has(String(row.email).toLowerCase()) || onlyKeys.has(row.id),
  );
  const missing = [...onlyKeys].filter(
    (key) => !matched.some((row) => String(row.email).toLowerCase() === key || row.id === key),
  );
  if (missing.length) {
    throw new Error(`--only 대상이 후보에 없습니다: ${missing.join(", ")}`);
  }
}

const rows = candidates
  .filter((row) => (onlyKeys ? onlyKeys.has(String(row.email).toLowerCase()) || onlyKeys.has(row.id) : true))
  .filter((row) => force || !sentIds.has(row.id))
  .map((row) => {
    const lang = normalizeLang(row.preferred_lang);
    const name = row.dancers?.stage_name || row.dancers?.korean_name || "dancer";
    const directCaseUrl = `${siteUrl}/visa/case/${makeVisaCaseToken(row.id)}`;
    const trackingToken = makeVisaFollowupTrackingToken(row.id);
    const trackingUrl = `${siteUrl}/api/track/visa-case/click?t=${encodeURIComponent(trackingToken)}&lang=${encodeURIComponent(lang)}`;
    const openPixelUrl = `${siteUrl}/api/track/visa-case/open?t=${encodeURIComponent(trackingToken)}&lang=${encodeURIComponent(lang)}`;
    const mail = renderMail({ lang, name, trackingUrl, openPixelUrl });
    assertMailSafe(mail);
    const base = `${lang}-${safeFilePart(name)}-${row.id.slice(0, 8)}`;
    const htmlPath = path.join(outputDir, `${base}.html`);
    const textPath = path.join(outputDir, `${base}.txt`);
    fs.writeFileSync(htmlPath, mail.html, "utf8");
    fs.writeFileSync(textPath, mail.text, "utf8");
    return {
      applicationId: row.id,
      createdAt: row.created_at,
      createdAtKst: formatKst(row.created_at),
      email: row.email,
      name,
      lang,
      subject: mail.subject,
      caseUrl: trackingUrl,
      directCaseUrl,
      trackingToken,
      trackingUrl,
      openPixelUrl,
      htmlPath,
      textPath,
      mail,
    };
  });

const byLang = rows.reduce((acc, row) => {
  acc[row.lang] = (acc[row.lang] ?? 0) + 1;
  return acc;
}, {});

const csv = [
  ["application_id", "created_at_kst", "email", "name", "lang", "subject", "case_url", "direct_case_url", "html_path", "text_path"].join(","),
  ...rows.map((row) => [
    row.applicationId,
    row.createdAtKst,
    row.email,
    row.name,
    row.lang,
    row.subject,
    row.caseUrl,
    row.directCaseUrl,
    row.htmlPath,
    row.textPath,
  ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")),
].join("\n");

const manifestPath = path.join(outputDir, "manifest.json");
const csvPath = path.join(outputDir, "recipients.csv");
fs.writeFileSync(csvPath, csv, "utf8");
fs.writeFileSync(manifestPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  dryRun: !send,
  candidateCount: candidates.length,
  skippedAlreadySent: candidates.length - rows.length,
  preparedCount: rows.length,
  byLang,
  outputDir,
  csvPath,
  recipients: rows.map((row) => ({
    applicationId: row.applicationId,
    createdAt: row.createdAt,
    createdAtKst: row.createdAtKst,
    email: row.email,
    name: row.name,
    lang: row.lang,
    subject: row.subject,
    caseUrl: row.caseUrl,
    directCaseUrl: row.directCaseUrl,
    htmlPath: row.htmlPath,
    textPath: row.textPath,
  })),
}, null, 2), "utf8");

let sendResults = [];
if (send) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: requiredEnv("GMAIL_USER"),
      pass: requiredEnv("GMAIL_APP_PASSWORD"),
    },
  });
  for (const row of rows) {
    try {
      const result = await transporter.sendMail({
        from: `"${DEETZ_FROM_NAME}" <${requiredEnv("GMAIL_USER")}>`,
        to: row.email,
        replyTo: REPLY_TO,
        subject: row.mail.subject,
        text: row.mail.text,
        html: row.mail.html,
      });
      const log = {
        sentAt: new Date().toISOString(),
        applicationId: row.applicationId,
        email: row.email,
        lang: row.lang,
        messageId: result.messageId ?? null,
      };
      await sb.from("visa_case_tracking_events").insert({
        application_id: row.applicationId,
        campaign: TRACKING_CAMPAIGN,
        event_type: "email_sent",
        event_key: "gmail_smtp",
        lang: row.lang,
        metadata: { messageId: result.messageId ?? null },
      });
      sendResults.push({ ...log, ok: true });
      fs.appendFileSync(sentLogPath, `${JSON.stringify(log)}\n`, "utf8");
    } catch (error) {
      sendResults.push({
        applicationId: row.applicationId,
        email: row.email,
        lang: row.lang,
        ok: false,
        error: error.message,
      });
    }
  }
  fs.writeFileSync(path.join(outputDir, "send-results.json"), JSON.stringify(sendResults, null, 2), "utf8");
}

console.log(JSON.stringify({
  mode: send ? "send" : "dry-run",
  candidateCount: candidates.length,
  preparedCount: rows.length,
  byLang,
  outputDir,
  manifestPath,
  csvPath,
  sent: sendResults.filter((row) => row.ok).length,
  failed: sendResults.filter((row) => !row.ok).length,
}, null, 2));
