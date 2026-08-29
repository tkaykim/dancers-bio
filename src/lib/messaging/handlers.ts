import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { resolveMemberMailTarget, sendUnreadNudgeMail } from "@/lib/notify/message-mail";
import { runCampaignFanout } from "./campaigns";
import { messagingExternalEnabled } from "./flags";
import { getMemberSeat, listProjectStaffUserIds } from "./rooms";
import type { JobHandlers, MessageJob } from "./jobs";

// 크론 잡 핸들러 3종. 크론 route 가 이 맵을 processDueJobs 에 주입한다(순환 import 방지).

async function handleUnreadMail(job: MessageJob) {
  // 외부 발송 차단기 — 배포 순서 탓에 쌓인 잡이 나중에 일괄 발송되는 사고를 막는다.
  // 꺼져 있으면 재시도가 아니라 종료다(켠 뒤 과거 잡이 우르르 나가면 안 된다).
  if (!messagingExternalEnabled()) return { done: true as const, note: "external_disabled" };

  const roomId = job.room_id;
  const dancerId = job.dancer_id;
  const firstUnreadSeq = Number((job.payload as { firstUnreadSeq?: number }).firstUnreadSeq ?? 0);
  const projectTitle = String((job.payload as { projectTitle?: string }).projectTitle ?? "프로젝트");
  if (!roomId || !dancerId || !firstUnreadSeq) return { done: true as const, note: "bad payload" };

  const seat = await getMemberSeat(roomId, dancerId);
  if (!seat) return { done: true as const, note: "seat missing" };
  if (Number(seat.last_read_seq) >= firstUnreadSeq) {
    return { done: true as const, note: "already read" };
  }
  if (seat.muted_until && new Date(seat.muted_until).getTime() > Date.now()) {
    return { done: true as const, note: "muted" };
  }

  const target = await resolveMemberMailTarget({ dancerId, memberUserId: seat.user_id });
  if (!target.ok) return { done: true as const, note: `skip:${target.reason}` };

  const sent = await sendUnreadNudgeMail({
    email: target.email,
    name: target.name,
    projectTitle,
    roomId,
  });
  if (!sent.ok) return { retry: true as const, error: sent.error ?? "mail failed" };
  return { done: true as const };
}

async function handleStaffSla(job: MessageJob) {
  const roomId = job.room_id;
  const since = String((job.payload as { since?: string }).since ?? "");
  const tier = Number((job.payload as { tier?: number }).tier ?? 4);
  const projectTitle = String((job.payload as { projectTitle?: string }).projectTitle ?? "프로젝트");
  if (!roomId || !since) return { done: true as const, note: "bad payload" };

  const admin = createAdminClient();
  const { data: room } = await admin
    .from("chat_rooms")
    .select("id, project_id, awaiting_staff_since")
    .eq("id", roomId)
    .maybeSingle();
  // 그 사이 답장·처리 완료됐거나 새 에피소드로 바뀌었으면 이 잡은 소멸.
  if (!room || room.awaiting_staff_since !== since) {
    return { done: true as const, note: "answered" };
  }

  const recipients = new Set<string>(await listProjectStaffUserIds(room.project_id));
  if (tier >= 24) {
    const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
    for (const a of admins ?? []) recipients.add(a.id as string);
  }
  for (const uid of recipients) {
    await notify({
      recipientId: uid,
      type: "message_received",
      payload: { roomId, projectId: room.project_id, sla: tier, projectTitle },
      push: {
        title: `미답변 ${tier}시간 경과`,
        body: `${projectTitle} — 지원자 메시지에 아직 답변하지 않았습니다.`,
        url: `/projects/${room.project_id}/messages?room=${roomId}`,
        tag: `sla:${roomId}`,
      },
    });
  }
  return { done: true as const };
}

async function handleCampaignFanout(job: MessageJob) {
  if (!job.campaign_id) return { done: true as const, note: "bad payload" };
  return runCampaignFanout(job.campaign_id);
}

export const messageJobHandlers: JobHandlers = {
  unread_mail: handleUnreadMail,
  staff_sla: handleStaffSla,
  campaign_fanout: handleCampaignFanout,
};
