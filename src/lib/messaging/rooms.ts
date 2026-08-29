import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatRoomRow } from "./types";

// 직접방 = (project_id, direct_dancer_id) 유일 — 보관 여부와 무관.
// 재지원·재제안이 와도 같은 방을 재활성화해 대화가 파편화되지 않게 한다.

const ROOM_COLS =
  "id, project_id, kind, direct_dancer_id, title, last_seq, staff_last_read_seq, awaiting_staff_since, resolved_at, closed_at, last_message_at, archived_at";

export async function getOrCreateDirectRoom(
  projectId: string,
  dancerId: string,
): Promise<{ ok: true; room: ChatRoomRow; memberUserId: string | null } | { ok: false; error: string }> {
  const admin = createAdminClient();

  const { data: dancer } = await admin
    .from("dancers")
    .select("id, profile_id")
    .eq("id", dancerId)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "댄서를 찾을 수 없습니다." };
  const memberUserId = (dancer.profile_id as string | null) ?? null;

  const { data: existing } = await admin
    .from("chat_rooms")
    .select(ROOM_COLS)
    .eq("project_id", projectId)
    .eq("kind", "direct")
    .eq("direct_dancer_id", dancerId)
    .maybeSingle();

  let room = existing as ChatRoomRow | null;

  if (room) {
    if (room.archived_at) {
      await admin
        .from("chat_rooms")
        .update({ archived_at: null, updated_at: new Date().toISOString() })
        .eq("id", room.id);
      room = { ...room, archived_at: null };
    }
  } else {
    const { data: created, error } = await admin
      .from("chat_rooms")
      .insert({ project_id: projectId, kind: "direct", direct_dancer_id: dancerId })
      .select(ROOM_COLS)
      .single();
    if (error) {
      // 동시 생성 경합(23505) — 유니크가 지켜줬으니 다시 읽는다.
      if (error.code === "23505") {
        const { data: raced } = await admin
          .from("chat_rooms")
          .select(ROOM_COLS)
          .eq("project_id", projectId)
          .eq("kind", "direct")
          .eq("direct_dancer_id", dancerId)
          .maybeSingle();
        room = (raced as ChatRoomRow | null) ?? null;
      }
      if (!room) return { ok: false, error: "대화방 생성에 실패했습니다." };
    } else {
      room = created as ChatRoomRow;
    }
  }

  // 댄서 좌석 보장(upsert). user_id 는 현재 클레임 계정 — 클레임이 나중에 바뀌면 다음 보장 때 갱신된다.
  await admin.from("chat_room_members").upsert(
    {
      room_id: room.id,
      dancer_id: dancerId,
      user_id: memberUserId,
      removed_at: null,
    },
    { onConflict: "room_id,dancer_id" },
  );

  return { ok: true, room, memberUserId };
}

/** 방의 댄서 좌석(읽음 워터마크 포함). */
export async function getMemberSeat(roomId: string, dancerId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("chat_room_members")
    .select("room_id, dancer_id, user_id, last_read_seq, muted_until, removed_at")
    .eq("room_id", roomId)
    .eq("dancer_id", dancerId)
    .maybeSingle();
  return data as
    | {
        room_id: string;
        dancer_id: string;
        user_id: string | null;
        last_read_seq: number;
        muted_until: string | null;
        removed_at: string | null;
      }
    | null;
}

/** 프로젝트의 운영팀 수신자(소유자+공동관리자) user id 목록. */
export async function listProjectStaffUserIds(projectId: string): Promise<string[]> {
  const admin = createAdminClient();
  const ids = new Set<string>();
  const { data: project } = await admin
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (project?.owner_id) ids.add(project.owner_id as string);
  const { data: managers } = await admin
    .from("project_managers")
    .select("profile_id")
    .eq("project_id", projectId);
  for (const m of managers ?? []) {
    if (m.profile_id) ids.add(m.profile_id as string);
  }
  return [...ids];
}

/** 댄서 좌석의 수신 계정들(클레임 계정 + 매니저). 알림 fan-out 용. */
export async function listDancerActorUserIds(dancerId: string): Promise<string[]> {
  const admin = createAdminClient();
  const ids = new Set<string>();
  const { data: dancer } = await admin
    .from("dancers")
    .select("profile_id")
    .eq("id", dancerId)
    .maybeSingle();
  if (dancer?.profile_id) ids.add(dancer.profile_id as string);
  const { data: managers } = await admin
    .from("dancer_managers")
    .select("manager_id")
    .eq("dancer_id", dancerId);
  for (const m of managers ?? []) {
    if (m.manager_id) ids.add(m.manager_id as string);
  }
  return [...ids];
}
