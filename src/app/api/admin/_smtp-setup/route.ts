import "server-only";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 일회용 셋업 엔드포인트.
 * Vercel 런타임에 주입된 GMAIL_APP_PASSWORD 를 읽어 Supabase Auth 의
 * 커스텀 SMTP 설정에 그대로 반영한다. (비밀번호가 외부로 노출되지 않음)
 *
 * 안전장치:
 *  - 대상 Supabase 프로젝트 ref 를 하드코딩 → 비밀번호가 다른 프로젝트로 새지 않음
 *  - 호출 시 Supabase Management PAT 를 body 로 요구 (소유자만 보유)
 *  - 작업 완료 후 이 파일은 삭제한다.
 */
const PROJECT_REF = "wvfmqiajdvbsevlhlgtl";

export async function POST(req: NextRequest) {
  let body: { pat?: string } = {};
  try {
    body = (await req.json()) as { pat?: string };
  } catch {
    // ignore
  }
  const pat = body.pat;
  if (!pat || !pat.startsWith("sbp_")) {
    return NextResponse.json(
      { ok: false, error: "management PAT required" },
      { status: 401 },
    );
  }

  const user = process.env.GMAIL_USER || "dancers.bio.kr@gmail.com";
  const pass = process.env.GMAIL_APP_PASSWORD || "";
  const senderName = process.env.GMAIL_FROM_NAME || "dancers.bio";
  if (!pass) {
    return NextResponse.json(
      { ok: false, error: "GMAIL_APP_PASSWORD not present in runtime env", user_len: user.length },
      { status: 500 },
    );
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        smtp_host: "smtp.gmail.com",
        smtp_port: "465",
        smtp_user: user,
        smtp_pass: pass,
        smtp_admin_email: user,
        smtp_sender_name: senderName,
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    smtp_host: data?.smtp_host ?? null,
    smtp_user: data?.smtp_user ?? null,
    smtp_sender_name: data?.smtp_sender_name ?? null,
    pass_len: pass.length,
  });
}
