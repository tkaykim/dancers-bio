import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 전송 rate limit — DB 원자 버킷(bump_rate_bucket upsert RETURNING).
// COUNT-후-INSERT 는 동시 요청에 뚫리므로 반드시 이 경로를 쓴다.

const USER_PER_MIN = 20;
const ROOM_PER_MIN = 10;

export async function checkSendRateLimit(
  userId: string,
  roomId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const minute = Math.floor(Date.now() / 60_000);
  try {
    const { data: userCount } = await admin.rpc("bump_rate_bucket", {
      p_key: `u:${userId}:${minute}`,
    });
    if (typeof userCount === "number" && userCount > USER_PER_MIN) {
      return "메시지를 너무 자주 보내고 있습니다. 잠시 후 다시 시도해 주세요.";
    }
    const { data: roomCount } = await admin.rpc("bump_rate_bucket", {
      p_key: `r:${roomId}:${userId}:${minute}`,
    });
    if (typeof roomCount === "number" && roomCount > ROOM_PER_MIN) {
      return "이 대화방에 메시지를 너무 자주 보내고 있습니다. 잠시 후 다시 시도해 주세요.";
    }
  } catch {
    // rate limit 인프라 오류로 전송 자체를 막지는 않는다(가용성 우선).
    return null;
  }
  return null;
}

/** 오래된 버킷 청소(크론에서 호출). 버킷 키는 분 단위라 1시간이면 충분히 지났다. */
export async function cleanupRateBuckets(): Promise<void> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 60 * 60_000).toISOString();
  await admin.from("message_rate_buckets").delete().lt("created_at", cutoff);
}
