"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
import { notify } from "@/lib/notify";
import {
  respondProposalSchema,
  sendProposalSchema,
} from "@/lib/validation/proposals";
import type { ActionResult } from "./auth";

export async function sendDirectProposalAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

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
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title, owner_id, status, deleted_at, allow_team_apply")
    .eq("id", parsed.data.project_id)
    .single();
  if (!project || project.deleted_at) {
    return { ok: false, error: "프로젝트를 찾을 수 없습니다." };
  }
  if (!(await canManageProject(project.id))) {
    return {
      ok: false,
      error: "이 프로젝트의 제안 발송 권한이 없습니다.",
    };
  }
  if (
    project.status === "closed" ||
    project.status === "cancelled" ||
    project.status === "completed"
  ) {
    return { ok: false, error: "마감된 프로젝트입니다." };
  }

  // 대상 검증 + 알림 수신자(claim된 경우 profile_id) 확보
  let dancerProfileId: string | null = null;
  let dancerName = "댄서";
  if (parsed.data.team_id) {
    if (!project.allow_team_apply) {
      return { ok: false, error: "이 공고는 팀 제안을 받지 않습니다." };
    }
    const { data: team } = await supabase
      .from("teams")
      .select("lead_profile_id, is_active")
      .eq("id", parsed.data.team_id)
      .maybeSingle();
    if (!team || !team.is_active) {
      return { ok: false, error: "비활성이거나 존재하지 않는 팀입니다." };
    }
    if (team.lead_profile_id === user.id) {
      return { ok: false, error: "본인이 팀장인 팀에는 제안할 수 없습니다." };
    }
  } else {
    // 개별 댄서 제안 — 미claim(profile_id NULL) 댄서도 대상이 될 수 있다.
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id, profile_id, stage_name, is_active, approval_status")
      .eq("id", parsed.data.dancer_id!)
      .maybeSingle();
    if (!dancer || dancer.is_active === false) {
      return { ok: false, error: "존재하지 않거나 비활성 댄서입니다." };
    }
    if (dancer.approval_status !== "approved") {
      return { ok: false, error: "아직 공개되지 않은 댄서입니다." };
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
      return {
        ok: false,
        error: "이미 제안을 보냈거나 해당 대상이 이미 지원한 프로젝트입니다.",
      };
    }
    if (error.code === "42501") {
      return { ok: false, error: "제안 권한이 없습니다." };
    }
    if (/own (dancer|team|project)/i.test(error.message)) {
      return { ok: false, error: "본인 소유 대상에게는 제안할 수 없습니다." };
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
        title: "새 캐스팅 제안이 도착했어요",
        body: `${project.title}`,
        url: "/proposals",
        tag: `proposal-${inserted!.id}`,
      },
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

  const parsed = respondProposalSchema.safeParse({
    application_id: formData.get("application_id"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, team_id, dancer_id, project_id, source, status")
    .eq("id", parsed.data.application_id)
    .single();
  if (!app) return { ok: false, error: "제안을 찾을 수 없습니다." };

  if (app.source !== "direct_proposal") {
    return { ok: false, error: "다이렉트 제안에만 응답할 수 있습니다." };
  }
  if (app.status !== "pending") {
    return { ok: false, error: "이미 처리된 제안입니다." };
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
    return { ok: false, error: "권한이 없습니다." };
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
