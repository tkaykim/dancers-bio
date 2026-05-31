import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getProfile } from "@/lib/auth/guard";
import { sendBugReportEmail } from "@/lib/notify/bug-mail";
import { sendGmailEmail } from "@/lib/gmail";

/**
 * SMTP 점검 엔드포인트.
 *
 * 두 가지 인증:
 *  1) admin 쿠키 세션
 *  2) ?token=<SMTP_DIAG_TOKEN env 일치> — env 없으면 우회 비활성
 *
 * 옵션:
 *  - ?to=<email> 지정 시 BUG_REPORT_TO 대신 그 주소로 송신 (admin/token 필요)
 *  - 기본은 sendBugReportEmail 경로 (BUG_REPORT_TO)
 *
 * 응답: { ok, error, env, caller, sentTo? }
 * DB 행 만들지 않음.
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
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.SMTP_DIAG_TOKEN;
  if (token && expected && token === expected) return { caller: "diag-token" };
  const profile = await getProfile();
  if (profile?.is_admin) return { caller: `admin:${profile.display_name ?? "?"}` };
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handle(req: NextRequest) {
  const auth = await authorized(req);
  if (!auth) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const toOverride = url.searchParams.get("to");
  const env = envDiag();
  const now = new Date();

  if (toOverride) {
    if (!EMAIL_RE.test(toOverride)) {
      return NextResponse.json(
        { ok: false, error: "invalid to-email", env, caller: auth.caller },
        { status: 400 },
      );
    }
    // 임의 주소로 직접 전송. sendBugReportEmail 의 BUG_REPORT_TO 우회.
    const result = await sendGmailEmail({
      to: toOverride,
      subject: "[deetz SMTP 점검] 테스트 메일",
      text: [
        "이 메일은 deetz 의 SMTP 점검용 테스트 메시지입니다.",
        "수신 확인되면 GMAIL_USER / GMAIL_APP_PASSWORD 가 정상 동작.",
        `호출자: ${auth.caller}`,
        `발송 시각: ${now.toISOString()}`,
      ].join("\n"),
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#fff;color:#222;">
        <h1 style="margin:0 0 12px;font-size:18px;color:#18181b;">📬 deetz SMTP 점검</h1>
        <p style="font-size:14px;line-height:1.7;color:#3f3f46;">
          이 메일은 deetz 의 Gmail SMTP 가 정상 동작하는지 확인하기 위한 테스트 메시지입니다.<br/>
          수신 확인되면 <code>GMAIL_USER</code> / <code>GMAIL_APP_PASSWORD</code> 가 모두 정상.
        </p>
        <div style="margin-top:16px;padding:12px 16px;background:#fafafa;border-left:4px solid #18181b;border-radius:0 8px 8px 0;font-size:13px;color:#3f3f46;">
          호출자: <b>${auth.caller}</b><br/>
          발송 시각: ${now.toISOString()}
        </div>
        <p style="margin-top:24px;font-size:11px;color:#a1a1aa;text-align:center;">
          deetz SMTP 점검 시스템
        </p>
      </div>`,
    });
    return NextResponse.json({
      ok: result.ok,
      error: result.error ?? null,
      env,
      caller: auth.caller,
      sentTo: toOverride,
    });
  }

  // 기본 경로: BUG_REPORT_TO 로 sendBugReportEmail
  const result = await sendBugReportEmail({
    id: `test-${now.toISOString()}`,
    title: "[SMTP 점검] deetz Gmail 전송 테스트",
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
