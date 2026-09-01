import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { messagingExternalEnabled } from "./flags";
import {
  getMemberSeat,
  listDancerActorUserIds,
  listProjectStaffUserIds,
} from "./rooms";
import { enqueueJob, cancelPendingRoomJobs } from "./jobs";
import {
  previewText,
  unreadMailIdemKey,
  type ChatMessageRow,
  type ChatRoomRow,
  type MessageAction,
  type RoomActor,
} from "./types";

const MSG_COLS =
  "id, room_id, room_seq, sender_user_id, sender_role, kind, body, application_id, action, deleted_at, created_at";

// (project, dancer)의 현재 지원서 — 메시지에 당시 맥락으로 고정 기록한다.
async function latestApplicationId(projectId: string, dancerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("applications")
    .select("id")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * 저수준 insert(멱등) — 직접 전송과 캠페인 fan-out 이 함께 쓴다.
 * client_message_id 유니크 충돌이면 기존 행을 반환한다(더블클릭·재시도 안전).
 */
export async function insertChatMessage(params: {
  roomId: string;
  senderUserId: string | null;
  senderRole: "team" | "member" | "system";
  kind: "text" | "notice" | "action_request" | "system";
  body: string;
  action?: MessageAction | null;
  clientMessageId?: string | null;
  applicationId?: string | null;
}): Promise<{ ok: true; message: ChatMessageRow; duplicated: boolean } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_messages")
    .insert({
      room_id: params.roomId,
      sender_user_id: params.senderUserId,
      sender_role: params.senderRole,
      kind: params.kind,
      body: params.body,
      action: params.action ?? null,
      client_message_id: params.clientMessageId ?? null,
      application_id: params.applicationId ?? null,
    })
    .select(MSG_COLS)
    .single();

  if (!error) return { ok: true, message: data as ChatMessageRow, duplicated: false };

  if (error.code === "23505" && params.clientMessageId) {
    const { data: existing } = await admin
      .from("chat_messages")
      .select(MSG_COLS)
      .eq("room_id", params.roomId)
      .eq("client_message_id", params.clientMessageId)
      .maybeSingle();
    if (existing) return { ok: true, message: existing as ChatMessageRow, duplicated: true };
  }
  console.error("[messaging] insert failed:", error.message);
  return { ok: false, error: "메시지 전송에 실패했습니다." };
}

/** 발신자 본인의 읽음 워터마크를 전송 seq 까지 올린다(본인 메시지가 미읽음으로 잡히지 않게). */
async function bumpSenderWatermark(room: ChatRoomRow, actor: RoomActor, seq: number): Promise<void> {
  const admin = createAdminClient();
  if (actor.role === "member") {
    await admin
      .from("chat_room_members")
      .update({ last_read_seq: seq })
      .eq("room_id", room.id)
      .eq("dancer_id", actor.dancerId)
      .lt("last_read_seq", seq);
    // 회신은 읽었다는 뜻 — 대기 중 미읽음 메일 에피소드도 함께 소멸시킨다.
    // (핸들러의 발송 직전 재확인이 2차 방어지만, 잡 자체를 여기서 정리한다.)
    await cancelPendingRoomJobs(room.id, ["unread_mail"], (job) => {
      const first = Number((job.payload as { firstUnreadSeq?: number }).firstUnreadSeq ?? 0);
      return first > 0 && first <= seq;
    });
  } else {
    await admin
      .from("chat_rooms")
      .update({ staff_last_read_seq: seq })
      .eq("id", room.id)
      .lt("staff_last_read_seq", seq);
  }
}

/** team 발신의 수신자 측 부수효과: 인앱 알림+푸시, 미읽음 메일 잡(에피소드당 1건). */
export async function notifyMemberOfTeamMessage(params: {
  room: ChatRoomRow;
  message: ChatMessageRow;
  projectTitle: string;
  /** 캠페인이 병행 메일을 직접 보낼 때는 미읽음 재촉 메일이 중복이라 건너뛴다. */
  skipUnreadMail?: boolean;
}): Promise<void> {
  const { room, message, projectTitle } = params;
  const dancerId = room.direct_dancer_id;
  if (!dancerId) return;

  const seat = await getMemberSeat(room.id, dancerId);
  const muted = !!seat?.muted_until && new Date(seat.muted_until).getTime() > Date.now();
  const userIds = await listDancerActorUserIds(dancerId);

  // 지원자 대상 푸시도 외부 발송 차단기를 따른다 — 차단기 off 상태에서
  // 사용자에게 도달하는 채널은 인앱 목록뿐이어야 한다(단계적 출시 안전판).
  const pushAllowed = messagingExternalEnabled() && !muted;
  for (const uid of userIds) {
    await notify({
      recipientId: uid,
      type: "message_received",
      payload: { roomId: room.id, projectId: room.project_id, projectTitle },
      push: !pushAllowed
        ? undefined
        : {
            title: `${projectTitle} 운영팀`,
            body: previewText(message.body, 60) || "새 메시지가 도착했습니다.",
            url: `/messages/${room.id}`,
            tag: `room:${room.id}`,
          },
    });
  }

  // 미읽음 메일 — 클레임 계정이 있는 좌석만(계정 없는 댄서는 앱을 열 수 없어 대상 아님),
  // 뮤트 좌석은 재촉하지 않는다. 에피소드(미읽음 0→1 전환)당 1건: idem_key 가 잠근다.
  if (seat && seat.user_id && !muted && !params.skipUnreadMail) {
    const firstUnreadSeq = Number(seat.last_read_seq) + 1;
    if (message.room_seq >= firstUnreadSeq) {
      await enqueueJob({
        jobType: "unread_mail",
        idemKey: unreadMailIdemKey(room.id, firstUnreadSeq),
        availableAt: new Date(Date.now() + 60 * 60_000), // 1시간
        roomId: room.id,
        dancerId,
        payload: { firstUnreadSeq, projectTitle },
      });
    }
  }
}

/** member 발신의 운영팀 측 부수효과: 스태프 인앱 알림+푸시, SLA 잡(4h/24h). */
async function notifyStaffOfMemberMessage(params: {
  room: ChatRoomRow;
  message: ChatMessageRow;
  projectTitle: string;
  dancerName: string;
}): Promise<void> {
  const { room, message, projectTitle, dancerName } = params;
  const staffIds = await listProjectStaffUserIds(room.project_id);
  for (const uid of staffIds) {
    await notify({
      recipientId: uid,
      type: "message_received",
      payload: { roomId: room.id, projectId: room.project_id, projectTitle, from: dancerName },
      push: {
        title: `${dancerName} · ${projectTitle}`,
        body: previewText(message.body, 60),
        url: `/projects/${room.project_id}/messages?room=${room.id}`,
        tag: `room:${room.id}`,
      },
    });
  }

  // awaiting_staff_since 는 트리거가 설정했다 — 그 시각을 에피소드 키로 쓴다.
  const admin = createAdminClient();
  const { data: fresh } = await admin
    .from("chat_rooms")
    .select("awaiting_staff_since")
    .eq("id", room.id)
    .maybeSingle();
  const since = fresh?.awaiting_staff_since as string | null;
  if (since) {
    const epoch = new Date(since).getTime();
    await enqueueJob({
      jobType: "staff_sla",
      idemKey: `staff_sla4:${room.id}:${epoch}`,
      availableAt: new Date(epoch + 4 * 3_600_000),
      roomId: room.id,
      payload: { since, tier: 4, projectTitle },
    });
    await enqueueJob({
      jobType: "staff_sla",
      idemKey: `staff_sla24:${room.id}:${epoch}`,
      availableAt: new Date(epoch + 24 * 3_600_000),
      roomId: room.id,
      payload: { since, tier: 24, projectTitle },
    });
  }
}

/**
 * 같은 발신자가 같은 본문을 15초 안에 반복 전송하는 것 차단(고의 플러딩 1차 방어).
 * 단, 같은 clientMessageId 는 "응답을 잃은 재시도"라 멱등 경로(23505→기존 행 반환)로
 * 흘려보내야 하므로 버스트로 취급하지 않는다.
 */
async function isDuplicateBurst(
  roomId: string,
  senderUserId: string,
  body: string,
  clientMessageId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("chat_messages")
    .select("body, created_at, sender_user_id, client_message_id")
    .eq("room_id", roomId)
    .order("room_seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  if (data.client_message_id === clientMessageId) return false; // 재시도 — 멱등 처리로
  return (
    data.sender_user_id === senderUserId &&
    data.body === body &&
    Date.now() - new Date(data.created_at as string).getTime() < 15_000
  );
}

/** 직접 전송(댄서·운영자 공용 상위 함수). 가드·rate limit 은 호출한 액션이 이미 통과시켰다. */
export async function sendRoomMessage(params: {
  room: ChatRoomRow;
  actor: RoomActor;
  body: string;
  clientMessageId: string;
  projectTitle: string;
  dancerName?: string;
}): Promise<{ ok: true; message: ChatMessageRow } | { ok: false; error: string }> {
  const { room, actor, body, clientMessageId, projectTitle } = params;

  if (actor.role === "member" && room.closed_at) {
    return { ok: false, error: "종료된 대화방입니다. contact@deetz.kr 로 문의해 주세요." };
  }
  if (await isDuplicateBurst(room.id, actor.userId, body, clientMessageId)) {
    return { ok: false, error: "같은 내용을 연속해서 보낼 수 없습니다." };
  }

  const applicationId =
    room.direct_dancer_id != null
      ? await latestApplicationId(room.project_id, room.direct_dancer_id)
      : null;

  const inserted = await insertChatMessage({
    roomId: room.id,
    senderUserId: actor.userId,
    senderRole: actor.role === "staff" ? "team" : "member",
    kind: "text",
    body,
    clientMessageId,
    applicationId,
  });
  if (!inserted.ok) return inserted;

  // 멱등 재전송(중복)이면 부수효과를 다시 일으키지 않는다.
  if (!inserted.duplicated) {
    await bumpSenderWatermark(room, actor, inserted.message.room_seq);
    if (actor.role === "staff") {
      await notifyMemberOfTeamMessage({ room, message: inserted.message, projectTitle });
      // 팀이 답했다 — 대기 중 SLA 잡은 의미가 없어졌다.
      await cancelPendingRoomJobs(room.id, ["staff_sla"]);
    } else {
      await notifyStaffOfMemberMessage({
        room,
        message: inserted.message,
        projectTitle,
        dancerName: params.dancerName ?? "지원자",
      });
    }
  }
  return { ok: true, message: inserted.message };
}

/** 시스템 메시지(단계 변경 등 운영 이벤트 기록). 알림은 보내지 않는다. */
export async function appendSystemMessage(roomId: string, body: string): Promise<void> {
  await insertChatMessage({
    roomId,
    senderUserId: null,
    senderRole: "system",
    kind: "system",
    body,
  });
}

/**
 * 선발 액션 훅 — 이미 존재하는 스레드에만 운영 이벤트를 기록한다.
 * 방을 새로 만들지 않는 이유: 벌크 심사에서 수백 개의 빈 방이 생기는 것을 막는다.
 * 상태 변경은 기전달 메시지·스레드 접근권을 회수하지 않는다(과거 대화 보존 원칙).
 */
export async function appendStageSystemMessage(params: {
  projectId: string;
  dancerId: string | null;
  body: string;
}): Promise<void> {
  try {
    const { messagingEnabled } = await import("./flags");
    if (!messagingEnabled()) return;
    if (!params.dancerId) return;
    const admin = createAdminClient();
    const { data: room } = await admin
      .from("chat_rooms")
      .select("id")
      .eq("project_id", params.projectId)
      .eq("kind", "direct")
      .eq("direct_dancer_id", params.dancerId)
      .is("archived_at", null)
      .maybeSingle();
    if (!room) return;
    await appendSystemMessage(room.id as string, params.body);
  } catch (e) {
    console.error("[messaging] stage system message failed:", e);
  }
}
