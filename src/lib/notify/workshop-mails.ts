import "server-only";

import { sendGmailEmail } from "@/lib/gmail";
import { escapeHtml, renderDeetzMail } from "@/lib/notify/deetz-mail";
import { won } from "@/lib/workshops/shared";

// deetz Workshop 메일 3종.
// 1) 안무가 제안 접수 → 운영자 알림
// 2) 예약금 결제 완료 → 구매자 안내(공식 560px 카드 양식)
// 3) 예약금 결제 완료 → 운영자 알림
// 발송 실패는 모두 비치명적(호출부에서 try/catch) — 접수·결제 자체를 막으면 안 된다.

const OPS_TO = process.env.WORKSHOP_OPS_TO || "contact@deetz.kr";

function line(k: string, v: string): string {
  return `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;font-size:14px;color:#111;">${v}</td></tr>`;
}

export async function sendWorkshopNominationOpsMail(input: {
  artistName: string;
  instagramHandle: string;
  isNewArtist: boolean;
  wantType: string | null;
  comment: string | null;
  contactEmail: string | null;
  contactInstagram: string | null;
  demandCount: number;
}): Promise<void> {
  const html = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;word-break:keep-all;">
<p style="margin:0 0 14px;font-size:16px;font-weight:700;">워크샵 안무가 ${input.isNewArtist ? "신규 제안" : "수요"}이 들어왔습니다.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${line("안무가", escapeHtml(input.artistName))}
${line("인스타그램", `<a href="https://www.instagram.com/${escapeHtml(input.instagramHandle)}/">@${escapeHtml(input.instagramHandle)}</a>`)}
${line("누적 수요", `${input.demandCount}명`)}
${input.wantType ? line("희망 형태", escapeHtml(input.wantType)) : ""}
${input.comment ? line("코멘트", escapeHtml(input.comment)) : ""}
${input.contactEmail ? line("제출자 이메일", escapeHtml(input.contactEmail)) : ""}
${input.contactInstagram ? line("제출자 인스타", `@${escapeHtml(input.contactInstagram)}`) : ""}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.8;">
카드 공개·모집 오픈은 <a href="https://deetz.kr/admin/workshops">워크샵 관리</a>에서 처리하세요.
</p></div>`;

  await sendGmailEmail({
    to: OPS_TO,
    subject: `[deetz Workshop ${input.isNewArtist ? "제안" : "수요"}] ${input.artistName} (@${input.instagramHandle}) · 누적 ${input.demandCount}명`,
    text: `워크샵 수요 접수\n안무가 ${input.artistName} (@${input.instagramHandle})\n누적 수요 ${input.demandCount}명`,
    html,
  });
}

export async function sendWorkshopDepositReceiptEmail(input: {
  to: string;
  customerName: string;
  artistName: string;
  orderNo: string;
  amount: number;
  totalPrice: number | null;
  minHeadcount: number | null;
  expectedPeriod: string | null;
  provider: "toss" | "paypal";
  paidAt: string;
  receiptUrl: string | null;
  detailUrl: string;
}): Promise<void> {
  const paidAtLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(input.paidAt));

  const html = renderDeetzMail({
    pill: "예약금 결제 완료",
    pillTone: "ok",
    heading: `${escapeHtml(input.customerName)}님, ${escapeHtml(input.artistName)} 워크샵 자리가 예약되었습니다.`,
    bodyLines: [
      "예약금 결제가 정상적으로 완료되었습니다.",
      "최소 인원이 모이면 초청이 확정되고, 확정 안내와 함께 잔금 결제 방법을 알려드립니다.",
      "이 메일은 결제 확인용으로 보관해 주세요.",
    ],
    infoRows: [
      { label: "결제번호", value: `<span style="font-family:monospace;">${escapeHtml(input.orderNo)}</span>` },
      { label: "워크샵", value: escapeHtml(`${input.artistName} 초청 워크샵`) },
      { label: "예약금", value: escapeHtml(won(input.amount)), strong: true },
      ...(input.totalPrice
        ? [{ label: "총 수강료", value: escapeHtml(`${won(input.totalPrice)} (예약금 차감 후 잔금 결제)`) }]
        : []),
      ...(input.expectedPeriod ? [{ label: "예상 시기", value: escapeHtml(input.expectedPeriod) }] : []),
      { label: "결제 수단", value: input.provider === "paypal" ? "PayPal" : "카드·계좌이체 (토스페이먼츠)" },
      { label: "결제 일시", value: escapeHtml(paidAtLabel) },
      ...(input.receiptUrl
        ? [{ label: "영수증", value: `<a href="${escapeHtml(input.receiptUrl)}">영수증 보기</a>` }]
        : []),
    ],
    noticeLines: [
      "모집 인원 미달로 워크샵이 열리지 않으면 예약금은 전액 환불됩니다.",
      "초청 확정 전에는 언제든 취소·전액 환불이 가능합니다.",
      "초청 확정 후에는 환불이 불가하며, 다른 참가자에게 양도만 가능합니다.",
    ],
    cta: { label: "워크샵 진행 상황 보기", href: input.detailUrl },
    footerLines: ["문의는 이 메일에 그대로 회신해 주세요."],
  });

  await sendGmailEmail({
    to: input.to,
    subject: `[deetz] ${input.artistName} 워크샵 예약금 결제 완료 (${input.orderNo})`,
    text: [
      "예약금 결제 완료",
      `결제번호 ${input.orderNo}`,
      `워크샵 ${input.artistName} 초청 워크샵`,
      `예약금 ${won(input.amount)}`,
      `결제 일시 ${paidAtLabel}`,
      "",
      input.detailUrl,
    ].join("\n"),
    html,
  });
}

/**
 * 돈은 받았는데 예약 확정에 실패한 건 알림(운영자 전용).
 * 웹훅·대사 크론이 없는 v1 에서 이걸 놓치면 고객은 결제했는데 자리가 없는 상태가 된다.
 */
export async function sendWorkshopPaymentRecoveryMail(input: {
  orderNo: string;
  reason: string;
  artistName: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  provider: "toss" | "paypal";
  paymentKey: string | null;
}): Promise<void> {
  const html = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;word-break:keep-all;">
<p style="margin:0 0 14px;font-size:16px;font-weight:700;color:#b91c1c;">⚠️ 결제는 됐는데 예약 확정에 실패했습니다.</p>
<p style="margin:0 0 14px;font-size:13px;color:#6b7280;line-height:1.8;">
사유: ${escapeHtml(input.reason)}<br>
고객에게는 "확정 처리 지연" 안내가 표시됩니다. 수동 확인이 필요합니다.
</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${line("워크샵", escapeHtml(input.artistName))}
${line("결제번호", `<span style="font-family:monospace;">${escapeHtml(input.orderNo)}</span>`)}
${line("고객", `${escapeHtml(input.customerName)} &lt;${escapeHtml(input.customerEmail)}&gt;`)}
${line("금액", `<strong>${escapeHtml(won(input.amount))}</strong>`)}
${line("PG", input.provider === "paypal" ? "PayPal" : "토스페이먼츠")}
${line("paymentKey", `<span style="font-family:monospace;font-size:12px;">${escapeHtml(input.paymentKey ?? "(없음)")}</span>`)}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.8;">
PG 콘솔에서 위 paymentKey 로 실제 승인 여부를 확인한 뒤, 좌석을 복구하거나 환불 처리하세요.<br>
<a href="https://deetz.kr/admin/workshops">워크샵 관리</a>
</p></div>`;

  await sendGmailEmail({
    to: OPS_TO,
    subject: `🚨 [Workshop 결제복구] ${input.orderNo} · ${won(input.amount)} · ${input.customerName}`,
    text: `결제 확정 실패\n사유 ${input.reason}\n결제번호 ${input.orderNo}\n고객 ${input.customerName} <${input.customerEmail}>\n금액 ${won(input.amount)}\npaymentKey ${input.paymentKey ?? "(없음)"}`,
    html,
  });
}

export async function sendWorkshopDepositOpsMail(input: {
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  artistName: string;
  orderNo: string;
  amount: number;
  provider: "toss" | "paypal";
  paidCount: number;
  minHeadcount: number | null;
}): Promise<void> {
  const progress =
    input.minHeadcount && input.minHeadcount > 0
      ? `${input.paidCount}/${input.minHeadcount}명${input.paidCount >= input.minHeadcount ? " — 🎉 최소 인원 달성" : ""}`
      : `${input.paidCount}명`;

  const html = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;word-break:keep-all;">
<p style="margin:0 0 14px;font-size:16px;font-weight:700;">워크샵 예약금 결제가 들어왔습니다.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${line("워크샵", escapeHtml(`${input.artistName} 초청 워크샵`))}
${line("결제번호", `<span style="font-family:monospace;">${escapeHtml(input.orderNo)}</span>`)}
${line("구매자", `${escapeHtml(input.customerName)} &lt;${escapeHtml(input.customerEmail)}&gt;${input.customerPhone ? ` · ${escapeHtml(input.customerPhone)}` : ""}`)}
${line("예약금", `<strong>${escapeHtml(won(input.amount))}</strong>`)}
${line("결제 수단", input.provider === "paypal" ? "PayPal" : "토스페이먼츠")}
${line("모집 현황", escapeHtml(progress))}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.8;">
예약자 관리는 <a href="https://deetz.kr/admin/workshops">워크샵 관리</a>에서 확인하세요.
</p></div>`;

  await sendGmailEmail({
    to: OPS_TO,
    subject: `[Workshop 예약금] ${won(input.amount)} · ${input.artistName} · ${input.customerName} (${progress})`,
    text: `워크샵 예약금 결제\n${input.artistName} / ${input.customerName} / ${won(input.amount)}\n모집 현황 ${progress}`,
    html,
    replyTo: input.customerEmail,
  });
}

// ── 행사(Event) 주문 메일 ───────────────────────────────────────────────────
// 해외 행사(방콕 등)는 구매자가 외국인일 수 있어 EN/KO 2개 언어만 지원한다.

type EventSessionLine = {
  title: string;
  instructor_name: string;
  session_date: string;
  start_time: string;
  end_time: string;
};

const EVENT_RECEIPT_COPY = {
  en: {
    subject: (orderNo: string) => `[deetz] Your class registration is confirmed (${orderNo})`,
    pill: "Registration confirmed",
    heading: (name: string) => `${escapeHtml(name)}, you're in!`,
    body: [
      "Your payment went through and your spot is confirmed.",
      "Show this email at the door on class day.",
    ],
    orderNo: "Order",
    eventLabel: "Event",
    venueLabel: "Venue",
    classesLabel: "Classes",
    paidLabel: "Paid",
    receipt: "View receipt",
    cta: "View event page",
    footer: "Questions? Just reply to this email.",
  },
  ko: {
    subject: (orderNo: string) => `[deetz] 클래스 신청이 확정되었습니다 (${orderNo})`,
    pill: "신청 확정",
    heading: (name: string) => `${escapeHtml(name)}님, 신청이 확정되었습니다!`,
    body: ["결제가 완료되어 자리가 확정되었습니다.", "수업 당일 입장 시 이 메일을 보여주세요."],
    orderNo: "주문번호",
    eventLabel: "행사",
    venueLabel: "장소",
    classesLabel: "클래스",
    paidLabel: "결제 금액",
    receipt: "영수증 보기",
    cta: "행사 페이지 보기",
    footer: "문의는 이 메일에 그대로 회신해 주세요.",
  },
} as const;

export async function sendEventOrderReceiptEmail(input: {
  to: string;
  lang: "en" | "ko";
  customerName: string;
  orderNo: string;
  eventTitle: string;
  venue: string | null;
  sessions: EventSessionLine[];
  chargedLabel: string;
  receiptUrl: string | null;
  detailUrl: string;
}): Promise<void> {
  const c = EVENT_RECEIPT_COPY[input.lang];
  const sessionsHtml = input.sessions
    .map(
      (s) =>
        `${escapeHtml(s.session_date)} ${escapeHtml(s.start_time.slice(0, 5))}–${escapeHtml(s.end_time.slice(0, 5))} · <b>${escapeHtml(s.title)}</b> (${escapeHtml(s.instructor_name)})`,
    )
    .join("<br>");

  const html = renderDeetzMail({
    pill: c.pill,
    pillTone: "ok",
    heading: c.heading(input.customerName),
    bodyLines: [...c.body],
    infoRows: [
      { label: c.orderNo, value: `<span style="font-family:monospace;">${escapeHtml(input.orderNo)}</span>` },
      { label: c.eventLabel, value: escapeHtml(input.eventTitle) },
      ...(input.venue ? [{ label: c.venueLabel, value: escapeHtml(input.venue) }] : []),
      { label: c.classesLabel, value: sessionsHtml },
      { label: c.paidLabel, value: escapeHtml(input.chargedLabel), strong: true },
      ...(input.receiptUrl
        ? [{ label: c.receipt, value: `<a href="${escapeHtml(input.receiptUrl)}">${escapeHtml(c.receipt)}</a>` }]
        : []),
    ],
    cta: { label: c.cta, href: input.detailUrl },
    footerLines: [c.footer],
  });

  await sendGmailEmail({
    to: input.to,
    subject: c.subject(input.orderNo),
    text: [
      c.pill,
      `${c.orderNo}: ${input.orderNo}`,
      `${c.eventLabel}: ${input.eventTitle}`,
      ...input.sessions.map(
        (s) => `- ${s.session_date} ${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)} ${s.title} (${s.instructor_name})`,
      ),
      `${c.paidLabel}: ${input.chargedLabel}`,
      "",
      input.detailUrl,
    ].join("\n"),
    html,
  });
}

export async function sendEventOrderOpsMail(input: {
  orderNo: string;
  eventTitle: string;
  customerName: string;
  customerEmail: string;
  chargedLabel: string;
  amountKrw: number;
  provider: "toss" | "paypal";
}): Promise<void> {
  const html = `<div style="font-family:'Apple SD Gothic Neo','Malgun Gothic',Helvetica,Arial,sans-serif;font-size:14px;color:#111;max-width:560px;word-break:keep-all;">
<p style="margin:0 0 14px;font-size:16px;font-weight:700;">워크샵 클래스 신청·결제가 들어왔습니다.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${line("행사", escapeHtml(input.eventTitle))}
${line("주문번호", `<span style="font-family:monospace;">${escapeHtml(input.orderNo)}</span>`)}
${line("신청자", `${escapeHtml(input.customerName)} &lt;${escapeHtml(input.customerEmail)}&gt;`)}
${line("결제", `<strong>${escapeHtml(input.chargedLabel)}</strong> (₩${input.amountKrw.toLocaleString("ko-KR")} 상당)`)}
${line("PG", input.provider === "paypal" ? "PayPal" : "토스페이먼츠")}
</table>
<p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.8;">
신청자 명단은 <a href="https://deetz.kr/admin/workshops/events">행사 관리</a>에서 확인하세요.
</p></div>`;

  await sendGmailEmail({
    to: OPS_TO,
    subject: `[Workshop 신청] ${input.chargedLabel} · ${input.eventTitle} · ${input.customerName}`,
    text: `행사 신청 결제\n${input.eventTitle} / ${input.customerName} <${input.customerEmail}>\n${input.chargedLabel} (${input.provider})`,
    html,
    replyTo: input.customerEmail,
  });
}
