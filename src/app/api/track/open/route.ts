import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 이메일 열람 추적 픽셀.
 *   GET /api/track/open?c=<campaign>&e=<base64url(email)>&s=<hmac>
 * - s = base64url(HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, `${c}|${email}`))
 *   → 위·변조/스팸 차단. 발신측(워커)이 동일 키로 서명.
 * - 서명 일치 시 email_opens 에 1행 적재(append). 항상 1x1 투명 GIF 반환.
 * - 캐시 금지(Gmail 등 프록시 캐싱 영향 최소화).
 *
 * 한계(정직): 수신자가 이미지를 차단하면 신호 없음. Gmail 이미지 프록시는
 * 첫 렌더 시 1회 히트가 일반적이라 "열었다"의 근사치로 유효하나 100%는 아님.
 */

// 투명 1x1 GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixelResponse() {
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

function b64urlToString(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export async function GET(req: NextRequest) {
  // 어떤 경우에도 픽셀은 반환. 검증 실패/오류 시 적재만 생략.
  try {
    const sp = req.nextUrl.searchParams;
    const c = sp.get("c");
    const e = sp.get("e");
    const s = sp.get("s");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!c || !e || !s || !key) return pixelResponse();

    const email = b64urlToString(e);
    const expected = sign(`${c}|${email}`, key);
    const a = Buffer.from(s);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return pixelResponse();

    const ua = req.headers.get("user-agent") ?? null;
    const ref = req.headers.get("referer") ?? null;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    // 비차단: 적재 실패해도 픽셀은 그대로 반환
    try {
      const admin = createAdminClient();
      await admin.from("email_opens").insert({
        campaign: c,
        recipient_email: email,
        user_agent: ua,
        ip,
        referer: ref,
      });
    } catch {
      // swallow — 추적 실패가 픽셀 응답을 막지 않음
    }
  } catch {
    // ignore
  }
  return pixelResponse();
}
