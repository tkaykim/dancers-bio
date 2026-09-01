"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDancerIdForUserInProject } from "@/lib/schedule/resolve";
import { resolveRoomActor } from "@/lib/messaging/access";
import { MESSAGING_DISABLED_ERROR, messagingEnabled } from "@/lib/messaging/flags";
import { checkSendRateLimit } from "@/lib/messaging/rate-limit";
import { getOrCreateDirectRoom } from "@/lib/messaging/rooms";
import { sendRoomMessage } from "@/lib/messaging/send";
import { markRead } from "@/lib/messaging/reads";
import type { MessageAction } from "@/lib/messaging/types";
import type { ActionResult } from "./auth";

// 댄서(member) 쪽 메시지 액션.
// 서버 액션은 자동 노출되는 POST 엔드포인트다 — 모든 입력은 zod, 모든 room 접근은
// resolveRoomActor 게이트를 통과한 뒤에만 service-role 을 쓴다.

const sendSchema = z.object({
  roomId: z.string().uuid(),
  body: z.string().trim().min(1, "내용을 입력해 주세요.").max(4000, "메시지가 너무 깁니다."),
  clientMessageId: z.string().min(8).max(80),
});

export async function sendDancerMessageAction(input: {
  roomId: string;
  body: string;
  clientMessageId: string;
}): Promise<ActionResult<{ id: string; roomSeq: number; createdAt: string }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const access = await resolveRoomActor(user.id, parsed.data.roomId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.actor.role !== "member") {
    return { ok: false, error: "운영자 콘솔에서 답장해 주세요." };
  }

  const limited = await checkSendRateLimit(user.id, access.room.id);
  if (limited) return { ok: false, error: limited };

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("title")
    .eq("id", access.room.project_id)
    .maybeSingle();
  const { data: dancer } = await admin
    .from("dancers")
    .select("stage_name")
    .eq("id", access.actor.dancerId)
    .maybeSingle();

  const sent = await sendRoomMessage({
    room: access.room,
    actor: access.actor,
    body: parsed.data.body,
    clientMessageId: parsed.data.clientMessageId,
    projectTitle: (project?.title as string | undefined) ?? "프로젝트",
    dancerName: (dancer?.stage_name as string | undefined) ?? "지원자",
  });
  if (!sent.ok) return sent;
  return {
    ok: true,
    data: {
      id: sent.message.id,
      roomSeq: sent.message.room_seq,
      createdAt: sent.message.created_at,
    },
  };
}

export async function markThreadReadAction(input: {
  roomId: string;
  upToSeq: number;
}): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z
    .object({ roomId: z.string().uuid(), upToSeq: z.number().int().min(0) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const access = await resolveRoomActor(user.id, parsed.data.roomId);
  if (!access.ok) return { ok: false, error: access.error };
  await markRead(access.room, access.actor, parsed.data.upToSeq);
  return { ok: true };
}

export async function submitActionResponseAction(input: {
  messageId: string;
  choice: string;
  detail?: string;
}): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z
    .object({
      messageId: z.string().uuid(),
      choice: z.string().trim().min(1).max(80),
      detail: z.string().trim().max(1000).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };

  const admin = createAdminClient();
  const { data: message } = await admin
    .from("chat_messages")
    .select("id, room_id, kind, action")
    .eq("id", parsed.data.messageId)
    .maybeSingle();
  if (!message || message.kind !== "action_request" || !message.action) {
    return { ok: false, error: "응답할 수 없는 메시지입니다." };
  }

  const access = await resolveRoomActor(user.id, message.room_id as string);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.actor.role !== "member") {
    return { ok: false, error: "지원자만 응답할 수 있습니다." };
  }

  const action = message.action as MessageAction;
  if (!action.choices.includes(parsed.data.choice)) {
    return { ok: false, error: "선택지를 다시 확인해 주세요." };
  }
  if (action.deadline && new Date(action.deadline).getTime() < Date.now()) {
    return { ok: false, error: "응답 기한이 지났습니다. 운영팀에 메시지로 알려주세요." };
  }
  const needsDetail = (action.detail_required_for ?? []).includes(parsed.data.choice);
  if (needsDetail && !parsed.data.detail) {
    return { ok: false, error: "선택한 항목은 상세 내용을 함께 적어주세요." };
  }

  const { error } = await admin.from("chat_message_responses").upsert(
    {
      message_id: parsed.data.messageId,
      dancer_id: access.actor.dancerId,
      choice: parsed.data.choice,
      detail: parsed.data.detail ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_id,dancer_id" },
  );
  if (error) return { ok: false, error: "응답 저장에 실패했습니다." };
  return { ok: true };
}

export async function muteThreadAction(input: {
  roomId: string;
  /** null = 해제, 숫자 = 시간 단위(8/72/…), -1 = 무기한 */
  hours: number | null;
}): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z
    .object({ roomId: z.string().uuid(), hours: z.number().int().min(-1).max(24 * 365).nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const access = await resolveRoomActor(user.id, parsed.data.roomId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.actor.role !== "member") return { ok: false, error: "지원자 전용 기능입니다." };

  const mutedUntil =
    parsed.data.hours == null
      ? null
      : parsed.data.hours === -1
        ? new Date("2099-12-31T00:00:00Z").toISOString()
        : new Date(Date.now() + parsed.data.hours * 3_600_000).toISOString();

  const admin = createAdminClient();
  const { error } = await admin
    .from("chat_room_members")
    .update({ muted_until: mutedUntil })
    .eq("room_id", access.room.id)
    .eq("dancer_id", access.actor.dancerId);
  if (error) return { ok: false, error: "알림 설정 변경에 실패했습니다." };
  return { ok: true };
}

/** 지원 내역·공고 상세에서 "운영팀에 문의" — 내 스레드를 열거나 만든다. */
export async function openProjectThreadAction(input: {
  projectId: string;
}): Promise<ActionResult<{ roomId: string }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z.object({ projectId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const dancerId = await resolveDancerIdForUserInProject(parsed.data.projectId, user.id);
  if (!dancerId) {
    return { ok: false, error: "이 공고의 지원 내역을 찾을 수 없습니다. 지원 후 이용해 주세요." };
  }
  const room = await getOrCreateDirectRoom(parsed.data.projectId, dancerId);
  if (!room.ok) return { ok: false, error: room.error };
  return { ok: true, data: { roomId: room.room.id } };
}
