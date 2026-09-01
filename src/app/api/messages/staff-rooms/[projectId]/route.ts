import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";
import { previewText } from "@/lib/messaging/types";

// 운영자 인박스의 스레드 목록. 세션 클라이언트 + RLS(운영자는 프로젝트 전체 방을 본다).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export type StaffRoom = {
  roomId: string;
  dancerId: string | null;
  dancerName: string;
  lastSeq: number;
  staffUnread: number;
  awaitingSince: string | null;
  resolved: boolean;
  closed: boolean;
  lastMessageAt: string | null;
  lastPreview: string;
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  if (!messagingEnabled()) {
    return NextResponse.json({ rooms: [], disabled: true }, { headers: NO_STORE });
  }
  const { projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ rooms: [] }, { status: 401, headers: NO_STORE });

  const { data: rows } = await supabase
    .from("chat_rooms")
    .select(
      "id, direct_dancer_id, last_seq, staff_last_read_seq, awaiting_staff_since, resolved_at, closed_at, last_message_at",
    )
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(300);

  type Row = {
    id: string;
    direct_dancer_id: string | null;
    last_seq: number;
    staff_last_read_seq: number;
    awaiting_staff_since: string | null;
    resolved_at: string | null;
    closed_at: string | null;
    last_message_at: string | null;
  };

  const list = ((rows ?? []) as unknown as Row[]).filter((r) => Number(r.last_seq) > 0);

  // 댄서 이름은 admin client 로 붙인다 — dancers 테이블 RLS 가 승인 전(pending) 댄서를
  // 비admin 매니저 세션에 숨겨 세션 조인이 "(이름 없음)"으로 비던 결함의 수정.
  // 방 접근 자체는 위 세션 조회(RLS)가 이미 판정했으므로 이름 노출은 안전하다.
  const nameByDancer = new Map<string, string>();
  const dancerIds = [...new Set(list.map((r) => r.direct_dancer_id).filter(Boolean))] as string[];
  if (dancerIds.length > 0) {
    const admin = createAdminClient();
    const { data: dancers } = await admin
      .from("dancers")
      .select("id, stage_name")
      .in("id", dancerIds);
    for (const d of dancers ?? []) {
      if (d.stage_name) nameByDancer.set(d.id as string, d.stage_name as string);
    }
  }

  // 미리보기는 최근 30개 방만(폴링 비용 절제).
  const previews = new Map<string, string>();
  await Promise.all(
    list.slice(0, 30).map(async (r) => {
      const { data: msg } = await supabase
        .from("chat_messages")
        .select("body, kind, deleted_at")
        .eq("room_id", r.id)
        .eq("room_seq", Number(r.last_seq))
        .maybeSingle();
      if (msg) {
        previews.set(
          r.id,
          msg.deleted_at ? "삭제된 메시지" : previewText((msg.body as string) ?? "", 50),
        );
      }
    }),
  );

  const result: StaffRoom[] = list.map((r) => {
    return {
      roomId: r.id,
      dancerId: r.direct_dancer_id,
      dancerName: (r.direct_dancer_id && nameByDancer.get(r.direct_dancer_id)) || "(이름 없음)",
      lastSeq: Number(r.last_seq),
      staffUnread: Math.max(0, Number(r.last_seq) - Number(r.staff_last_read_seq)),
      awaitingSince: r.awaiting_staff_since,
      resolved: !!r.resolved_at,
      closed: !!r.closed_at,
      lastMessageAt: r.last_message_at,
      lastPreview: previews.get(r.id) ?? "",
    };
  });

  return NextResponse.json({ rooms: result }, { headers: NO_STORE });
}
