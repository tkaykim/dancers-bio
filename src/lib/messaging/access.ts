import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ChatRoomRow, RoomActor } from "./types";

// 서버 액션은 자동 노출되는 POST 엔드포인트고, service-role 은 RLS 를 우회한다.
// 그래서 쓰기 경로의 유일한 방어선은 이 가드들이다 — 클라이언트가 준
// room_id·message_id 는 반드시 여기를 통과한 뒤에만 사용한다.
// (읽기 경로는 원칙적으로 세션 클라이언트 + RLS 를 쓴다.)

export type RoomAccess =
  | { ok: true; actor: RoomActor; room: ChatRoomRow }
  | { ok: false; error: string };

const ROOM_COLS =
  "id, project_id, kind, direct_dancer_id, title, last_seq, staff_last_read_seq, awaiting_staff_since, resolved_at, closed_at, last_message_at, archived_at";

/** 방 존재 + 요청자의 좌석(staff/member) 판정. */
export async function resolveRoomActor(userId: string, roomId: string): Promise<RoomAccess> {
  if (!roomId || typeof roomId !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const admin = createAdminClient();
  const { data: room } = await admin
    .from("chat_rooms")
    .select(ROOM_COLS)
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return { ok: false, error: "대화방을 찾을 수 없습니다." };

  const supabase = await createClient();
  // can_manage_project = 소유자 OR 공동관리자 OR is_admin (DB SECURITY DEFINER).
  const { data: canManage } = await supabase.rpc("can_manage_project", {
    p_id: room.project_id,
  });
  if (canManage === true) {
    return { ok: true, actor: { role: "staff", userId }, room: room as ChatRoomRow };
  }

  if (room.kind === "direct" && room.direct_dancer_id) {
    const { data: canAct } = await supabase.rpc("can_act_as_dancer", {
      d_id: room.direct_dancer_id,
    });
    if (canAct === true) {
      return {
        ok: true,
        actor: { role: "member", userId, dancerId: room.direct_dancer_id as string },
        room: room as ChatRoomRow,
      };
    }
  }
  return { ok: false, error: "이 대화방에 접근할 수 없습니다." };
}

/** 프로젝트 운영자 게이트(방 없이 — 캠페인·인박스). */
export async function assertProjectManageAccess(projectId: string): Promise<boolean> {
  if (!projectId) return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_manage_project", { p_id: projectId });
  return data === true;
}
