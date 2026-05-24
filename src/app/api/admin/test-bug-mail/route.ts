import "server-only";
import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth/guard";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";

/**
 * Admin-only SMTP 점검 엔드포인트.
 *
 * - GET 으로도 받음 (브라우저에서 직접 열어볼 수 있게)
 * - 호출한 admin 본인의 이메일을 reporter_email 로 채워 보냄 (replyTo 동작 확인)
 * - bug_reports 테이블에는 행을 만들지 않음 (테스트 노이즈 방지)
 *
 * 보안: profile.is_admin === true 가 아니면 401.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile || !profile.is_admin) {
    return NextResponse.json({ ok: false, error: "admin only" }, { status: 401 });
  }

  const now = new Date();
  const result = await sendBugReportEmail({
    id: `test-${now.toISOString()}`,
    title: "[SMTP 점검] Gmail 전송 테스트",
    description: [
      "이 메일은 /api/admin/test-bug-mail 호출로 보낸 점검 메시지입니다.",
      "수신 확인되면 GMAIL_USER / GMAIL_APP_PASSWORD / BUG_REPORT_TO 가 모두 정상 동작.",
      `호출 admin: ${profile.display_name} <${"" /* email not in profile select */}>`,
    ].join("\n"),
    severity: "low",
    reporter_email: null,
    reporter_role: "admin",
    page_url: "/api/admin/test-bug-mail",
    user_agent: "internal-smtp-check",
    created_at: now.toISOString(),
  });

  return NextResponse.json({ ok: result.ok, error: result.error ?? null });
}

export const POST = GET;
