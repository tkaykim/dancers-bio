import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";

// 전역 안읽음 뱃지(댄서 좌석 기준). 60초 폴링용 — 페이로드 최소.
// 조회는 세션 클라이언트 + RLS — member 경로에 admin client 를 쓰지 않는다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  if (!messagingEnabled()) {
    return NextResponse.json({ unread: 0, disabled: true }, { headers: NO_STORE });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ unread: 0 }, { status: 401, headers: NO_STORE });

  // 내 댄서 좌석(본인 클레임 + 매니저 위임)만 집계한다 — 운영자 좌석의 미답변은 별개 화면.
  const { data: mine } = await supabase.from("dancers").select("id").eq("profile_id", user.id);
  const { data: managed } = await supabase
    .from("dancer_managers")
    .select("dancer_id")
    .eq("manager_id", user.id);
  const dancerIds = [
    ...new Set([
      ...(mine ?? []).map((d) => d.id as string),
      ...(managed ?? []).map((d) => d.dancer_id as string),
    ]),
  ];
  if (dancerIds.length === 0) {
    return NextResponse.json({ unread: 0 }, { headers: NO_STORE });
  }

  const { data: seats } = await supabase
    .from("chat_room_members")
    .select("room_id, last_read_seq, room:chat_rooms!inner(id, last_seq, archived_at)")
    .in("dancer_id", dancerIds)
    .is("removed_at", null);

  let unread = 0;
  for (const seat of seats ?? []) {
    const room = Array.isArray(seat.room) ? seat.room[0] : seat.room;
    if (!room || room.archived_at) continue;
    unread += Math.max(0, Number(room.last_seq) - Number(seat.last_read_seq));
  }
  return NextResponse.json({ unread: Math.min(unread, 999) }, { headers: NO_STORE });
}
