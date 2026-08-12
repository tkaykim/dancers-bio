// deetz 비자/프로그램 지원자 2단계 운영 메일 (2026-07-28 배치).
//
// 세 가지 메일 세트를 한 스크립트에서 생성·발송한다.
//   confirm    온라인 미팅 일정 확정 안내 (일시 + 미팅 링크)
//   reschedule 제출한 희망 일정이 모두 지나가 다시 일정을 받는 안내
//   revive     추가 질문지 미제출자에게 진행 희망 여부 확인 (계속 진행 / 진행 안 함 사유 설문)
//
// 기본은 dry-run이다. 실제 발송은 --send + --confirm-send=VISA_STAGE2 를 함께 넣어야 한다.
// --test 는 대표 확인용 시험발송 모드로, 실제 지원자 대신 내부 주소로만 3개 언어를 보낸다.
//
// 양식·발신·추적 방식은 scripts/prepare-visa-case-followup-mails.mjs 와 동일한 정본을 따른다.

import fs from "node:fs";
import path from "node:path";
import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_OUTPUT_DIR = "C:\\Users\\tkay\\Documents\\Codex\\2026-07-28\\deetz\\outputs\\visa-stage2-mails";
const FALLBACK_ENV = "C:\\Users\\tkay\\Desktop\\dev\\dancers-bio\\.env.local";
const DEETZ_FROM_NAME = "deetz 에이전시 & 매거진";
const REPLY_TO = "contact@deetz.kr";
const TRACKING_CAMPAIGN = "visa_case_stage2_20260728";

// 시험발송 수신자 (대표 확인용).
const TEST_RECIPIENTS = [
  { email: "tommy062166@gmail.com", applicationId: "15fd5e3b-7173-4c35-b84c-dc3878aa942f", name: "Tommy" },
  { email: "hs@astcompany.co.kr", applicationId: "42878cc7-7bff-45c4-9e73-fb369f3fef33", name: "Hyunsoo" },
];

// 확정된 온라인 미팅 (대표 확정분). at 은 KST 기준 로컬 시각.
const CONFIRMED_MEETINGS = {
  "miku20010921@icloud.com": {
    at: "2026-07-29T15:00",
    url: "https://us05web.zoom.us/j/87171723198?pwd=HOUo6krE0xO5qgTDaF34V0cbbCiTnE.1",
  },
  "ian.dance28@gmail.com": {
    at: "2026-07-30T13:00",
    url: "https://us05web.zoom.us/j/89561005965?pwd=xAJmgDa3CpXkVKKNxFXxRHrCsbq2PK.1",
  },
  // 2026-08-04 대표 확정분
  "khl.nastya19@gmail.com": {
    at: "2026-08-04T17:00",
    url: "https://us05web.zoom.us/j/87354071016?pwd=rAkJn6gODCkV0SQz7bCr1q5iRhFh2O.1",
  },
  "ssunnysiia@gmail.com": {
    at: "2026-08-05T17:00",
    url: "https://us05web.zoom.us/j/88574304300?pwd=MQi4m0CA2gKBLh0lORF0lgHqLiFbXw.1",
  },
  "anyamuss11@gmail.com": {
    at: "2026-08-06T16:00",
    url: "https://us05web.zoom.us/j/83784472377?pwd=WgN1hmrPl5apg0FEIAXUHcJbpSWa65.1",
  },
};

// 시험발송에서 confirm 세트에 사용할 샘플 일정.
const TEST_MEETING = {
  at: "2026-07-29T15:00",
  url: "https://us05web.zoom.us/j/87171723198?pwd=HOUo6krE0xO5qgTDaF34V0cbbCiTnE.1",
};

// 내부·테스트 계정은 실제 발송 대상에서 항상 제외한다.
const INTERNAL_DOMAINS = ["grigoent.co.kr", "astcompany.co.kr"];
const INTERNAL_EMAILS = new Set(TEST_RECIPIENTS.map((row) => row.email.toLowerCase()));

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

function makeTrackingToken(applicationId) {
  const payload = `vf:${applicationId}:${TRACKING_CAMPAIGN}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))}`;
}

// "Kio | 키오"처럼 활동명에 구분자가 들어간 경우 호칭에는 앞부분만 쓴다.
function displayName(value) {
  const cleaned = String(value ?? "")
    .split("|")[0]
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
  return cleaned || "dancer";
}

function normalizeLang(value) {
  return value === "ja" || value === "ko" ? value : "en";
}

function safeFilePart(value) {
  return (
    String(value ?? "applicant")
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "applicant"
  );
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

// "2026-07-29T15:00" (KST 로컬) → Date
function kstLocalToDate(value) {
  return new Date(`${value.length === 16 ? `${value}:00` : value}+09:00`);
}

function formatMeetingAt(value, lang) {
  const date = kstLocalToDate(value);
  if (lang === "ko") {
    return `${date.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    })} (KST, 한국 표준시)`;
  }
  if (lang === "ja") {
    return `${date.toLocaleString("ja-JP", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    })} (KST・韓国標準時)`;
  }
  return `${date.toLocaleString("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} (KST, Korea Standard Time)`;
}

// ── 메일 카피 ──────────────────────────────────────────────────────────────

const CONFIRM_COPY = {
  en: {
    subject: "[deetz] Your online meeting is confirmed",
    eyebrow: "Meeting confirmed",
    title: "Your online meeting schedule",
    boxTitle: "Online meeting",
    boxAfterLine: 3,
    boxDateLabel: "Date and time",
    boxLinkLabel: "Meeting link",
    cta: "Open the meeting link",
    lines: (name) => [
      `Hi ${name},`,
      "Thank you for applying to the deetz Korea dance program.",
      "Your online meeting has been confirmed as below.",
      "Please join about five minutes before the scheduled time so we can start smoothly.",
      "If this time no longer works for you, simply reply to this email and we will arrange another time.",
      "We look forward to meeting you.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] オンラインミーティング日程確定のご案内",
    eyebrow: "日程確定",
    title: "オンラインミーティングの日程が確定しました",
    boxTitle: "オンラインミーティング",
    boxAfterLine: 3,
    boxDateLabel: "日時",
    boxLinkLabel: "ミーティングリンク",
    cta: "ミーティングリンクを開く",
    lines: (name) => [
      `${name}様`,
      "deetzの韓国活動プログラムにお申し込みいただきありがとうございます。",
      "オンラインミーティングの日程が下記のとおり確定しましたのでご案内いたします。",
      "当日は円滑に進行できるよう、予定時刻の5分ほど前にご参加いただけますと幸いです。",
      "ご都合が合わなくなった場合は、このメールにそのままご返信ください。別の日程を調整いたします。",
      "ミーティングでお会いできることを楽しみにしております。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
  ko: {
    subject: "[deetz] 온라인 미팅 일정 확정 안내",
    eyebrow: "일정 확정",
    title: "온라인 미팅 일정이 확정되었습니다",
    boxTitle: "온라인 미팅",
    boxAfterLine: 3,
    boxDateLabel: "일시",
    boxLinkLabel: "미팅 링크",
    cta: "미팅 링크 열기",
    lines: (name) => [
      `안녕하세요, ${name}님.`,
      "deetz 한국 활동 프로그램에 지원해 주셔서 감사합니다.",
      "온라인 미팅 일정이 아래와 같이 확정되어 안내드립니다.",
      "당일에는 원활한 진행을 위해 예정된 시간보다 5분 정도 먼저 접속해 주시면 감사하겠습니다.",
      "일정이 어려워지신 경우에는 이 메일에 바로 답장해 주시면 다른 일정으로 다시 조율해 드리겠습니다.",
      "미팅에서 뵙기를 기대하겠습니다.",
      "감사합니다.",
      "deetz",
    ],
  },
};

const RESCHEDULE_COPY = {
  en: {
    subject: "[deetz] Please share new online meeting times",
    eyebrow: "New times needed",
    title: "We need to rearrange your online meeting",
    cta: "Send new meeting times",
    lines: (name) => [
      `Hi ${name},`,
      "Thank you for applying to the deetz Korea dance program.",
      "The times you shared are already taken by meetings booked earlier, so we would like to ask for new options.",
      "Please open the link below and choose three new times when you can join an online meeting by Zoom or Google Meet.",
      "Once we receive them, we will confirm one time and send you the meeting link.",
      "If you have any questions, please reply to this email.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] オンラインミーティング日程の再調整のお願い",
    eyebrow: "日程の再調整",
    title: "オンラインミーティングの日程を再度お伺いします",
    cta: "新しい候補日時を提出する",
    lines: (name) => [
      `${name}様`,
      "deetzの韓国活動プログラムにお申し込みいただきありがとうございます。",
      "ご提出いただいた候補日時は、先にお申し込みいただいた方々とのミーティングが既に入っており、別の候補日時をお伺いしたくご連絡いたしました。",
      "お手数ですが、下のリンクから、ZoomまたはGoogle Meetでのオンラインミーティングが可能な日時を新たに3つご選択ください。",
      "確認後、可能な日程でミーティングを確定し、ミーティングリンクをご案内いたします。",
      "ご不明な点がありましたら、このメールにそのままご返信ください。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
  ko: {
    subject: "[deetz] 온라인 미팅 일정 재조율 안내",
    eyebrow: "일정 재조율",
    title: "온라인 미팅 일정을 다시 여쭙습니다",
    cta: "가능한 일정 다시 제출하기",
    lines: (name) => [
      `안녕하세요, ${name}님.`,
      "deetz 한국 활동 프로그램에 관심을 가지고 신청해 주셔서 감사합니다.",
      "보내주신 희망 일정은 먼저 신청하신 분들과의 미팅이 이미 잡혀 있어, 다른 가능한 날짜를 확인하고자 연락드립니다.",
      "번거로우시겠지만 아래 링크에서 온라인 미팅 (Zoom 또는 Google Meet)이 가능한 날짜와 시간을 3개 다시 선택해 주세요.",
      "확인 후 가능한 일정으로 미팅을 확정해 미팅 링크와 함께 안내드리겠습니다.",
      "문의사항이 있으시면 이 메일에 바로 답장해 주세요.",
      "감사합니다.",
      "deetz",
    ],
  },
};

const REVIVE_COPY = {
  en: {
    subject: "[deetz] Are you still interested in the program?",
    eyebrow: "Please confirm",
    title: "Would you still like to continue?",
    cta: "Yes — submit my info and meeting times",
    ctaSecondary: "No — tell us why in one click",
    lines: (name) => [
      `Hi ${name},`,
      "Thank you for your interest in the deetz Korea dance program.",
      "GRIGO Entertainment has been working in Korea for about seven years across dance management, agency work, choreography production, and event production.",
      "We can see that your application was received, but your online meeting has not been arranged yet.",
      "We would like to confirm whether you are still interested in taking part.",
      "If you would like to continue, please use the first button below to complete your case information and share three times when you can join an online meeting by Zoom or Google Meet.",
      "If you have decided not to proceed for now, the second button takes one minute — just pick the reason that fits. Your answer helps us improve the program, and nothing else is required from you.",
      "deetz project opportunities may be shared with you, but casting, paid work, and visa approval are not guaranteed.",
      "If you have any questions, please reply to this email.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] プログラム参加のご意向を確認させてください",
    eyebrow: "ご確認のお願い",
    title: "現在もご参加を希望されていますか",
    cta: "続けます — 追加情報と候補日時を提出する",
    ctaSecondary: "今回は見送ります — 理由を選ぶ",
    lines: (name) => [
      `${name}様`,
      "deetzの韓国活動プログラムにご関心をお寄せいただきありがとうございます。",
      "GRIGO Entertainmentは、韓国で約7年にわたり、ダンスマネジメント、エージェンシー、振付制作、イベント制作などを行っている会社です。",
      "お申し込みは受け付けておりますが、オンラインミーティングの日程がまだ決まっていない状況です。",
      "現在もプログラムへのご参加を希望されているかを確認させていただきたく、ご連絡いたしました。",
      "引き続きご希望の場合は、下の1つ目のボタンから追加情報と、ZoomまたはGoogle Meetでのオンラインミーティングが可能な日時3つをご提出ください。",
      "今回は見送られる場合は、2つ目のボタンから当てはまる理由を選ぶだけで完了します。いただいたご回答は今後のプログラム改善に活用させていただきます。",
      "deetzの案件をご案内する場合がありますが、キャスティング、有償のお仕事、ビザ発給を保証するものではありません。",
      "ご不明な点がありましたら、このメールにそのままご返信ください。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
  ko: {
    subject: "[deetz] 프로그램 진행 희망 여부 확인",
    eyebrow: "확인 요청",
    title: "지금도 진행을 희망하시나요?",
    cta: "계속 진행합니다 — 추가정보·미팅 일정 제출",
    ctaSecondary: "이번에는 진행하지 않습니다 — 사유 남기기",
    lines: (name) => [
      `안녕하세요, ${name}님.`,
      "deetz 한국 활동 프로그램에 관심을 가지고 신청해 주셔서 감사합니다.",
      "그리고엔터테인먼트는 약 7년 동안 한국에서 댄스 매니지먼트, 에이전시, 안무 제작, 행사 제작 등을 해온 회사입니다.",
      "확인 결과 신청은 접수되었으나, 아직 온라인 미팅 일정이 잡히지 않은 것으로 확인되어 연락드립니다.",
      "혹시 현재도 프로그램 참여를 희망하고 계신지 확인 부탁드립니다.",
      "계속 진행을 희망하신다면 아래 첫 번째 버튼에서 추가 정보와 온라인 미팅 (Zoom 또는 Google Meet) 가능한 일정 3개를 제출해 주세요.",
      "이번에는 진행이 어려우시다면 두 번째 버튼에서 해당하는 사유만 선택해 주시면 됩니다. 남겨주신 답변은 앞으로 프로그램을 개선하는 데 큰 도움이 됩니다.",
      "deetz 프로젝트 기회를 안내할 수 있지만, 캐스팅과 유급 일거리, 비자 발급을 보장하는 것은 아닙니다.",
      "문의사항이 있으시면 이 메일에 바로 답장해 주세요.",
      "감사합니다.",
      "deetz",
    ],
  },
};

const SET_COPY = { confirm: CONFIRM_COPY, reschedule: RESCHEDULE_COPY, revive: REVIVE_COPY };

const TAGLINE = {
  en: "Dancer magazine &amp; casting platform",
  ja: "ダンサーマガジン &amp; キャスティングプラットフォーム",
  ko: "댄서 매거진 &amp; 캐스팅 플랫폼",
};

const COPYRIGHT_NOTE = {
  en: "This email was sent to the address used for your deetz application.",
  ja: "このメールはdeetz申込時の登録アドレスへ送信されました。",
  ko: "이 메일은 deetz 신청 주소로 발송되었습니다.",
};

// ── 렌더링 ─────────────────────────────────────────────────────────────────

function renderMail({ set, lang, name, primaryUrl, secondaryUrl, openPixelUrl, meeting, subjectPrefix }) {
  const c = SET_COPY[set][lang];
  const lines = c.lines(name);
  const subject = `${subjectPrefix ?? ""}${c.subject}`;

  const splitAt = meeting && typeof c.boxAfterLine === "number" ? c.boxAfterLine : lines.length;
  const linesBefore = lines.slice(0, splitAt);
  const linesAfter = lines.slice(splitAt);
  const paragraphs = (values) =>
    values
      .map((line) => `<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0 0 12px;">${escapeHtml(line)}</p>`)
      .join("");
  const bodyHtml = paragraphs(linesBefore);
  const bodyAfterHtml = linesAfter.length
    ? `<tr><td style="padding:20px 32px 0;color:#111111;">${paragraphs(linesAfter)}</td></tr>`
    : "";

  const meetingBoxHtml = meeting
    ? `<tr><td style="padding:6px 32px 0;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:10px;">${escapeHtml(c.boxTitle)}</div>
    <div style="font-size:13px;color:#6b7280;">${escapeHtml(c.boxDateLabel)}</div>
    <div style="font-size:15px;font-weight:700;color:#111111;margin:2px 0 12px;">${escapeHtml(meeting.atLabel)}</div>
    <div style="font-size:13px;color:#6b7280;">${escapeHtml(c.boxLinkLabel)}</div>
    <div style="font-size:13px;line-height:1.6;margin-top:2px;word-break:break-all;"><a href="${escapeHtml(meeting.url)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(meeting.url)}</a></div>
  </div></td></tr>`
    : "";

  const secondaryHtml = secondaryUrl
    ? `<a href="${escapeHtml(secondaryUrl)}" style="display:block;margin-top:10px;background:#ffffff;color:#44474d;border:1px solid #d4d4d8;text-decoration:none;text-align:center;font-size:14px;font-weight:700;padding:14px 0;border-radius:12px;">${escapeHtml(c.ctaSecondary)}</a>`
    : "";

  const textParts = [...linesBefore];
  if (meeting) {
    textParts.push("", `[${c.boxTitle}]`, `${c.boxDateLabel}: ${meeting.atLabel}`, `${c.boxLinkLabel}: ${meeting.url}`, "");
  }
  textParts.push(...linesAfter);
  textParts.push("", `${c.cta}: ${primaryUrl}`);
  if (secondaryUrl) textParts.push(`${c.ctaSecondary}: ${secondaryUrl}`);
  textParts.push("", `deetz · deetz.kr · ${REPLY_TO}`);
  const text = textParts.join("\n");

  const html = `<html lang="${lang}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${TAGLINE[lang]}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${escapeHtml(c.eyebrow)}</span>
  <p style="font-size:20px;font-weight:800;margin:18px 0 14px;line-height:1.45;color:#111;">${escapeHtml(c.title)}</p>
  ${bodyHtml}</td></tr>
${meetingBoxHtml}
${bodyAfterHtml}
<tr><td style="padding:18px 32px 28px;">
  <a href="${escapeHtml(primaryUrl)}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${escapeHtml(c.cta)}</a>
  ${secondaryHtml}</td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${TAGLINE[lang]}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz_magazine/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:${REPLY_TO}" style="color:#44474d;text-decoration:none;">${REPLY_TO}</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${escapeHtml(COPYRIGHT_NOTE[lang])}</div>
  <img src="${escapeHtml(openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;"></td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
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
    "400만원",
    "想定料金",
    "400万",
    "₩4,000,000",
    "4,000,000",
    "estimated fee",
    "fee includes",
    "\uFFFD",
  ];
  const hit = forbidden.find((needle) => combined.includes(needle));
  if (hit) throw new Error(`mail content contains forbidden wording: ${hit}`);
  if (/\?{3,}/.test(combined)) throw new Error("mail content contains suspicious question-mark mojibake");
}

// ── 실행 ───────────────────────────────────────────────────────────────────

loadEnv(".env.local");
loadEnv(FALLBACK_ENV);

const send = process.argv.includes("--send");
const testMode = process.argv.includes("--test");
const force = process.argv.includes("--force");
const confirmSend = argValue("--confirm-send");
const requestedSets = (argValue("--set", "all") ?? "all")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const sets = requestedSets.includes("all") ? ["confirm", "reschedule", "revive"] : requestedSets;
for (const set of sets) {
  if (!SET_COPY[set]) throw new Error(`unknown set: ${set}`);
}

const outputRoot = argValue("--out", DEFAULT_OUTPUT_DIR);
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr").replace(/\/$/, "");
const batch = `${testMode ? "test-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join(outputRoot, batch);
fs.mkdirSync(outputDir, { recursive: true });

if (send && confirmSend !== "VISA_STAGE2") {
  throw new Error("Refusing to send without --confirm-send=VISA_STAGE2");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is missing");
const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

function buildUrls(applicationId, lang) {
  const trackingToken = makeTrackingToken(applicationId);
  const base = `${siteUrl}/api/track/visa-case/click?t=${encodeURIComponent(trackingToken)}&lang=${encodeURIComponent(lang)}`;
  return {
    trackingToken,
    directCaseUrl: `${siteUrl}/visa/case/${makeVisaCaseToken(applicationId)}`,
    continueUrl: `${base}&k=email_cta_continue`,
    rescheduleUrl: `${base}&k=email_cta_reschedule`,
    declineUrl: `${base}&k=email_cta_decline&decline=1`,
    openPixelUrl: `${siteUrl}/api/track/visa-case/open?t=${encodeURIComponent(trackingToken)}&lang=${encodeURIComponent(lang)}`,
  };
}

function buildRow({ set, lang, name, email, applicationId, meetingConfig, subjectPrefix, note }) {
  const urls = buildUrls(applicationId, lang);
  const meeting = meetingConfig
    ? { atLabel: formatMeetingAt(meetingConfig.at, lang), url: meetingConfig.url, at: meetingConfig.at }
    : null;
  const primaryUrl = set === "confirm" ? meeting.url : set === "reschedule" ? urls.rescheduleUrl : urls.continueUrl;
  const secondaryUrl = set === "revive" ? urls.declineUrl : null;
  const mail = renderMail({ set, lang, name, primaryUrl, secondaryUrl, openPixelUrl: urls.openPixelUrl, meeting, subjectPrefix });
  assertMailSafe(mail);

  const base = `${set}-${lang}-${safeFilePart(name)}-${applicationId.slice(0, 8)}`;
  const htmlPath = path.join(outputDir, `${base}.html`);
  const textPath = path.join(outputDir, `${base}.txt`);
  fs.writeFileSync(htmlPath, mail.html, "utf8");
  fs.writeFileSync(textPath, mail.text, "utf8");

  return {
    set,
    lang,
    name,
    email,
    applicationId,
    subject: mail.subject,
    primaryUrl,
    secondaryUrl,
    directCaseUrl: urls.directCaseUrl,
    meetingAt: meeting?.at ?? null,
    meetingUrl: meeting?.url ?? null,
    note: note ?? null,
    htmlPath,
    textPath,
    mail,
  };
}

// 대상자 산출 --------------------------------------------------------------

const { data: appsRaw, error } = await sb
  .from("dancer_visa_applications")
  .select(
    "id, created_at, email, preferred_lang, source, status, case_stage, memo, follow_up_answers, follow_up_submitted_at, declined_at, dancer_id, dancers(stage_name,korean_name)",
  )
  .order("created_at", { ascending: false });
if (error) throw error;
const apps = appsRaw ?? [];

const dancerIds = Array.from(new Set(apps.map((row) => row.dancer_id).filter(Boolean)));
const privateByDancer = new Map();
if (dancerIds.length > 0) {
  const { data: privs, error: privError } = await sb
    .from("dancer_private_info")
    .select("dancer_id, nationality, is_korean_national")
    .in("dancer_id", dancerIds);
  if (privError) throw privError;
  for (const priv of privs ?? []) privateByDancer.set(priv.dancer_id, priv);
}

function privateInfo(row) {
  return row.dancer_id ? privateByDancer.get(row.dancer_id) ?? null : null;
}

function isInternal(email) {
  const lower = String(email ?? "").toLowerCase();
  return INTERNAL_EMAILS.has(lower) || INTERNAL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

function isTestRow(row) {
  return typeof row.memo === "string" && /E2E TEST/i.test(row.memo);
}

function slotList(row) {
  const answers = row.follow_up_answers ?? {};
  const structured = Array.isArray(answers.consultationSlots)
    ? answers.consultationSlots.filter((value) => typeof value === "string")
    : [];
  return structured;
}

// 앞으로 24시간 이내이거나 이미 지난 후보만 있으면 재조율 대상.
const RESCHEDULE_HORIZON_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
function hasUsableSlot(row) {
  return slotList(row).some((slot) => {
    const time = kstLocalToDate(slot).getTime();
    return Number.isFinite(time) && time - now > RESCHEDULE_HORIZON_MS;
  });
}

const emailsWithSubmission = new Set(
  apps.filter((row) => row.follow_up_submitted_at).map((row) => String(row.email).toLowerCase()),
);

// 같은 사람이 여러 번 신청한 경우(예: ANNA는 visa/program 2건) 확정 안내가 두 번 나가지 않도록
// 이메일당 한 건만 고른다. 추가 질문지를 제출한 행을 우선한다.
const confirmRowByEmail = new Map();
for (const row of apps) {
  const email = String(row.email).toLowerCase();
  if (!CONFIRMED_MEETINGS[email]) continue;
  const current = confirmRowByEmail.get(email);
  if (!current) {
    confirmRowByEmail.set(email, row);
    continue;
  }
  const better =
    Boolean(row.follow_up_submitted_at) && !current.follow_up_submitted_at
      ? row
      : current;
  confirmRowByEmail.set(email, better);
}

const excluded = [];
function eligible(row) {
  const priv = privateInfo(row);
  if (priv?.is_korean_national) return "korean_national";
  if (isInternal(row.email)) return "internal_or_test_address";
  if (isTestRow(row)) return "e2e_test_row";
  if (row.declined_at) return "already_declined";
  if (row.status === "rejected") return "rejected";
  return null;
}

const rows = [];

if (testMode) {
  for (const recipient of TEST_RECIPIENTS) {
    for (const set of sets) {
      for (const lang of ["ko", "en", "ja"]) {
        rows.push(
          buildRow({
            set,
            lang,
            name: recipient.name,
            email: recipient.email,
            applicationId: recipient.applicationId,
            meetingConfig: set === "confirm" ? TEST_MEETING : null,
            subjectPrefix: "[TEST] ",
            note: "internal test send",
          }),
        );
      }
    }
  }
} else {
  for (const row of apps) {
    const reason = eligible(row);
    const name = displayName(row.dancers?.stage_name || row.dancers?.korean_name);
    const lang = normalizeLang(row.preferred_lang);
    const email = String(row.email).toLowerCase();
    if (reason) {
      excluded.push({ applicationId: row.id, email: row.email, name, reason });
      continue;
    }

    const meetingConfig = CONFIRMED_MEETINGS[email] ?? null;
    let set = null;
    let note = null;
    if (meetingConfig) {
      if (confirmRowByEmail.get(email)?.id !== row.id) {
        excluded.push({ applicationId: row.id, email: row.email, name, reason: "duplicate_application_confirm_dedup" });
        continue;
      }
      set = "confirm";
    } else if (row.follow_up_submitted_at) {
      if (hasUsableSlot(row)) {
        excluded.push({ applicationId: row.id, email: row.email, name, reason: "slot_still_usable_awaiting_confirmation" });
        continue;
      }
      set = "reschedule";
      note = `submitted slots all past: ${slotList(row).join(" / ") || "(none)"}`;
    } else {
      if (emailsWithSubmission.has(email)) {
        excluded.push({ applicationId: row.id, email: row.email, name, reason: "duplicate_application_other_row_submitted" });
        continue;
      }
      set = "revive";
      note = row.source === "visa" ? "visa funnel, never received case link mail" : "program funnel, case link mail sent 2026-07-23";
    }

    if (!sets.includes(set)) {
      excluded.push({ applicationId: row.id, email: row.email, name, reason: `set_not_selected:${set}` });
      continue;
    }
    rows.push(buildRow({ set, lang, name, email: row.email, applicationId: row.id, meetingConfig, note }));
  }
}

// 중복 발송 방지 로그 --------------------------------------------------------

const sentLogPath = path.join(outputRoot, "sent-log.jsonl");
const sentKeys = new Set();
if (fs.existsSync(sentLogPath) && !force) {
  for (const line of fs.readFileSync(sentLogPath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.applicationId && parsed.set) sentKeys.add(`${parsed.set}:${parsed.applicationId}:${parsed.lang}`);
    } catch {
      // 과거 로그 형식은 무시한다.
    }
  }
}
// --only=a@b.com,c@d.com 로 수신자를 명시 지정한다.
// 신규 지원자가 계속 유입되므로 세트 선택만으로는 의도치 않은 대상까지 잡힌다. 특정 인원만 보낼 때는 항상 이 필터를 쓴다.
const onlyRaw = argValue("--only");
const onlyKeys = onlyRaw
  ? new Set(onlyRaw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean))
  : null;
if (onlyKeys) {
  const missing = [...onlyKeys].filter(
    (key) => !rows.some((row) => String(row.email).toLowerCase() === key || row.applicationId === key),
  );
  if (missing.length) {
    throw new Error(`--only 대상이 후보에 없습니다: ${missing.join(", ")}`);
  }
}

const finalRows = rows
  .filter((row) => (onlyKeys ? onlyKeys.has(String(row.email).toLowerCase()) || onlyKeys.has(row.applicationId) : true))
  .filter((row) => force || !sentKeys.has(`${row.set}:${row.applicationId}:${row.lang}`));

const summary = finalRows.reduce((acc, row) => {
  acc[row.set] = acc[row.set] ?? {};
  acc[row.set][row.lang] = (acc[row.set][row.lang] ?? 0) + 1;
  return acc;
}, {});

const csv = [
  ["set", "lang", "name", "email", "application_id", "subject", "meeting_at_kst", "primary_url", "secondary_url", "direct_case_url", "note"].join(","),
  ...finalRows.map((row) =>
    [
      row.set,
      row.lang,
      row.name,
      row.email,
      row.applicationId,
      row.subject,
      row.meetingAt ?? "",
      row.primaryUrl,
      row.secondaryUrl ?? "",
      row.directCaseUrl,
      row.note ?? "",
    ]
      .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
      .join(","),
  ),
].join("\n");

const csvPath = path.join(outputDir, "recipients.csv");
const manifestPath = path.join(outputDir, "manifest.json");
fs.writeFileSync(csvPath, csv, "utf8");
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      generatedAtKst: formatKst(new Date()),
      mode: testMode ? "test" : send ? "send" : "dry-run",
      campaign: TRACKING_CAMPAIGN,
      sets,
      summary,
      preparedCount: finalRows.length,
      skippedAlreadySent: rows.length - finalRows.length,
      excluded,
      outputDir,
      csvPath,
      recipients: finalRows.map(({ mail: _mail, ...rest }) => rest),
    },
    null,
    2,
  ),
  "utf8",
);

let sendResults = [];
if (send) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: requiredEnv("GMAIL_USER"), pass: requiredEnv("GMAIL_APP_PASSWORD") },
  });
  for (const row of finalRows) {
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
        set: row.set,
        lang: row.lang,
        applicationId: row.applicationId,
        email: row.email,
        messageId: result.messageId ?? null,
        testMode,
      };
      if (!testMode) {
        await sb.from("visa_case_tracking_events").insert({
          application_id: row.applicationId,
          campaign: TRACKING_CAMPAIGN,
          event_type: "email_sent",
          event_key: `gmail_smtp:${row.set}`,
          lang: row.lang,
          metadata: { messageId: result.messageId ?? null, set: row.set },
        });
        fs.appendFileSync(sentLogPath, `${JSON.stringify(log)}\n`, "utf8");
      }
      sendResults.push({ ...log, ok: true });
    } catch (sendError) {
      sendResults.push({
        set: row.set,
        lang: row.lang,
        applicationId: row.applicationId,
        email: row.email,
        ok: false,
        error: sendError.message,
      });
    }
  }
  fs.writeFileSync(path.join(outputDir, "send-results.json"), JSON.stringify(sendResults, null, 2), "utf8");
}

console.log(
  JSON.stringify(
    {
      mode: testMode ? "test" : send ? "send" : "dry-run",
      sets,
      preparedCount: finalRows.length,
      summary,
      excludedCount: excluded.length,
      outputDir,
      manifestPath,
      csvPath,
      sent: sendResults.filter((row) => row.ok).length,
      failed: sendResults.filter((row) => !row.ok).length,
    },
    null,
    2,
  ),
);
