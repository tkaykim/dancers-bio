import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cancelPendingRoomJobs } from "./jobs";
import type { ChatRoomRow, RoomActor } from "./types";

// 읽음 = 워터마크 하나(member: last_read_seq / staff: rooms.staff_last_read_seq).
// 미읽음 수는 항상 워터마크 대비 재계산한다 — 증분 카운터는 만들지 않는다(드리프트 방지).

export async function markRead(
  room: ChatRoomRow,
  actor: RoomActor,
  upToSeqRaw: number,
): Promise<void> {
  const admin = createAdminClient();
  const upToSeq = Math.max(0, Math.min(Math.floor(upToSeqRaw), Number(room.last_seq)));
  if (upToSeq <= 0) return;

  if (actor.role === "member") {
    await admin
      .from("chat_room_members")
      .update({ last_read_seq: upToSeq })
      .eq("room_id", room.id)
      .eq("dancer_id", actor.dancerId)
      .lt("last_read_seq", upToSeq);

    // 읽었으면 미읽음 메일 에피소드는 소멸 — 해당 시퀀스 이하에서 시작한 잡만 취소.
    await cancelPendingRoomJobs(room.id, ["unread_mail"], (job) => {
      const first = Number((job.payload as { firstUnreadSeq?: number }).firstUnreadSeq ?? 0);
      return first > 0 && first <= upToSeq;
    });
  } else {
    // 공동 인박스 — 팀 단위 읽음(스태프 개인별 워터마크는 두지 않는다).
    // 주의: 스태프의 "읽음"은 미답변(awaiting_staff_since)을 해제하지 않는다 — 답장·처리 완료만 해제한다.
    await admin
      .from("chat_rooms")
      .update({ staff_last_read_seq: upToSeq })
      .eq("id", room.id)
      .lt("staff_last_read_seq", upToSeq);
  }
}
