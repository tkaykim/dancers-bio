import "server-only";
import { sendGmailEmail } from "@/lib/gmail";

// 결제 완료 알림 메일 2종.
//
// 결제 자체는 grigoent 에서 일어나지만, 발신은 contact@deetz.kr 로 통일한다(대표 지시).
// 양식은 deetz 공식 메일 정본(560px 카드 + SNS 푸터) 그대로.
//
// 구매자용은 결제 언어(ko/en/ja)로, 운영자용은 한국어 요약으로 보낸다.

type Lang = "en" | "ja" | "ko";

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function krw(value: number, lang: Lang): string {
  const n = value.toLocaleString("ko-KR");
  if (lang === "en") return `KRW ${n}`;
  if (lang === "ja") return `${n}ウォン`;
  return `${n}원`;
}

export type PaymentReceiptInput = {
  to: string;
  customerName: string;
  lang: string | null;
  orderNo: string;
  productTitle: string;
  /** 실제 청구된 원화 금액 */
  paidAmount: number;
  /** 할인 전 금액. 할인이 없으면 paidAmount 와 같다. */
  originalAmount: number;
  discountCode: string | null;
  discountAmount: number;
  provider: "toss" | "paypal";
  /** PayPal 은 외화로 청구된다. 표기용. */
  foreignCharge: { currency: string; amount: number } | null;
  paidAt: string;
  receiptUrl: string | null;
  documentIntakeUrl: string | null;
};

const PROVIDER_LABEL: Record<Lang, Record<"toss" | "paypal", string>> = {
  ko: { toss: "카드·계좌이체 (토스페이먼츠)", paypal: "PayPal" },
  en: { toss: "Card / bank transfer (Toss Payments)", paypal: "PayPal" },
  ja: { toss: "カード・口座振込（トスペイメンツ）", paypal: "PayPal" },
};

const COPY: Record<
  Lang,
  {
    subject: (orderNo: string) => string;
    tagline: string;
    badge: string;
    greeting: (name: string) => string;
    bodyHtml: string;
    labels: {
      orderNo: string;
      product: string;
      amount: string;
      original: string;
      discount: string;
      method: string;
      paidAt: string;
      foreign: string;
    };
    nextTitle: string;
    nextHtml: string;
    lookupLabel: string;
    receiptLabel: string;
    documentTitle: string;
    documentBody: string;
    documentLabel: string;
    copyrightNote: string;
  }
> = {
  ko: {
    subject: (orderNo) => `[deetz] 결제가 완료되었습니다 (${orderNo})`,
    tagline: "댄서 매거진 &amp; 캐스팅 플랫폼",
    badge: "결제 완료",
    greeting: (name) => `${esc(name)}님,`,
    bodyHtml:
      "결제가 정상적으로 완료되었습니다.<br>아래 내역을 확인해 주세요.<br>이 메일은 결제 확인용으로 보관하시면 됩니다.",
    labels: {
      orderNo: "결제번호",
      product: "상품",
      amount: "결제 금액",
      original: "정가",
      discount: "할인",
      method: "결제 수단",
      paidAt: "결제 일시",
      foreign: "실제 청구액",
    },
    nextTitle: "다음 안내",
    nextHtml:
      "담당자가 확인한 뒤 진행 일정을 개별적으로 안내드립니다.<br>결제 내역은 아래에서 언제든 다시 확인하실 수 있습니다.<br>문의는 이 메일에 그대로 회신해 주세요.",
    lookupLabel: "결제 내역 조회",
    receiptLabel: "영수증 보기",
    documentTitle: "비자 서류 정보 제출",
    documentBody: "결제에 사용한 이메일로 deetz에 로그인해 서류 정보를 작성해 주세요.<br>작성 내용은 자동으로 임시 저장됩니다.",
    documentLabel: "비자 서류 작성하기",
    copyrightNote: "이 메일은 결제 시 입력하신 주소로 발송되었습니다.",
  },
  en: {
    subject: (orderNo) => `[deetz] Payment confirmed (${orderNo})`,
    tagline: "Dancer magazine &amp; casting platform",
    badge: "Payment confirmed",
    greeting: (name) => `Hi ${esc(name)},`,
    bodyHtml:
      "Your payment went through.<br>Please check the details below.<br>Keep this email as your payment confirmation.",
    labels: {
      orderNo: "Order number",
      product: "Item",
      amount: "Amount paid",
      original: "List price",
      discount: "Discount",
      method: "Payment method",
      paidAt: "Paid at",
      foreign: "Actually charged",
    },
    nextTitle: "What happens next",
    nextHtml:
      "Our team will review and contact you with the schedule.<br>You can look up this payment anytime at the link below.<br>Just reply to this email if you have any questions.",
    lookupLabel: "Look up my payment",
    receiptLabel: "View receipt",
    documentTitle: "Submit your visa document information",
    documentBody: "Log in to deetz with the email used for payment and complete the document form.<br>Your entries are saved automatically.",
    documentLabel: "Open document form",
    copyrightNote: "This email was sent to the address you entered at checkout.",
  },
  ja: {
    subject: (orderNo) => `[deetz] お支払いが完了しました (${orderNo})`,
    tagline: "ダンサーマガジン &amp; キャスティングプラットフォーム",
    badge: "決済完了",
    greeting: (name) => `${esc(name)}様`,
    bodyHtml:
      "お支払いが正常に完了しました。<br>下記の内容をご確認ください。<br>このメールはお支払い確認用として保管してください。",
    labels: {
      orderNo: "決済番号",
      product: "商品",
      amount: "お支払い金額",
      original: "定価",
      discount: "割引",
      method: "お支払い方法",
      paidAt: "決済日時",
      foreign: "実際の請求額",
    },
    nextTitle: "今後のご案内",
    nextHtml:
      "担当者が確認のうえ、進行スケジュールを個別にご案内いたします。<br>お支払い内容は下記からいつでもご確認いただけます。<br>ご不明な点はこのメールにそのままご返信ください。",
    lookupLabel: "決済内容を確認する",
    receiptLabel: "領収書を見る",
    documentTitle: "ビザ書類情報の提出",
    documentBody: "決済時のメールアドレスでdeetzにログインし、書類フォームをご入力ください。<br>入力内容は自動保存されます。",
    documentLabel: "書類フォームを開く",
    copyrightNote: "このメールは決済時にご入力いただいたアドレスへ送信されています。",
  },
};

function formatPaidAt(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : "en-US", {
      timeZone: "Asia/Seoul",
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function row(label: string, value: string, strong = false): string {
  return `<tr>
    <td style="padding:7px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
    <td style="padding:7px 0 7px 16px;font-size:${strong ? "15px" : "14px"};color:#111111;${strong ? "font-weight:700;" : ""}text-align:right;">${value}</td>
  </tr>`;
}

const LOOKUP_URL = "https://grigoent.co.kr/training/orders";

/**
 * 구매자에게 결제 완료 영수증을 보낸다.
 * 결제는 이미 끝난 상태이므로 실패해도 호출부를 막지 않는다(비치명적).
 */
export async function sendPaymentReceiptEmail(input: PaymentReceiptInput): Promise<{
  ok: boolean;
  error?: string;
  subject: string;
  html: string;
}> {
  const lang: Lang = input.lang === "ja" || input.lang === "en" ? input.lang : "ko";
  const c = COPY[lang];
  const hasDiscount = input.discountAmount > 0;

  const rows = [
    row(c.labels.orderNo, `<span style="font-family:monospace;">${esc(input.orderNo)}</span>`),
    row(c.labels.product, esc(input.productTitle)),
    hasDiscount
      ? row(
          c.labels.original,
          `<span style="color:#9ca3af;text-decoration:line-through;">${esc(krw(input.originalAmount, lang))}</span>`,
        )
      : "",
    hasDiscount
      ? row(
          c.labels.discount,
          `<span style="color:#059669;">− ${esc(krw(input.discountAmount, lang))}${
            input.discountCode ? ` <span style="font-family:monospace;font-size:12px;">(${esc(input.discountCode)})</span>` : ""
          }</span>`,
        )
      : "",
    row(c.labels.amount, esc(krw(input.paidAmount, lang)), true),
    input.foreignCharge
      ? row(
          c.labels.foreign,
          `${esc(input.foreignCharge.currency)} ${input.foreignCharge.amount.toLocaleString("en-US")}`,
        )
      : "",
    row(c.labels.method, esc(PROVIDER_LABEL[lang][input.provider])),
    row(c.labels.paidAt, esc(formatPaidAt(input.paidAt, lang))),
  ]
    .filter(Boolean)
    .join("");

  const html = `<html lang="${lang}"><body style="margin:0;padding:0;background:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ececef;border-radius:18px;overflow:hidden;font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;">
<tr><td style="padding:28px 32px 18px;border-bottom:1px solid #ececef;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="58" height="28" style="display:block;height:28px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin-top:10px;">${c.tagline}</div></td></tr>
<tr><td style="padding:30px 32px 8px;color:#111111;">
  <span style="display:inline-block;background:#ecfdf5;color:#047857;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">${esc(c.badge)}</span>
  <p style="font-size:18px;font-weight:700;margin:18px 0 4px;line-height:1.5;">${c.greeting(input.customerName)}</p>
  <p style="font-size:15px;line-height:1.75;color:#33363b;margin:0;">${c.bodyHtml}</p></td></tr>
<tr><td style="padding:18px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
  </div></td></tr>
<tr><td style="padding:14px 32px 6px;">
  <div style="background:#f6f6f7;border:1px solid #ececef;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#111111;margin-bottom:8px;">${esc(c.nextTitle)}</div>
    <div style="font-size:14px;line-height:1.75;color:#33363b;">${c.nextHtml}</div>
    <a href="${LOOKUP_URL}" style="display:inline-block;margin-top:14px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 16px;border-radius:10px;">${esc(c.lookupLabel)}</a>${
      input.receiptUrl
        ? `<a href="${esc(input.receiptUrl)}" style="display:inline-block;margin:14px 0 0 8px;border:1px solid #d4d4d8;color:#111111;text-decoration:none;font-size:14px;font-weight:700;padding:10px 16px;border-radius:10px;">${esc(c.receiptLabel)}</a>`
        : ""
    }</div></td></tr>
${input.documentIntakeUrl ? `<tr><td style="padding:8px 32px 6px;">
  <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:14px;padding:16px 18px;">
    <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:8px;">${esc(c.documentTitle)}</div>
    <div style="font-size:14px;line-height:1.75;color:#7c2d12;">${c.documentBody}</div>
    <a href="${esc(input.documentIntakeUrl)}" style="display:inline-block;margin-top:14px;background:#111111;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 16px;border-radius:10px;">${esc(c.documentLabel)}</a>
  </div></td></tr>` : ""}
<tr><td style="padding:22px 32px 28px;border-top:1px solid #ececef;background:#fafafa;">
  <img src="https://www.deetz.kr/brand/deetz-logo-black.png" alt="deetz" width="41" height="20" style="display:block;height:20px;width:auto;border:0;">
  <div style="font-size:12px;color:#6b7280;margin:10px 0 14px;">${c.tagline}</div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:10px;"><a href="https://www.youtube.com/@deetzmagazine"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/youtube.png" width="30" height="30" alt="YouTube" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
    <td><a href="https://www.instagram.com/deetz.kr/"><img src="https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/assets/email/instagram.png" width="30" height="30" alt="Instagram" style="display:block;border-radius:8px;border:1px solid #ececef;"></a></td>
  </tr></table>
  <div style="font-size:12px;color:#6b7280;line-height:1.9;margin-top:14px;">
    <a href="https://deetz.kr" style="color:#44474d;text-decoration:none;">deetz.kr</a> &nbsp;·&nbsp; <a href="mailto:contact@deetz.kr" style="color:#44474d;text-decoration:none;">contact@deetz.kr</a></div>
  <div style="font-size:11px;color:#a1a1aa;margin-top:12px;line-height:1.6;">© 2026 deetz. All rights reserved.<br>${esc(c.copyrightNote)}</div></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    c.badge,
    "",
    `${c.labels.orderNo}: ${input.orderNo}`,
    `${c.labels.product}: ${input.productTitle}`,
    hasDiscount ? `${c.labels.original}: ${krw(input.originalAmount, lang)}` : "",
    hasDiscount
      ? `${c.labels.discount}: -${krw(input.discountAmount, lang)}${input.discountCode ? ` (${input.discountCode})` : ""}`
      : "",
    `${c.labels.amount}: ${krw(input.paidAmount, lang)}`,
    input.foreignCharge ? `${c.labels.foreign}: ${input.foreignCharge.currency} ${input.foreignCharge.amount}` : "",
    `${c.labels.method}: ${PROVIDER_LABEL[lang][input.provider]}`,
    `${c.labels.paidAt}: ${formatPaidAt(input.paidAt, lang)}`,
    "",
    input.documentIntakeUrl ? `${c.documentTitle}: ${input.documentIntakeUrl}` : "",
    input.documentIntakeUrl ? c.documentBody.replace(/<br>/g, " ") : "",
    "",
    LOOKUP_URL,
  ]
    .filter(Boolean)
    .join("\n");

  const subject = c.subject(input.orderNo);
  const sent = await sendGmailEmail({ to: input.to, subject, text, html });
  return { ok: sent.ok, error: sent.error, subject, html };
}

/**
 * 운영자(contact@deetz.kr)에게 결제 발생을 알린다.
 * 구매자용과 달리 항상 한국어이고, 대사에 필요한 값만 담는다.
 */
export async function sendPaymentInternalNotice(
  input: PaymentReceiptInput & { visaCaseUrl: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const hasDiscount = input.discountAmount > 0;
  const line = (k: string, v: string) =>
    `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#111;">${v}</td></tr>`;

  const html = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;word-break:keep-all;">
<p style="margin:0 0 14px;font-size:16px;font-weight:700;">결제가 들어왔습니다.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${line("결제번호", `<span style="font-family:monospace;">${esc(input.orderNo)}</span>`)}
${line("상품", esc(input.productTitle))}
${line("구매자", `${esc(input.customerName)} &lt;${esc(input.to)}&gt;`)}
${hasDiscount ? line("정가", `${input.originalAmount.toLocaleString("ko-KR")}원`) : ""}
${hasDiscount ? line("할인", `−${input.discountAmount.toLocaleString("ko-KR")}원 ${input.discountCode ? `(${esc(input.discountCode)})` : ""}`) : ""}
${line("결제 금액", `<strong>${input.paidAmount.toLocaleString("ko-KR")}원</strong>`)}
${input.foreignCharge ? line("실제 청구", `${esc(input.foreignCharge.currency)} ${input.foreignCharge.amount}`) : ""}
${line("결제 수단", input.provider === "paypal" ? "PayPal" : "토스페이먼츠")}
${line("결제 일시", esc(formatPaidAt(input.paidAt, "ko")))}
${input.visaCaseUrl ? line("지원자 케이스", `<a href="${esc(input.visaCaseUrl)}">${esc(input.visaCaseUrl)}</a>`) : ""}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.8;">
구매자에게는 결제 완료 안내 메일이 함께 발송되었습니다.<br>
주문 상세와 환불은 <a href="https://grigoent.co.kr/admin/training-orders">결제 주문 관리</a>에서 처리하세요.
</p></div>`;

  const sent = await sendGmailEmail({
    to: "contact@deetz.kr",
    subject: `[결제] ${input.paidAmount.toLocaleString("ko-KR")}원 · ${input.productTitle} · ${input.customerName} (${input.orderNo})`,
    text: `결제 발생\n결제번호 ${input.orderNo}\n상품 ${input.productTitle}\n구매자 ${input.customerName} <${input.to}>\n금액 ${input.paidAmount.toLocaleString("ko-KR")}원\n수단 ${input.provider}`,
    html,
    // 운영자가 받은 알림에서 바로 구매자에게 회신할 수 있게 한다.
    replyTo: input.to,
  });
  return { ok: sent.ok, error: sent.error };
}
