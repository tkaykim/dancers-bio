import { NextRequest, NextResponse } from "next/server";
import { processDueJobs } from "@/lib/messaging/jobs";
import { messageJobHandlers } from "@/lib/messaging/handlers";
import { messagingEnabled } from "@/lib/messaging/flags";
import { cleanupRateBuckets } from "@/lib/messaging/rate-limit";

// 메시지 센터 지연 발송 스위퍼. Vercel Cron 이 1분 주기로 호출한다(vercel.json).
//
// Vercel Cron 은 중복 호출·누락·중첩 실행이 정상 스펙이다 — 잡 선점은
// claim_message_jobs(FOR UPDATE SKIP LOCKED)가, 중복 발송은 idem_key 와
// claim-then-send 가 막는다. 누락된 턴은 다음 턴이 "밀린 잡 전부"를 집어
// 자동 복구한다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // CRON_SECRET 이 설정돼 있으면 Vercel 이 Authorization 헤더를 자동으로 붙인다.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!messagingEnabled()) {
    return NextResponse.json({ ok: true, skipped: "messaging_disabled" });
  }

  const result = await processDueJobs(messageJobHandlers, 25);
  await cleanupRateBuckets();
  return NextResponse.json({ ok: true, ...result });
}
