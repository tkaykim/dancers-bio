import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";

// 대화방 증분 조회(after_seq 커서). 활성 화면 5~10초 폴링.
// 세션 클라이언트 + RLS — 당사자·운영자만 통과한다(정책이 게이트).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  if (!messagingEnabled()) {
    return NextResponse.json({ messages: [], disabled: true }, { headers: NO_STORE });
  }
  const { roomId } = await params;
  const afterSeq = Math.max(0, Number(request.nextUrl.searchParams.get("after_seq") ?? "0") || 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ messages: [] }, { status: 401, headers: NO_STORE });

  // RLS 가 방 접근을 판정한다 — 권한 없는 방은 room=null 로 끝난다(404와 동일 취급).
  const { data: room } = await supabase
    .from("chat_rooms")
    .select("id, project_id, direct_dancer_id, last_seq, staff_last_read_seq, closed_at, resolved_at, awaiting_staff_since")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return NextResponse.json({ messages: [] }, { status: 404, headers: NO_STORE });

  const { data: messages } = await supabase
    .from("chat_messages")
    .select(
      "id, room_id, room_seq, sender_user_id, sender_role, kind, body, action, deleted_at, created_at",
    )
    .eq("room_id", roomId)
    .gt("room_seq", afterSeq)
    .order("room_seq", { ascending: true })
    .limit(100);

  // 내(들)의 응답 상태 — action_request 카드 렌더용.
  const actionIds = (messages ?? [])
    .filter((m) => m.kind === "action_request")
    .map((m) => m.id as string);
  let responses: Array<{ message_id: string; dancer_id: string; choice: string; detail: string | null }> = [];
  if (actionIds.length > 0) {
    const { data: resp } = await supabase
      .from("chat_message_responses")
      .select("message_id, dancer_id, choice, detail")
      .in("message_id", actionIds);
    responses = (resp ?? []) as typeof responses;
  }

  // 내부 메모 — RLS 가 스태프에게만 돌려준다(멤버는 항상 빈 배열).
  const { data: notes } = await supabase
    .from("chat_internal_notes")
    .select("id, author_user_id, body, created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })
    .limit(100);

  // 댄서 좌석 읽음(운영자 화면의 "읽음" 표시용). RLS: 당사자와 운영자만 조회 가능.
  let memberReadSeq: number | null = null;
  if (room.direct_dancer_id) {
    const { data: seat } = await supabase
      .from("chat_room_members")
      .select("last_read_seq")
      .eq("room_id", roomId)
      .eq("dancer_id", room.direct_dancer_id)
      .maybeSingle();
    if (seat) memberReadSeq = Number(seat.last_read_seq);
  }

  return NextResponse.json(
    {
      room: {
        id: room.id,
        lastSeq: Number(room.last_seq),
        staffLastReadSeq: Number(room.staff_last_read_seq),
        memberReadSeq,
        closed: !!room.closed_at,
        resolved: !!room.resolved_at,
        awaitingSince: room.awaiting_staff_since,
      },
      messages: (messages ?? []).map((m) => ({
        ...m,
        body: m.deleted_at ? "" : m.body,
      })),
      responses,
      notes: notes ?? [],
    },
    { headers: NO_STORE },
  );
}
