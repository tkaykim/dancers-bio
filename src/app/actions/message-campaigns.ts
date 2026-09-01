"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertProjectManageAccess } from "@/lib/messaging/access";
import {
  cancelCampaign,
  createCampaign,
  listCampaignsWithStats,
  queueCampaignRemind,
  resolveCampaignAudience,
  type AudiencePreview,
  type CampaignSegment,
  type CampaignStats,
} from "@/lib/messaging/campaigns";
import { MESSAGING_DISABLED_ERROR, messagingEnabled } from "@/lib/messaging/flags";
import type { ActionResult } from "./auth";

// 캠페인(일괄 발송) 액션. 외부 발송 성격이라 전 단계에 확인 장치가 붙는다:
// ① 미리보기(수신·제외 명단) ② 발송 후 30초 취소 창 ③ 재촉은 명시 버튼 + 확인.

const segmentSchema: z.ZodType<CampaignSegment> = z.union([
  z.object({ type: z.literal("round"), round: z.number().int().min(1).max(3) }),
  z.object({ type: z.literal("confirmed") }),
  z.object({ type: z.literal("pending") }),
  z.object({ type: z.literal("active_all") }),
  z.object({ type: z.literal("custom"), dancerIds: z.array(z.string().uuid()).min(1).max(500) }),
]);

export async function previewCampaignAudienceAction(input: {
  projectId: string;
  segment: CampaignSegment;
}): Promise<ActionResult<AudiencePreview>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireUser();
  const parsed = z
    .object({ projectId: z.string().uuid(), segment: segmentSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await assertProjectManageAccess(parsed.data.projectId))) {
    return { ok: false, error: "이 프로젝트의 운영 권한이 없습니다." };
  }
  const preview = await resolveCampaignAudience(parsed.data.projectId, parsed.data.segment);
  return { ok: true, data: preview };
}

export async function sendCampaignAction(input: {
  projectId: string;
  title: string;
  body: string;
  segment: CampaignSegment;
  mailChannel: boolean;
  /** 확인 화면에서 운영자가 본 명단 — 발송은 이 명단을 넘지 못한다. */
  confirmedDancerIds: string[];
  actionChoices?: string[];
  actionDeadline?: string | null;
  actionDetailFor?: string[];
}): Promise<ActionResult<{ campaignId: string; included: number; excluded: number }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  const user = await requireUser();
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      title: z.string().trim().max(120),
      body: z.string().trim().min(1, "내용을 입력해 주세요.").max(4000),
      segment: segmentSchema,
      mailChannel: z.boolean(),
      confirmedDancerIds: z.array(z.string().uuid()).min(1, "수신 명단을 확인해 주세요.").max(1000),
      actionChoices: z.array(z.string().trim().min(1).max(40)).min(2).max(4).optional(),
      actionDeadline: z.string().datetime({ offset: true }).nullable().optional(),
      actionDetailFor: z.array(z.string()).optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  if (!(await assertProjectManageAccess(parsed.data.projectId))) {
    return { ok: false, error: "이 프로젝트의 운영 권한이 없습니다." };
  }

  const action = parsed.data.actionChoices
    ? {
        choices: parsed.data.actionChoices,
        deadline: parsed.data.actionDeadline ?? null,
        detail_required_for: (parsed.data.actionDetailFor ?? []).filter((c) =>
          parsed.data.actionChoices?.includes(c),
        ),
      }
    : null;

  const created = await createCampaign({
    projectId: parsed.data.projectId,
    createdBy: user.id,
    title: parsed.data.title,
    body: parsed.data.body,
    action,
    segment: parsed.data.segment,
    mailChannel: parsed.data.mailChannel,
    confirmedDancerIds: parsed.data.confirmedDancerIds,
  });
  if (!created.ok) return created;
  return {
    ok: true,
    data: {
      campaignId: created.campaignId,
      included: created.included,
      excluded: created.excluded,
    },
  };
}

export async function cancelCampaignAction(input: {
  campaignId: string;
}): Promise<ActionResult> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireUser();
  const parsed = z.object({ campaignId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("broadcast_campaigns")
    .select("project_id")
    .eq("id", parsed.data.campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "캠페인을 찾을 수 없습니다." };
  if (!(await assertProjectManageAccess(campaign.project_id as string))) {
    return { ok: false, error: "이 프로젝트의 운영 권한이 없습니다." };
  }
  return cancelCampaign(parsed.data.campaignId);
}

export async function listCampaignsAction(input: {
  projectId: string;
}): Promise<ActionResult<{ campaigns: CampaignStats[] }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireUser();
  const parsed = z.object({ projectId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await assertProjectManageAccess(parsed.data.projectId))) {
    return { ok: false, error: "이 프로젝트의 운영 권한이 없습니다." };
  }
  const campaigns = await listCampaignsWithStats(parsed.data.projectId);
  return { ok: true, data: { campaigns } };
}

export async function remindCampaignUnreadAction(input: {
  campaignId: string;
}): Promise<ActionResult<{ unread: number }>> {
  if (!messagingEnabled()) return { ok: false, error: MESSAGING_DISABLED_ERROR };
  await requireUser();
  const parsed = z.object({ campaignId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("broadcast_campaigns")
    .select("project_id")
    .eq("id", parsed.data.campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "캠페인을 찾을 수 없습니다." };
  if (!(await assertProjectManageAccess(campaign.project_id as string))) {
    return { ok: false, error: "이 프로젝트의 운영 권한이 없습니다." };
  }
  // 발송 자체는 크론이 청크로 처리한다 — 인원×스로틀로 서버 액션이 죽지 않게.
  const result = await queueCampaignRemind(parsed.data.campaignId);
  if (!result.ok) return result;
  return { ok: true, data: { unread: result.unread } };
}
