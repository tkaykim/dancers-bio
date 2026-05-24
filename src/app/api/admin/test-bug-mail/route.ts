import "server-only";
import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth/guard";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";

/**
 * Admin-only SMTP 점검 엔드포인트.
 *
 * - 응답에 런타임 env presence (값 길이만, 실제 값 절대 노출 X) 포함해서
 *   "키는 등록됐는데 값이 비었나" 판별 가능.
 * - DB 행 만들지 않음 (테스트 노이즈 방지).
 *
 * 보안: profile.is_admin === true 가 아니면 401. 응답 본문은 길이만 노출.
 */
function envDiag() {
  const user = process.env.GMAIL_USER ?? "";
  const pass = process.env.GMAIL_APP_PASSWORD ?? "";
  const fromName = process.env.GMAIL_FROM_NAME ?? "";
  const to = process.env.BUG_REPORT_TO ?? "";
  return {
    GMAIL_USER: { defined: "GMAIL_USER" in process.env, length: user.length },
    GMAIL_APP_PASSWORD: { defined: "GMAIL_APP_PASSWORD" in process.env, length: pass.length },
    GMAIL_FROM_NAME: { defined: "GMAIL_FROM_NAME" in process.env, length: fromName.length },
    BUG_REPORT_TO: { defined: "BUG_REPORT_TO" in process.env, length: to.length },
  };
}

export async function GET() {
  const profile = await getProfile();
  if (!profile || !profile.is_admin) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 401 });
  }

  const env = envDiag();

  const now = new Date();
  const result = await sendBugReportEmail({
    id: `test-${now.toISOString()}`,
    title: "[SMTP 점검] Gmail 전송 테스트",
    description: [
      "이 메일은 /api/admin/test-bug-mail 호출로 보낸 점검 메시지입니다.",
      "수신 확인되면 GMAIL_USER / GMAIL_APP_PASSWORD / BUG_REPORT_TO 가 모두 정상 동작.",
      `호출 admin: ${profile.display_name}`,
    ].join("\n"),
    severity: "low",
    reporter_email: null,
    reporter_role: "admin",
    page_url: "/api/admin/test-bug-mail",
    user_agent: "internal-smtp-check",
    created_at: now.toISOString(),
  });

  return NextResponse.json({
    ok: result.ok,
    error: result.error ?? null,
    env,
  });
}

export const POST = GET;
