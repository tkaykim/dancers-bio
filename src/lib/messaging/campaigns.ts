import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectApplicationScopeIds } from "@/lib/ops/project-application-scope";
import {
  resolveMemberMailTarget,
  sendCampaignMail,
  sendUnreadNudgeMail,
} from "@/lib/notify/message-mail";
import { messagingExternalEnabled } from "./flags";
import { getOrCreateDirectRoom } from "./rooms";
import { insertChatMessage, notifyMemberOfTeamMessage } from "./send";
import { campaignFanoutIdemKey, type MessageAction } from "./types";
import { enqueueJob, cancelJobByIdemKey } from "./jobs";

// 캠페인 = 방이 아니라 발송 도구. 원문 1건 + 수신자별 delivery.
// 예약 시점에 전 수신자 delivery 를 확정한다(스냅샷 불변) — 이후 선발 상태가
// 바뀌어도 이 캠페인의 대상·집계·감사 기록은 변하지 않는다.

export type CampaignSegment =
  | { type: "round"; round: number }
  | { type: "confirmed" }
  | { type: "pending" }
  | { type: "active_all" }
  | { type: "custom"; dancerIds: string[] };

export type AudienceRow = {
  dancerId: string;
  name: string;
  hasAccount: boolean;
};

export type AudiencePreview = {
  included: AudienceRow[];
  excluded: Array<AudienceRow & { reason: "no_account" }>;
};

const CHUNK_SIZE = 25;
const MAIL_THROTTLE_MS = 1300;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 세그먼트 → 대상 댄서 스냅샷. 모집채널 통합 프로젝트는 scope id 전체를 본다. */
export async function resolveCampaignAudience(
  projectId: string,
  segment: CampaignSegment,
): Promise<AudiencePreview> {
  const admin = createAdminClient();
  const scopeIds = await getProjectApplicationScopeIds(admin, projectId);

  const { data: apps } = await admin
    .from("applications")
    .select(
      "dancer_id, status, passed_round, confirmed_at, dancer:dancers!applications_dancer_id_fkey ( id, stage_name, profile_id )",
    )
    .in("project_id", scopeIds)
    .is("archived_at", null)
    .not("dancer_id", "is", null);

  type AppRow = {
    dancer_id: string;
    status: string;
    passed_round: number | null;
    confirmed_at: string | null;
    dancer:
      | { id: string; stage_name: string | null; profile_id: string | null }
      | Array<{ id: string; stage_name: string | null; profile_id: string | null }>
      | null;
  };

  // 댄서별 대표 지원서 1건(살아있는 상태 우선: accepted > pending > 그 외 최신).
  const rank = (s: string) => (s === "accepted" ? 2 : s === "pending" ? 1 : 0);
  const byDancer = new Map<string, AppRow>();
  for (const raw of (apps ?? []) as unknown as AppRow[]) {
    const prev = byDancer.get(raw.dancer_id);
    if (!prev || rank(raw.status) > rank(prev.status)) byDancer.set(raw.dancer_id, raw);
  }

  const matches = (a: AppRow): boolean => {
    switch (segment.type) {
      case "round":
        return a.status === "accepted" && Number(a.passed_round ?? 0) >= segment.round;
      case "confirmed":
        return a.status === "accepted" && a.confirmed_at != null;
      case "pending":
        return a.status === "pending";
      case "active_all":
        return a.status === "accepted" || a.status === "pending";
      case "custom":
        return segment.dancerIds.includes(a.dancer_id);
    }
  };

  const included: AudienceRow[] = [];
  const excluded: AudiencePreview["excluded"] = [];
  for (const app of byDancer.values()) {
    if (!matches(app)) continue;
    const dancer = Array.isArray(app.dancer) ? app.dancer[0] ?? null : app.dancer;
    const row: AudienceRow = {
      dancerId: app.dancer_id,
      name: dancer?.stage_name ?? "(이름 없음)",
      hasAccount: !!dancer?.profile_id,
    };
    if (row.hasAccount) included.push(row);
    else excluded.push({ ...row, reason: "no_account" });
  }
  included.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  excluded.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return { included, excluded };
}

/** 캠페인 생성 — 30초 취소 창 뒤 크론이 발송한다. delivery 는 지금 전량 확정. */
export async function createCampaign(params: {
  projectId: string;
  createdBy: string;
  title: string;
  body: string;
  action: MessageAction | null;
  segment: CampaignSegment;
  mailChannel: boolean;
}): Promise<{ ok: true; campaignId: string; included: number; excluded: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const audience = await resolveCampaignAudience(params.projectId, params.segment);
  if (audience.included.length === 0) {
    return { ok: false, error: "발송 대상이 없습니다." };
  }

  const sendAfter = new Date(Date.now() + 30_000);
  const { data: campaign, error } = await admin
    .from("broadcast_campaigns")
    .insert({
      project_id: params.projectId,
      title: params.title,
      body: params.body,
      action: params.action,
      audience: {
        segment: params.segment,
        computed_at: new Date().toISOString(),
        included: audience.included.length,
        excluded: audience.excluded,
      },
      channels: { mail: params.mailChannel },
      status: "scheduled",
      send_after: sendAfter.toISOString(),
      created_by: params.createdBy,
    })
    .select("id")
    .single();
  if (error || !campaign) {
    console.error("[campaign] insert failed:", error?.message);
    return { ok: false, error: "캠페인 생성에 실패했습니다." };
  }

  const deliveries = [
    ...audience.included.map((r) => ({
      campaign_id: campaign.id,
      dancer_id: r.dancerId,
      status: "pending" as const,
    })),
    ...audience.excluded.map((r) => ({
      campaign_id: campaign.id,
      dancer_id: r.dancerId,
      status: "skipped_no_account" as const,
    })),
  ];
  const { error: dErr } = await admin.from("broadcast_deliveries").insert(deliveries);
  if (dErr) {
    console.error("[campaign] deliveries insert failed:", dErr.message);
    await admin.from("broadcast_campaigns").delete().eq("id", campaign.id);
    return { ok: false, error: "발송 대상 확정에 실패했습니다." };
  }

  await enqueueJob({
    jobType: "campaign_fanout",
    idemKey: campaignFanoutIdemKey(campaign.id as string),
    availableAt: sendAfter,
    campaignId: campaign.id as string,
  });

  return {
    ok: true,
    campaignId: campaign.id as string,
    included: audience.included.length,
    excluded: audience.excluded.length,
  };
}

/** 30초 취소 창 — scheduled 일 때만. 발송 시작과의 경합은 조건부 UPDATE 로 승자 하나만. */
export async function cancelCampaign(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("broadcast_campaigns")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "scheduled")
    .select("id");
  if (error) return { ok: false, error: "취소 처리에 실패했습니다." };
  if (!data || data.length === 0) {
    return { ok: false, error: "이미 발송이 시작되어 취소할 수 없습니다." };
  }
  await cancelJobByIdemKey(campaignFanoutIdemKey(campaignId));
  return { ok: true };
}

/**
 * 크론 핸들러 본체 — pending delivery 를 청크로 처리한다.
 * 잔여가 남으면 { continue } 를 반환해 다음 크론 턴이 이어서 처리한다(attempt 미소모).
 */
export async function runCampaignFanout(
  campaignId: string,
): Promise<{ done: true; note?: string } | { continue: true } | { retry: true; error: string }> {
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("broadcast_campaigns")
    .select("id, project_id, title, body, action, channels, status, send_after")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { done: true, note: "campaign missing" };
  if (campaign.status === "cancelled") return { done: true, note: "cancelled" };
  if (campaign.status === "sent") return { done: true, note: "already sent" };

  // 취소와의 경합: scheduled → sending 전이에 성공한 쪽만 발송한다.
  if (campaign.status === "scheduled") {
    const { data: won } = await admin
      .from("broadcast_campaigns")
      .update({ status: "sending" })
      .eq("id", campaignId)
      .eq("status", "scheduled")
      .select("id");
    if (!won || won.length === 0) return { done: true, note: "lost race (cancelled)" };
  }

  const { data: project } = await admin
    .from("projects")
    .select("title")
    .eq("id", campaign.project_id)
    .maybeSingle();
  const projectTitle = ((project?.title as string | undefined) ?? "프로젝트").replace(
    /\s*\(모집채널 통합\)\s*/g,
    "",
  );

  const { data: pending } = await admin
    .from("broadcast_deliveries")
    .select("id, dancer_id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(CHUNK_SIZE);

  const mailEnabled =
    (campaign.channels as { mail?: boolean } | null)?.mail === true && messagingExternalEnabled();
  const kind = campaign.action ? "action_request" : "notice";

  for (const delivery of pending ?? []) {
    try {
      const roomRes = await getOrCreateDirectRoom(campaign.project_id, delivery.dancer_id);
      if (!roomRes.ok) {
        await admin
          .from("broadcast_deliveries")
          .update({ status: "failed", error: roomRes.error })
          .eq("id", delivery.id)
          .eq("status", "pending");
        continue;
      }

      const inserted = await insertChatMessage({
        roomId: roomRes.room.id,
        senderUserId: null,
        senderRole: "team",
        kind,
        body: campaign.body as string,
        action: (campaign.action as MessageAction | null) ?? null,
        clientMessageId: `bc:${campaignId}:${delivery.dancer_id}`,
      });
      if (!inserted.ok) {
        await admin
          .from("broadcast_deliveries")
          .update({ status: "failed", error: inserted.error })
          .eq("id", delivery.id)
          .eq("status", "pending");
        continue;
      }

      if (!inserted.duplicated) {
        // 캠페인이 병행 메일을 보내는 경우 미읽음 재촉 메일은 중복이라 건너뛴다.
        await notifyMemberOfTeamMessage({
          room: roomRes.room,
          message: inserted.message,
          projectTitle,
          skipUnreadMail: mailEnabled,
        });
      }

      if (mailEnabled) {
        const target = await resolveMemberMailTarget({
          dancerId: delivery.dancer_id,
          memberUserId: roomRes.memberUserId,
        });
        if (target.ok) {
          // claim-then-send — 재시도·중복 크론에도 메일이 두 번 나가지 않게 선점 후 발송.
          const claim = await admin.from("project_notification_log").insert({
            project_id: campaign.project_id,
            recipient_id: delivery.dancer_id,
            channel: `bcmail_${String(campaignId).slice(0, 8)}`,
          });
          if (!claim.error) {
            const sent = await sendCampaignMail({
              email: target.email,
              name: target.name,
              projectTitle,
              campaignTitle: campaign.title as string,
              body: campaign.body as string,
              roomId: roomRes.room.id,
            });
            if (!sent.ok) {
              await admin
                .from("project_notification_log")
                .delete()
                .eq("project_id", campaign.project_id)
                .eq("recipient_id", delivery.dancer_id)
                .eq("channel", `bcmail_${String(campaignId).slice(0, 8)}`);
            }
            await sleep(MAIL_THROTTLE_MS);
          }
        }
      }

      await admin
        .from("broadcast_deliveries")
        .update({
          status: "sent",
          room_id: roomRes.room.id,
          message_id: inserted.message.id,
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", delivery.id)
        .eq("status", "pending");
    } catch (err) {
      await admin
        .from("broadcast_deliveries")
        .update({ status: "failed", error: (err as Error).message?.slice(0, 300) })
        .eq("id", delivery.id)
        .eq("status", "pending");
    }
  }

  const { count: remaining } = await admin
    .from("broadcast_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if ((remaining ?? 0) > 0) return { continue: true };

  await admin
    .from("broadcast_campaigns")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", "sending");
  return { done: true };
}

export type CampaignStats = {
  id: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
  sendAfter: string;
  sentAt: string | null;
  mailChannel: boolean;
  total: number;
  delivered: number;
  skippedNoAccount: number;
  failed: number;
  read: number;
  responded: number;
  hasAction: boolean;
};

/** 프로젝트 캠페인 목록 + 읽음·응답 집계(워터마크 대비 재계산). */
export async function listCampaignsWithStats(projectId: string): Promise<CampaignStats[]> {
  const admin = createAdminClient();
  const { data: campaigns } = await admin
    .from("broadcast_campaigns")
    .select("id, title, body, action, channels, status, send_after, sent_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (!campaigns || campaigns.length === 0) return [];

  const ids = campaigns.map((c) => c.id as string);
  const { data: deliveries } = await admin
    .from("broadcast_deliveries")
    .select("campaign_id, dancer_id, room_id, message_id, status")
    .in("campaign_id", ids);

  const roomIds = [...new Set((deliveries ?? []).map((d) => d.room_id).filter(Boolean))] as string[];
  const messageIds = [...new Set((deliveries ?? []).map((d) => d.message_id).filter(Boolean))] as string[];

  const memberByRoomDancer = new Map<string, number>();
  if (roomIds.length > 0) {
    const { data: members } = await admin
      .from("chat_room_members")
      .select("room_id, dancer_id, last_read_seq")
      .in("room_id", roomIds);
    for (const m of members ?? []) {
      memberByRoomDancer.set(`${m.room_id}:${m.dancer_id}`, Number(m.last_read_seq));
    }
  }
  const seqByMessage = new Map<string, number>();
  if (messageIds.length > 0) {
    const { data: msgs } = await admin
      .from("chat_messages")
      .select("id, room_seq")
      .in("id", messageIds);
    for (const m of msgs ?? []) seqByMessage.set(m.id as string, Number(m.room_seq));
  }
  const respondedByMessage = new Map<string, Set<string>>();
  if (messageIds.length > 0) {
    const { data: resp } = await admin
      .from("chat_message_responses")
      .select("message_id, dancer_id")
      .in("message_id", messageIds);
    for (const r of resp ?? []) {
      const set = respondedByMessage.get(r.message_id as string) ?? new Set<string>();
      set.add(r.dancer_id as string);
      respondedByMessage.set(r.message_id as string, set);
    }
  }

  return campaigns.map((c) => {
    const rows = (deliveries ?? []).filter((d) => d.campaign_id === c.id);
    let delivered = 0;
    let read = 0;
    let responded = 0;
    let skipped = 0;
    let failed = 0;
    for (const d of rows) {
      if (d.status === "sent") {
        delivered += 1;
        const seq = d.message_id ? seqByMessage.get(d.message_id as string) : undefined;
        const watermark = d.room_id
          ? memberByRoomDancer.get(`${d.room_id}:${d.dancer_id}`)
          : undefined;
        if (seq != null && watermark != null && watermark >= seq) read += 1;
        if (
          d.message_id &&
          respondedByMessage.get(d.message_id as string)?.has(d.dancer_id as string)
        ) {
          responded += 1;
        }
      } else if (d.status === "skipped_no_account") skipped += 1;
      else if (d.status === "failed") failed += 1;
    }
    return {
      id: c.id as string,
      title: (c.title as string) ?? "",
      body: c.body as string,
      status: c.status as string,
      createdAt: c.created_at as string,
      sendAfter: c.send_after as string,
      sentAt: (c.sent_at as string | null) ?? null,
      mailChannel: (c.channels as { mail?: boolean } | null)?.mail === true,
      total: rows.length,
      delivered,
      skippedNoAccount: skipped,
      failed,
      read,
      responded,
      hasAction: c.action != null,
    };
  });
}

/** 미읽음 인원에게만 재촉 메일. 운영자 명시 버튼으로만 호출된다(자동 없음). */
export async function remindCampaignUnread(
  campaignId: string,
): Promise<{ ok: true; sent: number; skipped: number } | { ok: false; error: string }> {
  if (!messagingExternalEnabled()) {
    return { ok: false, error: "외부 발송이 아직 꺼져 있습니다." };
  }
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("broadcast_campaigns")
    .select("id, project_id, title")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "캠페인을 찾을 수 없습니다." };

  const { data: project } = await admin
    .from("projects")
    .select("title")
    .eq("id", campaign.project_id)
    .maybeSingle();
  const projectTitle = ((project?.title as string | undefined) ?? "프로젝트").replace(
    /\s*\(모집채널 통합\)\s*/g,
    "",
  );

  const { data: rows } = await admin
    .from("broadcast_deliveries")
    .select("dancer_id, room_id, message_id")
    .eq("campaign_id", campaignId)
    .eq("status", "sent");

  let sent = 0;
  let skipped = 0;
  for (const d of rows ?? []) {
    if (!d.room_id || !d.message_id) continue;
    const { data: msg } = await admin
      .from("chat_messages")
      .select("room_seq")
      .eq("id", d.message_id)
      .maybeSingle();
    const { data: seat } = await admin
      .from("chat_room_members")
      .select("user_id, last_read_seq, muted_until")
      .eq("room_id", d.room_id)
      .eq("dancer_id", d.dancer_id)
      .maybeSingle();
    if (!msg || !seat) continue;
    const unread = Number(seat.last_read_seq) < Number(msg.room_seq);
    const muted = !!seat.muted_until && new Date(seat.muted_until as string).getTime() > Date.now();
    if (!unread || muted) {
      skipped += 1;
      continue;
    }
    const target = await resolveMemberMailTarget({
      dancerId: d.dancer_id as string,
      memberUserId: (seat.user_id as string | null) ?? null,
    });
    if (!target.ok) {
      skipped += 1;
      continue;
    }
    const claim = await admin.from("project_notification_log").insert({
      project_id: campaign.project_id,
      recipient_id: d.dancer_id,
      channel: `bcremind_${String(campaignId).slice(0, 8)}`,
    });
    if (claim.error) {
      skipped += 1; // 이미 재촉함
      continue;
    }
    const res = await sendUnreadNudgeMail({
      email: target.email,
      name: target.name,
      projectTitle,
      roomId: d.room_id as string,
    });
    if (res.ok) sent += 1;
    else {
      await admin
        .from("project_notification_log")
        .delete()
        .eq("project_id", campaign.project_id)
        .eq("recipient_id", d.dancer_id)
        .eq("channel", `bcremind_${String(campaignId).slice(0, 8)}`);
      skipped += 1;
    }
    await sleep(MAIL_THROTTLE_MS);
  }
  return { ok: true, sent, skipped };
}
