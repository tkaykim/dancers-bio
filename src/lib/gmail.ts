import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// deetz 전역 표준 발신 표시 이름 (2026-07-01 확정).
// env(GMAIL_FROM_NAME)에 옛 값이 남아 있어도 앱 발신은 항상 이 이름으로 통일.
export const DEETZ_FROM_NAME = "deetz 에이전시 & 매거진";

interface SendGmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

let _transporter: Transporter | null = null;

// deetz 공식 도메인 메일함(Google Workspace, contact@deetz.kr)에서 발신하는 것이 정본이다.
// 옛 개인 Gmail 계정(GMAIL_USER)은 DEETZ_GMAIL_* 가 비어 있을 때만 쓰이는 폴백이다.
export function senderAddress(): string {
  return process.env.DEETZ_GMAIL_USER || process.env.GMAIL_USER || "contact@deetz.kr";
}

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const user = process.env.DEETZ_GMAIL_USER || process.env.GMAIL_USER;
  const pass = process.env.DEETZ_GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error("[gmail] DEETZ_GMAIL_USER/GMAIL_USER or app password env missing");
    return null;
  }
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return _transporter;
}

export async function sendGmailEmail({
  to,
  subject,
  text,
  html,
  replyTo,
}: SendGmailParams): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "transporter_unavailable" };
  const fromName = DEETZ_FROM_NAME;
  const fromEmail = senderAddress();
  try {
    await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
      replyTo,
    });
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error("[gmail] sendMail failed:", msg);
    return { ok: false, error: msg.slice(0, 500) };
  }
}
