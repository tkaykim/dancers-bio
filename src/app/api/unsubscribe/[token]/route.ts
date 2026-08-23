import { NextResponse, type NextRequest } from "next/server";

import { setUnsubscribeByToken } from "@/lib/notify/notification-preferences";
import { unsubscribeUrl } from "@/lib/notify/list-unsubscribe.mjs";

/**
 * 원클릭 수신거부 엔드포인트 (RFC 8058).
 *
 * 안내성 메일 헤더가 가리키는 주소는 `https://www.deetz.kr/unsubscribe/<token>` 이다.
 * 그 경로에는 이미 확인 버튼이 있는 page.tsx 가 있고, App Router 는 같은 세그먼트에
 * page 와 route 를 동시에 둘 수 없다. 그래서 middleware 가 **POST 일 때만**
 * 이 API 라우트로 rewrite 한다 (src/middleware.ts).
 *
 *   GET  /unsubscribe/<token> → page.tsx (사람이 버튼을 눌러 확정)
 *   POST /unsubscribe/<token> → 여기 (Gmail/Outlook 의 원클릭 해지)
 *
 * 메일 스캐너의 링크 프리페치는 GET 이라 여기 오지 않는다 = 본인 의사 없이 해지되지 않는다.
 * 반대로 원클릭은 수신자가 명시적으로 누른 것이므로 확인 화면 없이 즉시 반영한다.
 */

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const prefs = await setUnsubscribeByToken(token, true);

  // 토큰이 틀려도 200 을 준다. 4xx 를 주면 메일 클라이언트가 "해지 실패" 를 띄우는데,
  // 수신자가 할 수 있는 일이 없고 재시도만 유발한다. 유효한 토큰만 실제로 반영된다.
  return new NextResponse(prefs ? "unsubscribed" : "ok", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// 직접 API 주소로 들어온 GET 은 사람이 보는 확인 페이지로 보낸다.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  return NextResponse.redirect(unsubscribeUrl(token), 302);
}
