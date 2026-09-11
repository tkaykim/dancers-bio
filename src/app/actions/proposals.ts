"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
import { notify } from "@/lib/notify";
import { sendCastingProposalAlimtalk } from "@/lib/alimtalk/dancer-events";
import {
  respondProposalSchema,
  sendProposalSchema,
} from "@/lib/validation/proposals";
import { getLocale, serverT } from "@/lib/i18n/server";
import { localizeZodError } from "@/lib/i18n/zod";
import i18nActions from "@/lib/i18n/messages/actions";
import type { ActionResult } from "./auth";

export async function sendDirectProposalAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const t = await serverT(i18nActions);

  const dancerRaw = (formData.get("dancer_id") ?? "").toString().trim();
  const teamRaw = (formData.get("team_id") ?? "").toString().trim();

  const parsed = sendProposalSchema.safeParse({
    project_id: formData.get("project_id"),
    dancer_id: dancerRaw || null,
    team_id: teamRaw || null,
    cover_message:
      (formData.get("cover_message") ?? "").toString().trim() || null,
  });
  if (!parsed.success) {
    return { ok: false, error: localizeZodError(parsed.error, await getLocale()) };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, owner_id, status, deleted_at, allow_team_apply")
    .eq("id", parsed.data.project_id)
    .single();
  if (!project || project.deleted_at) {
    return { ok: false, error: t("project.not_found") };
  }
  if (!(await canManageProject(project.id))) {
    return { ok: false, error: t("proposal.send_forbidden") };
  }
  if (
    project.status === "closed" ||
    project.status === "cancelled" ||
    project.status === "completed"
  ) {
    return { ok: false, error: t("project.closed") };
  }

  // 대상 검증 + 알림 수신자(claim된 경우 profile_id) 확보
  let dancerProfileId: string | null = null;
  // eslint-disable-next-line no-restricted-syntax -- i18n: log. 화면에 나가지 않는 내부 폴백값(알림톡 로그용).
  let dancerName = "댄서";
  if (parsed.data.team_id) {
    if (!project.allow_team_apply) {
      return { ok: false, error: t("proposal.team_not_allowed") };
    }
    const { data: team } = await supabase
      .from("teams")
      .select("lead_profile_id, is_active")
      .eq("id", parsed.data.team_id)
      .maybeSingle();
    if (!team || !team.is_active) {
      return { ok: false, error: t("proposal.team_invalid") };
    }
    if (team.lead_profile_id === user.id) {
      return { ok: false, error: t("proposal.own_team") };
    }
  } else {
    // 개별 댄서 제안 — 미claim(profile_id NULL) 댄서도 대상이 될 수 있다.
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id, profile_id, stage_name, is_active, approval_status")
      .eq("id", parsed.data.dancer_id!)
      .maybeSingle();
    if (!dancer || dancer.is_active === false) {
      return { ok: false, error: t("proposal.dancer_invalid") };
    }
    if (dancer.approval_status !== "approved") {
      return { ok: false, error: t("proposal.dancer_not_public") };
    }
    dancerProfileId = (dancer.profile_id as string | null) ?? null;
    dancerName = (dancer.stage_name as string) ?? dancerName;
  }

  const insertPayload: {
    project_id: string;
    applicant_id: string | null;
    dancer_id: string | null;
    team_id: string | null;
    source: "direct_proposal";
    status: "pending";
    cover_message: string | null;
  } = {
    project_id: parsed.data.project_id,
    applicant_id: null,
    dancer_id: parsed.data.team_id ? null : parsed.data.dancer_id!,
    team_id: parsed.data.team_id ?? null,
    source: "direct_proposal",
    status: "pending",
    cover_message: parsed.data.cover_message ?? null,
  };

  const { data: inserted, error } = await supabase
    .from("applications")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: t("proposal.duplicate") };
    }
    if (error.code === "42501") {
      return { ok: false, error: t("proposal.forbidden") };
    }
    if (/own (dancer|team|project)/i.test(error.message)) {
      return { ok: false, error: t("proposal.own_target") };
    }
    return { ok: false, error: humanizeDbError(error.message) };
  }

  // 알림: claim된 댄서에게만 in-app/push. 미claim 댄서는 수신자(profile)가 없으므로
  // 추후 아웃리치(이메일/IG DM)가 알림 역할을 한다.
  if (dancerProfileId) {
    await notify({
      recipientId: dancerProfileId,
      type: "direct_proposal_received",
      payload: {
        application_id: inserted!.id as string,
        project_id: project.id as string,
        project_title: project.title as string,
      },
      push: {
        // eslint-disable-next-line no-restricted-syntax -- i18n: notify. 다른 이용자에게 저장·발송되는 알림 문구라 수신자 언어를 따라야 한다(범위 밖).
        title: "새 캐스팅 제안이 도착했어요",
        body: `${project.title}`,
        url: "/proposals",
        tag: `proposal-${inserted!.id}`,
      },
    });
  }

  // 캐스팅 제안 알림톡 — 개별 댄서 제안만(팀 제외), 폰 보유 시. best-effort.
  if (!parsed.data.team_id && parsed.data.dancer_id) {
    await sendCastingProposalAlimtalk({
      dancerId: parsed.data.dancer_id,
      applicationId: inserted!.id as string,
      projectTitle: project.title as string,
    });
  }

  revalidatePath(`/projects/${parsed.data.project_id}/applicants`);
  revalidatePath("/proposals");
  return { ok: true };
}

export async function respondToProposalAction(
  formData: FormData,
): Promise<ActionResult<{ accepted: boolean }>> {
  const user = await requireUser();
  const t = await serverT(i18nActions);

  const parsed = respondProposalSchema.safeParse({
    application_id: formData.get("application_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) {
    return { ok: false, error: t("common.invalid_request") };
  }

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, team_id, dancer_id, project_id, source, status")
    .eq("id", parsed.data.application_id)
    .single();
  if (!app) return { ok: false, error: t("proposal.not_found") };

  if (app.source !== "direct_proposal") {
    return { ok: false, error: t("proposal.respond_direct_only") };
  }
  if (app.status !== "pending") {
    return { ok: false, error: t("proposal.already_handled") };
  }

  // 수신자(제안받은 측)만 응답 가능 — 프로젝트 소유자가 대신 응답하는 것을 막는다.
  let authorized = false;
  if (app.team_id) {
    const { data: team } = await supabase
      .from("teams")
      .select("lead_profile_id")
      .eq("id", app.team_id)
      .maybeSingle();
    authorized = Boolean(team && team.lead_profile_id === user.id);
  } else if (app.dancer_id) {
    // owns_dancer: dancers.profile_id == uid
    const { data: dancer } = await supabase
      .from("dancers")
      .select("profile_id")
      .eq("id", app.dancer_id)
      .maybeSingle();
    authorized = Boolean(dancer && dancer.profile_id === user.id);
    if (!authorized) {
      // manages_dancer: dancer_managers
      const { data: mgr } = await supabase
        .from("dancer_managers")
        .select("dancer_id")
        .eq("dancer_id", app.dancer_id)
        .eq("manager_id", user.id)
        .maybeSingle();
      authorized = Boolean(mgr);
    }
  } else if (app.applicant_id) {
    // 레거시 경로 (applicant_id 기반 제안)
    authorized = app.applicant_id === user.id;
  }
  if (!authorized) {
    return { ok: false, error: t("common.forbidden") };
  }

  const accepted = parsed.data.decision === "accepted";
  const newStatus = accepted ? "accepted" : "declined";
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("applications")
    .update({
      status: newStatus,
      responded_at: now,
      ...(accepted ? { contact_revealed_at: now } : {}),
    })
    .eq("id", app.id);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  // 프로젝트 소유자에게 응답 알림
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, title")
    .eq("id", app.project_id)
    .maybeSingle();
  if (project?.owner_id) {
    await notify({
      recipientId: project.owner_id as string,
      type: accepted ? "direct_proposal_accepted" : "direct_proposal_declined",
      payload: {
        application_id: app.id as string,
        project_id: app.project_id as string,
        project_title: (project.title as string) ?? "",
      },
      push: {
        // eslint-disable-next-line no-restricted-syntax -- i18n: notify. 공고 등록자에게 발송되는 알림 문구라 수신자 언어를 따라야 한다(범위 밖).
        title: accepted ? "제안이 수락되었어요" : "제안이 거절되었어요",
        body: `${project.title ?? ""}`,
        url: `/projects/${app.project_id}/applicants`,
        tag: `proposal-resp-${app.id}`,
      },
    });
  }

  revalidatePath("/proposals");
  revalidatePath(`/projects/${app.project_id}/applicants`);
  revalidatePath(`/projects/${app.project_id}`);
  return { ok: true, data: { accepted } };
}
