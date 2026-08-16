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
