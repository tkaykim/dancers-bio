import "server-only";

// 비자 프로그램 단계별 안내 메일 2종.
//  ① meeting_reminder    — 확정된 온라인 미팅 하루 전 자동 리마인드 (크론)
//  ② audition_confirmed  — 오디션(레벨테스트) 일정·장소 확정 안내 (어드민이 확인 후 발송)
//
// 양식은 visa-meeting-invite-mail.ts 와 같은 deetz 정본 카드(560px + SNS 푸터)를 쓴다.
// 카드 마크업이 세 곳에 흩어지지 않게 여기서 공용 렌더러로 한 번만 정의한다.

import { formatMeetingAt, type MeetingInviteLang } from "./visa-meeting-invite-mail";

export type StageMailLang = MeetingInviteLang;

function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TAGLINE: Record<StageMailLang, string> = {
  ko: "댄서 매거진 &amp; 캐스팅 플랫폼",
  en: "Dancer magazine &amp; casting platform",
  ja: "ダンサーマガジン &amp; キャスティングプラットフォーム",
};

const FOOTER_NOTE: Record<StageMailLang, string> = {
  ko: "이 메일은 deetz 신청 주소로 발송되었습니다.",
  en: "This email was sent to the address used for your deetz application.",
  ja: "このメールはdeetzのお申し込み時のアドレスにお送りしています。",
};

/** deetz 정본 카드 렌더러. 정보 박스는 라벨·값 쌍의 목록으로 받는다. */
function renderCard(params: {
  lang: StageMailLang;
  eyebrow: string;
  title: string;
  intro: string[];
  boxTitle: string;
  rows: { label: string; value: string; href?: string | null }[];
  outro: string[];
  cta?: { label: string; href: string } | null;
  openPixelUrl?: string | null;
}): string {
  const { lang } = params;
  const paragraphs = (lines: string[]) =>
    lines
      .map(
        (line) =>
          `<p style="font-size:15px;line-height:1.75;color:#33363b;margin:0 0 12px;">${esc(line)}</p>`,
      )
      .join("");

  const rowsHtml = params.rows
    .map((r) => {
      const value = r.href
        ? `<div style="font-size:13px;line-height:1.6;margin:2px 0 12px;word-break:break-all;"><a href="${esc(r.href)}" style="color:#4f46e5;text-decoration:none;">${esc(r.value)}</a></div>`
        : `<div style="font-size:15px;font-weight:700;color:#111111;margin:2px 0 12px;">${esc(r.value)}</div>`;
      return `<div style="font-size:13px;color:#6b7280;">${esc(r.label)}</div>${value}`;
    })
    .join("");

  const ctaHtml = params.cta
    ? `<tr><td style="padding:6px 32px 28px;"><a href="${esc(params.cta.href)}" style="display:block;background:#111111;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:700;padding:15px 0;border-radius:12px;">${esc(params.cta.label)}</a></td></tr>`
    : "";

  const pixel = params.openPixelUrl
    ? `<img src="${esc(params.openPixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;">`
    : "";

  return `<html lang="${lang}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${TAGLINE[lang]}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(params.eyebrow)}</span>
  <p style="font-size:20px;font-weight:800;margin:18px 0 14px;line-height:1.45;color:#111;">${esc(params.title)}</p>
  ${paragraphs(params.intro)}</td></tr>
<tr><td style="padding:6px 32px 0;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:10px;">${esc(params.boxTitle)}</div>
    ${rowsHtml}
  </div></td></tr>
<tr><td style="padding:20px 32px 0;color:#111111;">${paragraphs(params.outro)}</td></tr>
${ctaHtml}
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${TAGLINE[lang]}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${esc(FOOTER_NOTE[lang])}</div>
  ${pixel}</td></tr>
</table></td></tr></table></body></html>`;
}

// ── ① 미팅 하루 전 리마인드 ────────────────────────────────────────────────

const REMINDER: Record<StageMailLang, {
  subject: string;
  eyebrow: string;
  title: string;
  boxTitle: string;
  dateLabel: string;
  linkLabel: string;
  cta: string;
  noLink: string;
  intro: (name: string) => string[];
  outro: string[];
}> = {
  ko: {
    subject: "[deetz] 내일 온라인 미팅이 예정되어 있습니다",
    eyebrow: "미팅 하루 전",
    title: "내일 뵙겠습니다",
    boxTitle: "온라인 미팅",
    dateLabel: "일시",
    linkLabel: "미팅 링크",
    cta: "미팅 링크 열기",
    noLink: "미팅 링크는 확정 안내 메일에서 확인하실 수 있습니다.",
    intro: (name) => [
      `안녕하세요, ${name}님.`,
      "내일 예정된 온라인 미팅을 미리 안내드립니다.",
    ],
    outro: [
      "조용한 곳에서 카메라와 마이크를 켜고 참여해 주시면 더 정확하게 안내드릴 수 있습니다.",
      "현재 비자 상태와 한국에서 하고 싶은 활동을 미리 정리해 오시면 좋습니다.",
      "일정이 어려워지셨다면 이 메일에 답장해 주세요. 다른 시간으로 다시 잡아드리겠습니다.",
      "감사합니다.",
      "deetz",
    ],
  },
  en: {
    subject: "[deetz] Your online meeting is tomorrow",
    eyebrow: "Meeting tomorrow",
    title: "See you tomorrow",
    boxTitle: "Online meeting",
    dateLabel: "Date and time",
    linkLabel: "Meeting link",
    cta: "Open the meeting link",
    noLink: "You can find the meeting link in the confirmation email.",
    intro: (name) => [
      `Hi ${name},`,
      "This is a reminder about your online meeting tomorrow.",
    ],
    outro: [
      "Please join from a quiet place with your camera and microphone on so we can advise you properly.",
      "It helps if you have your current visa status and what you want to do in Korea ready to talk about.",
      "If this time no longer works, just reply to this email and we will find another one.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] 明日オンラインミーティングを予定しています",
    eyebrow: "ミーティング前日",
    title: "明日お会いしましょう",
    boxTitle: "オンラインミーティング",
    dateLabel: "日時",
    linkLabel: "ミーティングリンク",
    cta: "ミーティングリンクを開く",
    noLink: "ミーティングリンクは確定のご案内メールでご確認いただけます。",
    intro: (name) => [
      `こんにちは、${name}様。`,
      "明日予定されているオンラインミーティングについて、事前にご案内します。",
    ],
    outro: [
      "静かな場所からカメラとマイクをオンにしてご参加いただけると、より正確にご案内できます。",
      "現在のビザの状況と、韓国でやりたい活動を整理しておいていただけると助かります。",
      "ご都合が難しくなった場合は、このメールにご返信ください。別の日程で再調整いたします。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
};

export function renderVisaMeetingReminderMail(params: {
  name: string;
  lang: StageMailLang;
  meetingAtIso: string;
  meetingUrl: string | null;
  trackedUrl?: string | null;
  openPixelUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const c = REMINDER[params.lang];
  const name = params.name?.trim() || "dancer";
  const atLabel = formatMeetingAt(params.meetingAtIso, params.lang);
  const link = params.trackedUrl || params.meetingUrl;
  const intro = c.intro(name);

  const text = [
    ...intro,
    "",
    `[${c.boxTitle}]`,
    `${c.dateLabel}: ${atLabel}`,
    `${c.linkLabel}: ${params.meetingUrl || c.noLink}`,
    "",
    ...c.outro,
    "",
    "deetz · deetz.kr · contact@deetz.kr",
  ].join("\n");

  const html = renderCard({
    lang: params.lang,
    eyebrow: c.eyebrow,
    title: c.title,
    intro,
    boxTitle: c.boxTitle,
    rows: [
      { label: c.dateLabel, value: atLabel },
      params.meetingUrl
        ? { label: c.linkLabel, value: params.meetingUrl, href: link }
        : { label: c.linkLabel, value: c.noLink },
    ],
    outro: c.outro,
    cta: link ? { label: c.cta, href: link } : null,
    openPixelUrl: params.openPixelUrl,
  });

  return { subject: c.subject, text, html };
}

// ── ② 오디션(레벨테스트) 확정 안내 ─────────────────────────────────────────

const AUDITION: Record<StageMailLang, {
  subject: string;
  eyebrow: string;
  title: string;
  boxTitle: string;
  dateLabel: string;
  placeLabel: string;
  onlineLabel: string;
  tbdDate: string;
  cta: string;
  intro: (name: string) => string[];
  outro: string[];
}> = {
  ko: {
    subject: "[deetz] 오디션(레벨테스트) 일정 확정 안내",
    eyebrow: "오디션 확정",
    title: "오디션 일정이 확정되었습니다",
    boxTitle: "오디션 · 레벨테스트",
    dateLabel: "일시",
    placeLabel: "장소",
    onlineLabel: "참여 방식",
    tbdDate: "일시는 별도로 안내드립니다",
    cta: "내 진행 상황 보기",
    intro: (name) => [
      `안녕하세요, ${name}님.`,
      "온라인 미팅에서 말씀드린 오디션(레벨테스트) 일정이 확정되어 안내드립니다.",
    ],
    outro: [
      "편하게 움직일 수 있는 복장과 신발로 오시고, 준비하신 안무가 있다면 함께 보여주셔도 좋습니다.",
      "참석이 어려우시면 미리 알려주세요. 가능한 범위에서 다시 조율해 드리겠습니다.",
      "아래 버튼을 누르시면 지금까지의 진행 상황과 다음 단계를 한 화면에서 보실 수 있습니다.",
      "감사합니다.",
      "deetz",
    ],
  },
  en: {
    subject: "[deetz] Your audition (level test) is confirmed",
    eyebrow: "Audition confirmed",
    title: "Your audition is scheduled",
    boxTitle: "Audition · level test",
    dateLabel: "Date and time",
    placeLabel: "Venue",
    onlineLabel: "How to join",
    tbdDate: "We will share the exact time separately",
    cta: "See my progress",
    intro: (name) => [
      `Hi ${name},`,
      "The audition (level test) we discussed in your online meeting is now scheduled.",
    ],
    outro: [
      "Please come in clothes and shoes you can move in, and feel free to show a piece you have prepared.",
      "If you cannot attend, let us know in advance and we will try to arrange another slot.",
      "The button below opens your case page, where you can see your progress and what comes next.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] オーディション（レベルテスト）日程確定のご案内",
    eyebrow: "オーディション確定",
    title: "オーディションの日程が確定しました",
    boxTitle: "オーディション・レベルテスト",
    dateLabel: "日時",
    placeLabel: "会場",
    onlineLabel: "参加方法",
    tbdDate: "日時は別途ご案内します",
    cta: "進行状況を見る",
    intro: (name) => [
      `こんにちは、${name}様。`,
      "オンラインミーティングでお伝えしたオーディション（レベルテスト）の日程が確定しましたのでご案内します。",
    ],
    outro: [
      "動きやすい服装と靴でお越しください。準備された振付があれば見せていただいても構いません。",
      "ご参加が難しい場合は事前にお知らせください。可能な範囲で再調整いたします。",
      "下のボタンから、これまでの進行状況と次のステップを一つの画面でご確認いただけます。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
};

export function renderVisaAuditionConfirmedMail(params: {
  name: string;
  lang: StageMailLang;
  /** 일시 미정이면 null — 장소만 안내한다. */
  auditionAtIso: string | null;
  /** 관리자가 입력한 장소 문자열. 지원자 언어로 그대로 노출된다. */
  location: string | null;
  caseUrl: string;
  trackedUrl?: string | null;
  openPixelUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const c = AUDITION[params.lang];
  const name = params.name?.trim() || "dancer";
  const atLabel = params.auditionAtIso ? formatMeetingAt(params.auditionAtIso, params.lang) : c.tbdDate;
  const link = params.trackedUrl || params.caseUrl;
  const intro = c.intro(name);

  const rows: { label: string; value: string }[] = [{ label: c.dateLabel, value: atLabel }];
  if (params.location?.trim()) {
    // 화상 참여 안내인지 현장 장소인지 관리자가 적은 문구로 구분한다.
    const isOnline = /온라인|화상|video|online|オンライン|ビデオ/i.test(params.location);
    rows.push({ label: isOnline ? c.onlineLabel : c.placeLabel, value: params.location.trim() });
  }

  const text = [
    ...intro,
    "",
    `[${c.boxTitle}]`,
    ...rows.map((r) => `${r.label}: ${r.value}`),
    "",
    ...c.outro,
    "",
    `${c.cta}: ${link}`,
    "",
    "deetz · deetz.kr · contact@deetz.kr",
  ].join("\n");

  const html = renderCard({
    lang: params.lang,
    eyebrow: c.eyebrow,
    title: c.title,
    intro,
    boxTitle: c.boxTitle,
    rows,
    outro: c.outro,
    cta: { label: c.cta, href: link },
    openPixelUrl: params.openPixelUrl,
  });

  return { subject: c.subject, text, html };
}


// ── ③ 오디션 초대 (참석 여부 회신 + 참가비 결제) ───────────────────────────
//
// 현장 참가가 원칙이다. 다만 지원자 절반 가까이가 해외 거주라,
// 한국에 없거나 입국이 어려운 경우에만 온라인 참여가 가능하다고 함께 알린다.
// "온라인도 됩니다"를 앞세우면 전원이 온라인을 고르므로 순서와 표현에 주의한다.

const INVITE: Record<StageMailLang, {
  subject: string;
  eyebrow: string;
  title: string;
  boxTitle: string;
  dateLabel: string;
  placeLabel: string;
  addressLabel: string;
  transitLabel: string;
  mapLabel: string;
  feeLabel: string;
  cta: string;
  intro: (name: string) => string[];
  onsite: string[];
  online: string[];
  fee: string[];
  outro: string[];
}> = {
  ko: {
    subject: "[deetz] 9월 16일 오디션 안내 — 참석 여부를 알려주세요",
    eyebrow: "오디션 초대",
    title: "다음 오디션 일정이 확정되었습니다",
    boxTitle: "오디션 · 레벨테스트",
    dateLabel: "일시",
    placeLabel: "장소",
    addressLabel: "주소",
    transitLabel: "오시는 길",
    mapLabel: "지도",
    feeLabel: "참가 확정비",
    cta: "참석 여부 응답하기",
    intro: (name) => [
      `안녕하세요, ${name}님.`,
      "다음 오디션(레벨테스트) 일정이 아래와 같이 확정되어 안내드립니다.",
    ],
    onsite: [
      "오디션은 현장 참가를 원칙으로 합니다.",
      "실제로 함께 움직여 봐야 정확한 판단이 가능하고, 현장에서 바로 피드백을 드릴 수 있기 때문입니다.",
    ],
    online: [
      "다만 지금 한국에 계시지 않거나 입국이 어려운 경우에는 온라인 참여도 가능합니다.",
      "아래 버튼에서 온라인 참여를 선택해 주시면 화상 링크를 따로 안내드리겠습니다.",
    ],
    fee: [
      "참석이 확정되면 참가 확정비 100,000원을 결제해 주셔야 자리가 확보됩니다.",
      "이 참가비는 프로그램 비용에 이미 포함되어 있습니다.",
      "그래서 나중에 프로그램을 진행하실 때 100,000원이 할인된 금액으로 결제하시게 됩니다.",
      "따로 더 내시는 돈이 아닙니다.",
    ],
    outro: [
      "아래 버튼을 누르시면 참석 여부를 고르고 결제까지 한 번에 진행하실 수 있습니다.",
      "일정이 어려우신 경우에도 알려주시면 다음 회차를 안내드리겠습니다.",
      "궁금한 점은 인스타그램 @deetz.kr 로 DM 주시면 가장 빠르게 답변드립니다.",
      "감사합니다.",
      "deetz",
    ],
  },
  en: {
    subject: "[deetz] Audition on September 16 — please confirm your attendance",
    eyebrow: "Audition invitation",
    title: "The next audition is scheduled",
    boxTitle: "Audition · level test",
    dateLabel: "Date and time",
    placeLabel: "Venue",
    addressLabel: "Address",
    transitLabel: "Getting there",
    mapLabel: "Map",
    feeLabel: "Attendance fee",
    cta: "Confirm my attendance",
    intro: (name) => [
      `Hi ${name},`,
      "The next audition (level test) has been scheduled as below.",
    ],
    onsite: [
      "We ask everyone to attend in person.",
      "We can only judge properly by moving together in the same room, and it lets us give you feedback on the spot.",
    ],
    online: [
      "If you are not in Korea right now, or entering Korea is difficult for you, you can join online instead.",
      "Choose the online option below and we will send you a video link separately.",
    ],
    fee: [
      "Once you confirm, a 100,000 KRW attendance fee secures your place.",
      "This fee is already part of the program cost.",
      "So when you join the program later, you pay 100,000 KRW less.",
      "It is not an extra charge on top.",
    ],
    outro: [
      "The button below lets you choose how you will attend and complete the payment in one place.",
      "If this date does not work for you, tell us there and we will let you know about the next round.",
      "Any questions? Send us a DM on Instagram @deetz.kr — that is the fastest way to reach us.",
      "Thank you.",
      "deetz",
    ],
  },
  ja: {
    subject: "[deetz] 9月16日オーディションのご案内 — 参加可否をお知らせください",
    eyebrow: "オーディションのご招待",
    title: "次回オーディションの日程が確定しました",
    boxTitle: "オーディション・レベルテスト",
    dateLabel: "日時",
    placeLabel: "会場",
    addressLabel: "住所",
    transitLabel: "アクセス",
    mapLabel: "地図",
    feeLabel: "参加確定費",
    cta: "参加可否を回答する",
    intro: (name) => [
      `こんにちは、${name}様。`,
      "次回のオーディション（レベルテスト）の日程が下記のとおり確定しましたのでご案内します。",
    ],
    onsite: [
      "オーディションは対面参加を原則としています。",
      "同じ空間で実際に動いていただくことで正確に判断でき、その場でフィードバックをお伝えできるためです。",
    ],
    online: [
      "ただし現在韓国にいらっしゃらない場合や、入国が難しい場合はオンライン参加も可能です。",
      "下のボタンからオンライン参加を選択いただければ、ビデオ通話のリンクを別途ご案内します。",
    ],
    fee: [
      "参加が確定しましたら、参加確定費100,000ウォンのお支払いで枠が確保されます。",
      "この参加費はプログラム費用にすでに含まれています。",
      "そのため、後日プログラムに進まれる際は100,000ウォン割引された金額のお支払いとなります。",
      "追加でお支払いいただく費用ではありません。",
    ],
    outro: [
      "下のボタンから、参加方法の選択とお支払いをまとめて進めていただけます。",
      "日程が難しい場合もお知らせいただければ、次回の回をご案内します。",
      "ご不明な点はInstagram @deetz.kr へDMをお送りください。最も早くご返信できます。",
      "よろしくお願いいたします。",
      "deetz",
    ],
  },
};

/** 오디션 시간대 표기. 시작·종료가 같은 날이면 "9월 16일 (수) 16:00–18:00" 형태로 합친다. */
export function formatAuditionWindow(
  startIso: string,
  endIso: string | null,
  lang: StageMailLang,
): string {
  const start = formatMeetingAt(startIso, lang);
  if (!endIso) return start;
  const end = new Date(endIso);
  const endTime = end.toLocaleTimeString(lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : "en-US", {
    timeZone: "Asia/Seoul",
    hour: lang === "ja" ? "2-digit" : "numeric",
    minute: "2-digit",
  });
  // 시작 표기 끝의 "(KST…)" 앞에 종료 시각을 끼워 넣는다.
  const idx = start.lastIndexOf(" (");
  if (idx < 0) return `${start} – ${endTime}`;
  return `${start.slice(0, idx)} – ${endTime}${start.slice(idx)}`;
}

export function renderVisaAuditionInviteMail(params: {
  name: string;
  lang: StageMailLang;
  auditionAtIso: string;
  auditionEndsAtIso: string | null;
  /** 장소 이름 (예: 엠아이디(MID) 댄스학원) */
  location: string;
  /** 도로명 주소. 비어 있으면 행을 생략한다. */
  address?: string | null;
  /** 지하철 안내. 비어 있으면 생략. */
  transit?: string | null;
  /** 지도 링크. 비어 있으면 생략. */
  mapUrl?: string | null;
  feeKrw: number;
  caseUrl: string;
  trackedUrl?: string | null;
  openPixelUrl?: string | null;
}): { subject: string; text: string; html: string } {
  const c = INVITE[params.lang];
  const name = params.name?.trim() || "dancer";
  const when = formatAuditionWindow(params.auditionAtIso, params.auditionEndsAtIso, params.lang);
  const fee =
    params.lang === "en"
      ? `${params.feeKrw.toLocaleString("en-US")} KRW`
      : `${(params.feeKrw / 10000).toLocaleString("en-US")}${params.lang === "ja" ? "万ウォン" : "만원"}`;
  const link = params.trackedUrl || params.caseUrl;
  const intro = c.intro(name);
  const body = [...c.onsite, ...c.online, ...c.fee];

  // 주소·교통·지도는 값이 있을 때만 넣는다(온라인 회차엔 주소가 없다).
  const venueRows: { label: string; value: string; href?: string | null }[] = [
    { label: c.placeLabel, value: params.location },
  ];
  if (params.address?.trim()) venueRows.push({ label: c.addressLabel, value: params.address.trim() });
  if (params.transit?.trim()) venueRows.push({ label: c.transitLabel, value: params.transit.trim() });
  if (params.mapUrl?.trim())
    venueRows.push({ label: c.mapLabel, value: params.mapUrl.trim(), href: params.mapUrl.trim() });

  const text = [
    ...intro,
    "",
    `[${c.boxTitle}]`,
    `${c.dateLabel}: ${when}`,
    ...venueRows.map((r) => `${r.label}: ${r.value}`),
    `${c.feeLabel}: ${fee}`,
    "",
    ...body,
    "",
    ...c.outro,
    "",
    `${c.cta}: ${link}`,
    "",
    "deetz · deetz.kr · contact@deetz.kr",
  ].join("\n");

  const html = renderCard({
    lang: params.lang,
    eyebrow: c.eyebrow,
    title: c.title,
    intro: [...intro, ...body],
    boxTitle: c.boxTitle,
    rows: [{ label: c.dateLabel, value: when }, ...venueRows, { label: c.feeLabel, value: fee }],
    outro: c.outro,
    cta: { label: c.cta, href: link },
    openPixelUrl: params.openPixelUrl,
  });

  return { subject: c.subject, text, html };
}
