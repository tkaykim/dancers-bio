import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

import { listUnsubscribeHeaders } from "@/lib/notify/list-unsubscribe.mjs";

// deetz 전역 표준 발신 표시 이름 (2026-07-01 확정).
// env(GMAIL_FROM_NAME)에 옛 값이 남아 있어도 앱 발신은 항상 이 이름으로 통일.
export const DEETZ_FROM_NAME = "deetz 에이전시 & 매거진";

interface SendGmailParams {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  messageId?: string;
  /**
   * 안내성(bulk) 메일이면 true — List-Unsubscribe(+원클릭) 헤더가 붙는다.
   *
   * 거래성(transactional) 메일에는 **붙이지 않는다.** 결제 영수증·비자 미팅 확정·
   * 지원 결과·버그 리포트처럼 수신자가 직접 일으킨 1건의 결과 통지는 수신거부 대상이 아니고,
   * 거기에 수신거부를 달면 필수 안내까지 끊긴다. 판단 근거는 docs/EMAIL_DELIVERABILITY.md.
   */
  bulk?: boolean;
  /**
   * notification_preferences.unsubscribe_token.
   * bulk 일 때만 의미가 있다. 없으면 mailto 수신거부만 붙는다(원클릭은 선언하지 않음).
   */
  unsubscribeToken?: string | null;
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
  // ⚠ 풀링이 없으면 sendMail 마다 SMTP 연결을 새로 열고 AUTH 를 다시 한다.
  // 일괄 발송에서 수십~수백 번 로그인하면 Gmail 이 "too many login attempts" 로 잠근다.
  // pool 로 인증된 연결을 재사용하고, 초당 발송량도 제한한다.
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    pool: true,
    maxConnections: 1, // 연결 1개만 유지 = 로그인 1회
    maxMessages: 100, // 100통마다 연결 재생성(장시간 유휴 소켓 방지)
    rateDelta: 1000,
    rateLimit: 3, // 초당 3통
  });
  return _transporter;
}

// 일괄 발송이 끝나면 유휴 소켓을 닫는다. 서버리스에서 열린 채 남지 않게.
export function closeGmailPool(): void {
  if (!_transporter) return;
  try {
    _transporter.close();
  } catch {
    // 닫기 실패는 무시 — 다음 호출에서 새 트랜스포터를 만든다.
  }
  _transporter = null;
}

// 재시도해도 소용없고 즉시 멈춰야 하는 오류인지. 인증 잠김·발송 한도 초과 등.
// 이런 상태에서 계속 시도하면 계정이 더 오래 잠긴다.
export function isFatalSmtpError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("invalid login") ||
    m.includes("username and password not accepted") ||
    m.includes("eauth") ||
    m.includes("too many login") ||
    m.includes("daily user sending limit") ||
    m.includes("rate exceeded") ||
    m.includes("4.7.0") || // 임시 차단
    m.includes("5.4.5") // 발송 한도
  );
}

export async function sendGmailEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  messageId,
  bulk,
  unsubscribeToken,
}: SendGmailParams): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, error: "transporter_unavailable" };
  const fromName = DEETZ_FROM_NAME;
  const fromEmail = senderAddress();
  try {
    const info = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
      html,
      replyTo,
      messageId,
      headers: bulk ? listUnsubscribeHeaders(unsubscribeToken) : undefined,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error("[gmail] sendMail failed:", msg);
    return { ok: false, error: msg.slice(0, 500) };
  }
}
