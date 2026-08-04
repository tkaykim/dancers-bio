import "server-only";

// 온라인 미팅 확정 안내 메일.
// 양식은 deetz 공식 메일 정본(560px 카드 + SNS 푸터)을 그대로 따르고,
// 열람 픽셀과 미팅 링크 클릭 추적을 함께 넣는다.

export type MeetingInviteLang = "ko" | "en" | "ja";

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const COPY: Record<MeetingInviteLang, {
  subject: string;
  tagline: string;
  eyebrow: string;
  title: string;
  boxTitle: string;
  dateLabel: string;
  linkLabel: string;
  cta: string;
  copyright: string;
  intro: (name: string) => string[];
  outro: string[];
}> = {
  ko: {
    subject: "[deetz] 온라인 미팅 일정 확정 안내",
    tagline: "댄서 매거진 &amp; 캐스팅 플랫폼",
    eyebrow: "일정 확정",
    title: "온라인 미팅 일정이 확정되었습니다",
    boxTitle: "온라인 미팅",
    dateLabel: "일시",
    linkLabel: "미팅 링크",
    cta: "미팅 링크 열기",
    copyright: "이 메일은 deetz 신청 주소로 발송되었습니다.",
    intro: (name) => [
      `안녕하세요, ${name}님.`,
      "deetz 한국 활동 프로그램에 지원해 주셔서 감사합니다.",
      "온라인 미팅 일정이 아래와 같이 확정되어 안내드립니다.",
    ],
    outro: [
      "당일에는 원활한 진행을 위해 예정된 시간보다 5분 정도 먼저 접속해 주시면 감사하겠습니다.",
      "일정이 어려워지신 경우에는 이 메일에 바로 답장해 주시면 다른 일정으로 다시 조율해 드리겠습니다.",
      "미팅에서 뵙기를 기대하겠습니다.",
      "감사합니다.",
      "deetz",
    ],
  },
  en: {
    subject: "[deetz] Your online meeting is confirmed",
    tagline: "Dancer magazine &amp; casting platform",
    eyebrow: "Meeting confirmed",
    title: "Your online meeting schedule",
    boxTitle: "Online meeting",
    dateLabel: "Date and time",
    linkLabel: "Meeting link",
    cta: "Open the meeting link",
    copyright: "This email was sent to the address used for your deetz application.",
    intro: (name) => [
      `Hi ${name},`,
      "Thank you for applying to the deetz Korea dance program.",
      "Your online meeting has been confirmed as below.",
    ],
    outro: [
      "Please join about five minutes before the scheduled time so we can start smoothly.",
      "If this time no longer works for you, simply reply to this email and we will arrange another time.",
      "We look forward to meeting you.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] オンラインミーティング日程確定のご案内",
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    eyebrow: "日程確定",
    title: "オンラインミーティングの日程が確定しました",
    boxTitle: "オンラインミーティング",
    dateLabel: "日時",
    linkLabel: "ミーティングリンク",
    cta: "ミーティングリンクを開く",
    copyright: "このメールはdeetz申込時の登録アドレスへ送信されました。",
    intro: (name) => [
      `${name}様`,
      "deetzの韓国活動プログラムにお申し込みいただきありがとうございます。",
      "オンラインミーティングの日程が下記のとおり確定しましたのでご案内いたします。",
    ],
    outro: [
      "当日は円滑に進行できるよう、予定時刻の5分ほど前にご参加いただけますと幸いです。",
      "ご都合が合わなくなった場合は、このメールにそのままご返信ください。別の日程を調整いたします。",
      "ミーティングでお会いできることを楽しみにしております。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
};

export function formatMeetingAt(iso: string, lang: MeetingInviteLang): string {
  const date = new Date(iso);
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

export function renderVisaMeetingInviteMail(params: {
  name: string;
  lang: MeetingInviteLang;
  meetingAtIso: string;
  meetingUrl: string;
  /** 클릭 추적을 거치는 링크. 없으면 미팅 링크를 그대로 쓴다. */
  trackedUrl?: string | null;
  openPixelUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const c = COPY[params.lang];
  const name = params.name?.trim() || "dancer";
  const atLabel = formatMeetingAt(params.meetingAtIso, params.lang);
  const linkForButton = params.trackedUrl || params.meetingUrl;
  const intro = c.intro(name);

  const text = [
    ...intro,
    "",
    `[${c.boxTitle}]`,
    `${c.dateLabel}: ${atLabel}`,
    `${c.linkLabel}: ${params.meetingUrl}`,
    "",
    ...c.outro,
    "",
    `${c.cta}: ${linkForButton}`,
    "",
    "deetz · deetz.kr · dancers.bio.kr@gmail.com",
  ].join("\n");

  const paragraphs = (lines: string[]) =>
    lines
      .map(
        (line) =>
          `<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0 0 12px;">${esc(line)}</p>`,
      )
      .join("");

  const pixel = params.openPixelUrl
    ? `<img src="${esc(params.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">`
    : "";

  const html = `<html lang="${params.lang}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${c.tagline}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c.eyebrow)}</span>
  <p style="font-size:20px;font-weight:800;margin:18px 0 14px;line-height:1.45;color:#111;">${esc(c.title)}</p>
  ${paragraphs(intro)}</td></tr>
<tr><td style="padding:6px 32px 0;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:10px;">${esc(c.boxTitle)}</div>
    <div style="font-size:13px;color:#6b7280;">${esc(c.dateLabel)}</div>
    <div style="font-size:15px;font-weight:700;color:#111111;margin:2px 0 12px;">${esc(atLabel)}</div>
    <div style="font-size:13px;color:#6b7280;">${esc(c.linkLabel)}</div>
    <div style="font-size:13px;line-height:1.6;margin-top:2px;word-break:break-all;"><a href="${esc(linkForButton)}" style="color:#4f46e5;text-decoration:none;">${esc(params.meetingUrl)}</a></div>
  </div></td></tr>
<tr><td style="padding:20px 32px 0;color:#111111;">${paragraphs(c.outro)}</td></tr>
<tr><td style="padding:6px 32px 28px;">
  <a href="${esc(linkForButton)}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${esc(c.cta)}</a></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${c.tagline}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz_magazine/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:dancers.bio.kr@gmail.com" style="color:#44474d;text-decoration:none;">dancers.bio.kr@gmail.com</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${esc(c.copyright)}</div>
  ${pixel}</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: c.subject, text, html };
}
