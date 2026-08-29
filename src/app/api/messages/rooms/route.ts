import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";
import { listMemberInboxRooms } from "@/lib/messaging/inbox-query";

// 댄서 메시지함 목록. 30~60초 폴링 + 진입 시 1회.
// 세션 클라이언트 + RLS 로만 읽는다(내부 메모 테이블은 정책상 아예 안 보인다).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  if (!messagingEnabled()) {
    return NextResponse.json({ rooms: [], disabled: true }, { headers: NO_STORE });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ rooms: [] }, { status: 401, headers: NO_STORE });

  const rooms = await listMemberInboxRooms(supabase, user.id);
  return NextResponse.json({ rooms }, { headers: NO_STORE });
}
