import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

interface SendGmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.error("[gmail] GMAIL_USER or GMAIL_APP_PASSWORD env missing");
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
  const fromName = process.env.GMAIL_FROM_NAME || "dancers.bio";
  const fromEmail = process.env.GMAIL_USER!;
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
