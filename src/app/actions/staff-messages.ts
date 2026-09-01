"use server";

import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertProjectManageAccess, resolveRoomActor } from "@/lib/messaging/access";
import { MESSAGING_DISABLED_ERROR, messagingEnabled } from "@/lib/messaging/flags";
import { cancelPendingRoomJobs } from "@/lib/messaging/jobs";
import { checkSendRateLimit } from "@/lib/messaging/rate-limit";
import { getOrCreateDirectRoom } from "@/lib/messaging/rooms";
import { sendRoomMessage } from "@/lib/messaging/send";
import type { ActionResult } from "./auth";

// 운영자(공동 인박스) 쪽 액션. 좌석은 개인이 아니라 "프로젝트 운영팀" —
// can_manage_project 통과자는 누구든 이어서 답장·처리한다.

const sendSchema = z.object({
  roomId: z.string().uuid(),
  body: z.string().trim().min(1, "내용을 입력해 주세요.").max(4000, "메시지가 너무 깁니다."),
  clientMessageId: z.string().min(8).max(80),
});

export async function sendStaffMessageAction(input: {
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
  if (access.actor.role !== "staff") return { ok: false, error: "운영자만 사용할 수 있습니다." };

  const limited = await checkSendRateLimit(user.id, access.room.id);
  if (limited) return { ok: false, error: limited };

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("title")
    .eq("id", access.room.project_id)
    .maybeSingle();

  const sent = await sendRoomMessage({
    room: access.room,
    actor: access.actor,
    body: parsed.data.body,
    clientMessageId: parsed.data.clientMessageId,
    projectTitle: (project?.title as string | undefined) ?? "프로젝트",
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

export async function addInternalNoteAction(input: {
  roomId: string;
  body: string;
}): Promise<ActionResult<{ id: string; createdAt: string }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z
    .object({ roomId: z.string().uuid(), body: z.string().trim().min(1).max(4000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };

  const access = await resolveRoomActor(user.id, parsed.data.roomId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.actor.role !== "staff") return { ok: false, error: "운영자만 사용할 수 있습니다." };

  // 내부 메모는 별도 테이블 — room_seq·미답변 상태·정렬에 아무 영향을 주지 않는다.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_internal_notes")
    .insert({ room_id: access.room.id, author_user_id: user.id, body: parsed.data.body })
    .select("id, created_at")
    .single();
  if (error || !data) return { ok: false, error: "메모 저장에 실패했습니다." };
  return { ok: true, data: { id: data.id as string, createdAt: data.created_at as string } };
}

/** 처리 완료 — 미답변 해제. 지원자가 답장하면 트리거가 자동 재오픈한다. */
export async function resolveThreadAction(input: { roomId: string }): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z.object({ roomId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const access = await resolveRoomActor(user.id, parsed.data.roomId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.actor.role !== "staff") return { ok: false, error: "운영자만 사용할 수 있습니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("chat_rooms")
    .update({
      resolved_at: new Date().toISOString(),
      awaiting_staff_since: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", access.room.id);
  if (error) return { ok: false, error: "처리 완료 표시에 실패했습니다." };
  await cancelPendingRoomJobs(access.room.id, ["staff_sla"]);
  return { ok: true };
}

/** 미답변으로 되돌리기(재플래그) — 운영 콘솔 필수 관례. */
export async function markUnansweredAction(input: { roomId: string }): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z.object({ roomId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const access = await resolveRoomActor(user.id, parsed.data.roomId);
  if (!access.ok) return { ok: false, error: access.error };
  if (access.actor.role !== "staff") return { ok: false, error: "운영자만 사용할 수 있습니다." };

  const admin = createAdminClient();
  const since = new Date().toISOString();
  const { error } = await admin
    .from("chat_rooms")
    .update({
      awaiting_staff_since: since,
      resolved_at: null,
      updated_at: since,
    })
    .eq("id", access.room.id);
  if (error) return { ok: false, error: "미답변 표시에 실패했습니다." };

  // 수동 재플래그도 4h/24h 에스컬레이션을 받아야 한다(자동 설정과 동일 대우).
  const { data: project } = await admin
    .from("projects")
    .select("title")
    .eq("id", access.room.project_id)
    .maybeSingle();
  const projectTitle = (project?.title as string | undefined) ?? "프로젝트";
  const epoch = new Date(since).getTime();
  const { enqueueJob } = await import("@/lib/messaging/jobs");
  await enqueueJob({
    jobType: "staff_sla",
    idemKey: `staff_sla4:${access.room.id}:${epoch}`,
    availableAt: new Date(epoch + 4 * 3_600_000),
    roomId: access.room.id,
    payload: { since, tier: 4, projectTitle },
  });
  await enqueueJob({
    jobType: "staff_sla",
    idemKey: `staff_sla24:${access.room.id}:${epoch}`,
    availableAt: new Date(epoch + 24 * 3_600_000),
    roomId: access.room.id,
    payload: { since, tier: 24, projectTitle },
  });
  return { ok: true };
}

/** 예외적 발신 차단(분쟁 등) — admin 전용. resolve 와 달리 지원자 발신을 막는다. */
export async function closeThreadAction(input: { roomId: string }): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireAdmin();
  const parsed = z.object({ roomId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const admin = createAdminClient();
  await admin
    .from("chat_rooms")
    .update({ closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", parsed.data.roomId);
  return { ok: true };
}

export async function reopenThreadAction(input: { roomId: string }): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireAdmin();
  const parsed = z.object({ roomId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  const admin = createAdminClient();
  await admin
    .from("chat_rooms")
    .update({ closed_at: null, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.roomId);
  return { ok: true };
}

/** 운영자가 특정 지원자와의 스레드를 연다(없으면 생성). */
export async function openDancerThreadAction(input: {
  projectId: string;
  dancerId: string;
}): Promise<ActionResult<{ roomId: string }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireUser();
  const parsed = z
    .object({ projectId: z.string().uuid(), dancerId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const canManage = await assertProjectManageAccess(parsed.data.projectId);
  if (!canManage) return { ok: false, error: "이 프로젝트의 운영 권한이 없습니다." };

  // 이 프로젝트(모집채널 통합 범위)의 지원자인지 확인 — 무관한 댄서에게 방을 만들지 않는다.
  const admin = createAdminClient();
  const { data: application } = await admin
    .from("applications")
    .select("id")
    .eq("project_id", parsed.data.projectId)
    .eq("dancer_id", parsed.data.dancerId)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (!application) {
    return { ok: false, error: "이 공고의 지원자가 아닙니다." };
  }

  const room = await getOrCreateDirectRoom(parsed.data.projectId, parsed.data.dancerId);
  if (!room.ok) return { ok: false, error: room.error };
  return { ok: true, data: { roomId: room.room.id } };
}
