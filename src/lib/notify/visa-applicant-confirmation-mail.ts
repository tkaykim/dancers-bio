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
  linkLabel: string;
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
      "Please complete the short case form below with three Zoom meeting time options.<br>The audition lesson date is not fixed yet.<br>We plan to run one audition in August and one in September at a dance studio near Hapjeong or Sinchon in Seoul.<br>A choreographer will lead one lesson and we will use the filmed result as a level test.<br>If you pass, we begin visa preparation immediately.<br>If more preparation is needed, you enter our affiliated academy training and take a month-end evaluation.<br>The base guide price is about ₩4,000,000, and the final quote may be lower or higher after consultation.<br>deetz project opportunities may be offered, but work and visa approval are not guaranteed.",
    linkLabel: "Complete my case information",
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
      "下の専用フォームに、Zoom相談が可能な日時を3つご入力ください。<br>オーディションレッスンの日程はまだ確定していません。<br>8月に1回、9月に1回、ソウルの合井または新村近くのダンススタジオで実施予定です。<br>振付師によるレッスンを1回行い、撮影映像を含めてレベルを確認します。<br>合格した場合はすぐにビザ準備へ進み、補完が必要な場合は提携アカデミーのトレーニングと月末評価を行います。<br>基本目安料金は約400万ウォンで、最終費用は相談後に安くなる場合も高くなる場合もあります。<br>deetzの案件をご案内する場合がありますが、仕事とビザ発給を保証するものではありません。",
    linkLabel: "追加情報を入力する",
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
      "아래 전용 질문지에 Zoom 미팅 가능한 날짜와 시간을 3개 입력해 주세요.<br>오디션 레슨 일정은 아직 확정되지 않았습니다.<br>8월 1회, 9월 1회 합정 또는 신촌 근방 댄스 스튜디오에서 진행할 예정입니다.<br>안무가가 레슨 1회를 진행하고 촬영 영상을 포함해 레벨을 평가합니다.<br>통과하면 즉시 비자 준비로 이동하고, 보완이 필요하면 제휴 학원 전문 트레이닝과 월말평가를 진행합니다.<br>기본 안내 단가는 약 400만원이며, 상담 후 최종 비용이 내려가거나 추가될 수 있습니다.<br>deetz 프로젝트 기회를 안내할 수 있지만 일거리와 비자 발급을 보장하지는 않습니다.",
    linkLabel: "추가 정보 입력하기",
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
  caseUrl: string;
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
    `${c.linkLabel}: ${params.caseUrl}`,
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
    <div style="font-size:14px;line-height:1.75;color:#33363b;">${c.nextHtml}</div>
    <a href="${esc(params.caseUrl)}" style="display:inline-block;margin-top:14px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 16px;border-radius:10px;">${esc(c.linkLabel)}</a></div></td></tr>
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
