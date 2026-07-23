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
      "Thank you for applying to dance in Korea with deetz.<br>Your application has been received.<br>GRIGO Entertainment has been working in Korea for about seven years across dance management, agency work, choreography production, and event production.<br>We work with represented artists and a dancer network in Korea, so deetz can guide overseas dancers toward a realistic next step.",
    bodyText: [
      "Thank you for applying to dance in Korea with deetz.",
      "Your application has been received.",
      "GRIGO Entertainment has been working in Korea for about seven years across dance management, agency work, choreography production, and event production.",
      "We work with represented artists and a dancer network in Korea, so deetz can guide overseas dancers toward a realistic next step.",
    ],
    nextTitle: "What happens next",
    nextHtml:
      "Please complete the short case form below with three times when you can join an online meeting by Zoom or Google Meet.<br>We will review your situation in an online meeting first.<br>After the meeting, we will let you know whether we can move forward and what schedule is realistic.<br>If your visa route is ready, we will begin preparing the visa documents with you.<br>If more preparation is needed, we may recommend training before moving into the visa process.<br>deetz project opportunities may be offered, but work and visa approval are not guaranteed.",
    linkLabel: "Submit additional info + video meeting times",
    copyrightNote: "This email was sent to the address used for your deetz application.",
  },
  ja: {
    subject: "[deetz] お申し込みを受け付けました",
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    badge: "受付完了",
    greeting: (name) => `${esc(name)}様`,
    bodyHtml:
      "deetzを通じて韓国での活動にご応募いただきありがとうございます。<br>お申し込みを受け付けました。<br>GRIGO Entertainmentは、韓国で約7年にわたり、ダンスマネジメント、エージェンシー、振付制作、イベント制作などを行っている会社です。<br>所属アーティストと韓国のダンサーネットワークを基盤に、海外ダンサーの韓国活動に向けた現実的な次のステップをご案内しています。",
    bodyText: [
      "deetzを通じて韓国での活動にご応募いただきありがとうございます。",
      "お申し込みを受け付けました。",
      "GRIGO Entertainmentは、韓国で約7年にわたり、ダンスマネジメント、エージェンシー、振付制作、イベント制作などを行っている会社です。",
      "所属アーティストと韓国のダンサーネットワークを基盤に、海外ダンサーの韓国活動に向けた現実的な次のステップをご案内しています。",
    ],
    nextTitle: "次のご案内",
    nextHtml:
      "下の専用フォームに、ZoomまたはGoogle Meetでのオンラインミーティングが可能な日時を3つご入力ください。<br>まずオンラインミーティングで現在の状況を詳しく確認します。<br>相談後、進行可能かどうかと現実的なスケジュールをご案内します。<br>すぐに進行できる場合は、ビザ書類の準備を一緒に始めます。<br>準備が必要な場合は、ビザ準備の前にトレーニングをご案内することがあります。<br>deetzの案件をご案内する場合がありますが、仕事とビザ発給を保証するものではありません。",
    linkLabel: "追加情報＋オンラインミーティング日時を提出する",
    copyrightNote: "このメールはdeetz申込時の登録アドレスへ送信されました。",
  },
  ko: {
    subject: "[deetz] 신청이 접수되었습니다",
    tagline: "댄서 매거진 &amp; 캐스팅 플랫폼",
    badge: "접수 완료",
    greeting: (name) => `${esc(name)}님, 안녕하세요.`,
    bodyHtml:
      "deetz를 통해 한국 활동을 신청해 주셔서 감사합니다.<br>신청이 정상적으로 접수되었습니다.<br>그리고엔터테인먼트는 약 7년 동안 한국에서 댄스 매니지먼트, 에이전시, 안무 제작, 행사 제작 등을 해온 회사입니다.<br>현재 소속 아티스트들과 댄서 네트워크를 기반으로, 한국 활동을 준비하는 해외 댄서에게 현실적인 다음 단계를 안내하고 있습니다.",
    bodyText: [
      "deetz를 통해 한국 활동을 신청해 주셔서 감사합니다.",
      "신청이 정상적으로 접수되었습니다.",
      "그리고엔터테인먼트는 약 7년 동안 한국에서 댄스 매니지먼트, 에이전시, 안무 제작, 행사 제작 등을 해온 회사입니다.",
      "현재 소속 아티스트들과 댄서 네트워크를 기반으로, 한국 활동을 준비하는 해외 댄서에게 현실적인 다음 단계를 안내하고 있습니다.",
    ],
    nextTitle: "다음 안내",
    nextHtml:
      "아래 전용 질문지에 온라인 미팅 (Zoom 또는 Google Meet)이 가능한 날짜와 시간을 3개 입력해 주세요.<br>먼저 온라인 미팅으로 현재 상황을 자세히 확인합니다.<br>상담 후 진행 가능 여부와 현실적인 일정을 안내드립니다.<br>바로 진행 가능한 경우 비자 서류 준비를 함께 시작합니다.<br>준비가 더 필요한 경우 비자 준비 전에 트레이닝을 안내할 수 있습니다.<br>deetz 프로젝트 기회를 안내할 수 있지만 일거리와 비자 발급을 보장하지는 않습니다.",
    linkLabel: "추가정보 + 화상 미팅 일정 제출하기",
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
