import "server-only";
import { sendGmailEmail } from "@/lib/gmail";

type Lang = "en" | "ja" | "ko";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 제출 언어별 카피. 양식(560px 카드 + SNS 푸터)은 deetz 공식 메일 정본 그대로(schedule-mail/rejection-mail 동일).
const COPY: Record<Lang, {
  subject: string;
  tagline: string;
  badge: string;
  greeting: (name: string) => string;
  bodyHtml: string;
  bodyText: string[];
  nextTitle: string;
  nextHtml: string;
  copyrightNote: string;
}> = {
  en: {
    subject: "[deetz] Your application has been received",
    tagline: "Dancer magazine &amp; casting platform",
    badge: "Application received",
    greeting: (name) => `Hi ${esc(name)},`,
    bodyHtml:
      "Thank you for applying to dance in Korea with deetz.<br>Your application has been received.",
    bodyText: [
      "Thank you for applying to dance in Korea with deetz.",
      "Your application has been received.",
    ],
    nextTitle: "What happens next",
    nextHtml:
      "We will review your information and prepare the program plan.<br>Our team will contact you individually by email once the plan is ready.<br>No action is needed from you for now.",
    copyrightNote: "This email was sent to the address used for your deetz application.",
  },
  ja: {
    subject: "[deetz] お申し込みを受け付けました",
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    badge: "受付完了",
    greeting: (name) => `${esc(name)}様`,
    bodyHtml:
      "deetzを通じて韓国での活動にご応募いただきありがとうございます。<br>お申し込みを受け付けました。",
    bodyText: [
      "deetzを通じて韓国での活動にご応募いただきありがとうございます。",
      "お申し込みを受け付けました。",
    ],
    nextTitle: "次のご案内",
    nextHtml:
      "ご入力内容を確認し、プログラム構成を準備いたします。<br>構成が整い次第、担当者よりご記入のメールへ個別にご連絡いたします。<br>今、特にお手続きは必要ありません。",
    copyrightNote: "このメールはdeetz申込時の登録アドレスへ送信されました。",
  },
  ko: {
    subject: "[deetz] 신청이 접수되었습니다",
    tagline: "댄서 매거진 &amp; 캐스팅 플랫폼",
    badge: "접수 완료",
    greeting: (name) => `${esc(name)}님, 안녕하세요.`,
    bodyHtml:
      "deetz를 통해 한국 활동을 신청해 주셔서 감사합니다.<br>신청이 정상적으로 접수되었습니다.",
    bodyText: [
      "deetz를 통해 한국 활동을 신청해 주셔서 감사합니다.",
      "신청이 정상적으로 접수되었습니다.",
    ],
    nextTitle: "다음 안내",
    nextHtml:
      "보내주신 내용을 바탕으로 프로그램 구성을 확인하겠습니다.<br>프로그램 구성이 준비되는 대로 담당자가 입력하신 이메일로 개별 연락드리겠습니다.<br>지금 따로 하실 일은 없습니다.",
    copyrightNote: "이 메일은 deetz 신청 주소로 발송되었습니다.",
  },
};

/**
 * 비자/프로그램 온보딩 신청자에게 "접수 완료 + 프로그램 구성 후 연락" 자동 확인 메일.
 * 제출 시 사용한 언어(en/ja/ko)로 발송. deetz 공식 메일 양식(560px 카드 + SNS 푸터) 사용. 비치명적.
 */
export async function sendVisaApplicantConfirmationEmail(params: {
  to: string;
  name: string;
  lang: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!params.to) return { ok: false, error: "no_recipient" };
  const lang: Lang = params.lang === "ja" || params.lang === "ko" ? params.lang : "en";
  const c = COPY[lang];
  const name = params.name?.trim() || "dancer";

  const text = [
    c.greeting(name).replace(/<[^>]+>/g, ""),
    "",
    ...c.bodyText,
    "",
    `[${c.nextTitle}]`,
    ...c.nextHtml.replace(/<br>/g, "\n").split("\n"),
    "",
    "deetz · deetz.kr · dancers.bio.kr@gmail.com",
  ].join("\n");

  const html = `<html lang="${lang}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${c.tagline}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c.badge)}</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${c.greeting(name)}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${c.bodyHtml}</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:8px;">${esc(c.nextTitle)}</div>
    <div style="font-size:14px;line-height:1.75;color:#33363b;">${c.nextHtml}</div></div></td></tr>
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${c.tagline}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz_magazine/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:dancers.bio.kr@gmail.com" style="color:#44474d;text-decoration:none;">dancers.bio.kr@gmail.com</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${esc(c.copyrightNote)}</div></td></tr>
</table></td></tr></table></body></html>`;

  return await sendGmailEmail({ to: params.to, subject: c.subject, text, html });
}
