"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
import {
  respondProposalSchema,
  sendProposalSchema,
} from "@/lib/validation/proposals";
import type { ActionResult } from "./auth";

export async function sendDirectProposalAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const applicantRaw = (formData.get("applicant_id") ?? "").toString().trim();
  const teamRaw = (formData.get("team_id") ?? "").toString().trim();

  const parsed = sendProposalSchema.safeParse({
    project_id: formData.get("project_id"),
    applicant_id: applicantRaw || null,
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
  if (parsed.data.applicant_id === user.id) {
    return { ok: false, error: "본인에게는 제안을 보낼 수 없습니다." };
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, status, deleted_at, allow_team_apply")
    .eq("id", parsed.data.project_id)
    .single();
  if (!project || project.deleted_at) {
    return { ok: false, error: "프로젝트를 찾을 수 없습니다." };
  }
  if (project.owner_id !== user.id) {
    return {
      ok: false,
      error: "본인이 개설한 프로젝트만 제안을 보낼 수 있습니다.",
    };
  }
  if (
    project.status === "closed" ||
    project.status === "cancelled" ||
    project.status === "completed"
  ) {
    return { ok: false, error: "마감된 프로젝트입니다." };
  }
  if (parsed.data.team_id && !project.allow_team_apply) {
    return { ok: false, error: "이 공고는 팀 제안을 받지 않습니다." };
  }
  if (parsed.data.team_id) {
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
  }

  // direct_proposal individual 분기에서는 applications.dancer_id 가 채워져야 한다
  // (applications_dancer_team_xor 제약 + RLS WITH CHECK 의 direct_proposal 분기 모두
  // dancer_id 또는 team_id 를 요구). 폼은 대상 사용자의 profile UUID (applicant_id) 를
  // 보내므로, 여기서 그 profile 의 dancer 1개를 lookup 해서 dancer_id 로 변환한다.
  let dancerIdForInsert: string | null = null;
  if (!parsed.data.team_id) {
    const { data: approved } = await supabase
      .from("dancers")
      .select("id")
      .eq("profile_id", parsed.data.applicant_id!)
      .eq("approval_status", "approved")
      .order("created_at", { ascending: true })
      .limit(1);
    if (approved && approved.length > 0) {
      dancerIdForInsert = approved[0].id as string;
    } else {
      const { data: any_d } = await supabase
        .from("dancers")
        .select("id")
        .eq("profile_id", parsed.data.applicant_id!)
        .order("created_at", { ascending: true })
        .limit(1);
      if (!any_d || any_d.length === 0) {
        return {
          ok: false,
          error: "해당 사용자에게 댄서 프로필이 없어 제안을 보낼 수 없습니다.",
        };
      }
      dancerIdForInsert = any_d[0].id as string;
    }
  }

  const insertPayload: {
    project_id: string;
    applicant_id: string | null;
    dancer_id: string | null;
    team_id: string | null;
    source: "direct_proposal";
    status: "pending";
    cover_message: string | null;
  } = parsed.data.team_id
    ? {
        project_id: parsed.data.project_id,
        applicant_id: null,
        dancer_id: null,
        team_id: parsed.data.team_id,
        source: "direct_proposal",
        status: "pending",
        cover_message: parsed.data.cover_message ?? null,
      }
    : {
        project_id: parsed.data.project_id,
        applicant_id: parsed.data.applicant_id!,
        dancer_id: dancerIdForInsert,
        team_id: null,
        source: "direct_proposal",
        status: "pending",
        cover_message: parsed.data.cover_message ?? null,
      };

  const { error } = await supabase.from("applications").insert(insertPayload);
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
    return { ok: false, error: humanizeDbError(error.message) };
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
    .select("id, applicant_id, team_id, project_id, source, status")
    .eq("id", parsed.data.application_id)
    .single();
  if (!app) return { ok: false, error: "제안을 찾을 수 없습니다." };

  if (app.applicant_id) {
    if (app.applicant_id !== user.id) {
      return { ok: false, error: "권한이 없습니다." };
    }
  } else if (app.team_id) {
    const { data: team } = await supabase
      .from("teams")
      .select("lead_profile_id")
      .eq("id", app.team_id)
      .maybeSingle();
    if (!team || team.lead_profile_id !== user.id) {
      return { ok: false, error: "팀장만 팀 제안에 응답할 수 있습니다." };
    }
  } else {
    return { ok: false, error: "잘못된 제안입니다." };
  }

  if (app.source !== "direct_proposal") {
    return { ok: false, error: "다이렉트 제안에만 응답할 수 있습니다." };
  }
  if (app.status !== "pending") {
    return { ok: false, error: "이미 처리된 제안입니다." };
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

  revalidatePath("/proposals");
  revalidatePath(`/projects/${app.project_id}/applicants`);
  revalidatePath(`/projects/${app.project_id}`);
  return { ok: true, data: { accepted } };
}
