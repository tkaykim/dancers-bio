import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth/guard";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";

/**
 * SMTP 점검 엔드포인트.
 *
 * 두 가지 인증 경로:
 *  1) admin 쿠키 세션 (profile.is_admin === true)
 *  2) ?token=<SMTP_DIAG_TOKEN env 와 일치> — Vercel env 에 SMTP_DIAG_TOKEN 이
 *     세팅돼 있을 때만 활성. 진단 끝나면 env 제거하면 자동 비활성.
 *
 * 응답: { ok, error, env: { ...keys, length } } — 값은 절대 노출 안 함.
 * DB 행 만들지 않음 (노이즈 방지).
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

async function authorized(req: NextRequest): Promise<{ caller: string } | null> {
  // 1) token 우회
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.SMTP_DIAG_TOKEN;
  if (token && expected && token === expected) {
    return { caller: "diag-token" };
  }
  // 2) admin 쿠키
  const profile = await getProfile();
  if (profile?.is_admin) {
    return { caller: `admin:${profile.display_name ?? "?"}` };
  }
  return null;
}

async function handle(req: NextRequest) {
  const auth = await authorized(req);
  if (!auth) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const env = envDiag();

  const now = new Date();
  const result = await sendBugReportEmail({
    id: `test-${now.toISOString()}`,
    title: "[SMTP 점검] dancers.bio Gmail 전송 테스트",
    description: [
      "이 메일은 /api/admin/test-bug-mail 호출로 보낸 점검 메시지입니다.",
      "수신 확인되면 GMAIL_USER / GMAIL_APP_PASSWORD / BUG_REPORT_TO 가 모두 정상 동작.",
      `호출자: ${auth.caller}`,
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
    caller: auth.caller,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
