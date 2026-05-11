"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

function strOrNull(formData: FormData, key: string): string | null {
  const v = (formData.get(key) ?? "").toString().trim();
  return v ? v : null;
}

export async function applyToProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const project_id = formData.get("project_id");
  if (typeof project_id !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const cover_message = (formData.get("cover_message") ?? "").toString().trim();
  const applyAsRaw = (formData.get("apply_as") ?? "individual").toString();
  const applyAsTeamId = applyAsRaw.startsWith("team:")
    ? applyAsRaw.slice(5)
    : null;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, status, visibility, deleted_at, allow_team_apply")
    .eq("id", project_id)
    .single();

  if (!project || project.deleted_at) {
    return { ok: false, error: "프로젝트를 찾을 수 없습니다." };
  }
  if (project.owner_id === user.id) {
    return { ok: false, error: "본인이 개설한 프로젝트에는 지원할 수 없습니다." };
  }
  if (project.status !== "open") {
    return { ok: false, error: "현재 모집이 닫혀 있습니다." };
  }
  if (applyAsTeamId && !project.allow_team_apply) {
    return { ok: false, error: "이 공고는 팀 지원을 받지 않습니다." };
  }

  if (applyAsTeamId) {
    // Verify the user actually leads this team
    const { data: team } = await supabase
      .from("teams")
      .select("id, lead_profile_id, is_active")
      .eq("id", applyAsTeamId)
      .maybeSingle();
    if (!team) return { ok: false, error: "팀을 찾을 수 없습니다." };
    if (!team.is_active) return { ok: false, error: "비활성 팀으로는 지원할 수 없습니다." };
    if (team.lead_profile_id !== user.id) {
      return { ok: false, error: "팀장만 팀 명의로 지원할 수 있습니다." };
    }
    if (team.lead_profile_id === project.owner_id) {
      return { ok: false, error: "본인 팀이 개설한 프로젝트에는 지원할 수 없습니다." };
    }
  } else {
    // Individual: must have dancer profile
    const { data: dancer } = await supabase
      .from("dancers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!dancer) {
      return { ok: false, error: "개인 지원은 댄서 포트폴리오가 필요합니다." };
    }
  }

  const insertPayload: {
    project_id: string;
    applicant_id: string | null;
    team_id: string | null;
    source: "apply";
    status: "pending";
    cover_message: string | null;
  } = applyAsTeamId
    ? {
        project_id,
        team_id: applyAsTeamId,
        applicant_id: null,
        source: "apply",
        status: "pending",
        cover_message: cover_message || null,
      }
    : {
        project_id,
        applicant_id: user.id,
        team_id: null,
        source: "apply",
        status: "pending",
        cover_message: cover_message || null,
      };

  const { error } = await supabase.from("applications").insert(insertPayload);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 지원하셨습니다." };
    }
    if (error.code === "42501") {
      return { ok: false, error: "지원 권한이 없습니다." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${project_id}`);
  revalidatePath("/applications");
  return { ok: true };
}

export async function withdrawApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const application_id = formData.get("application_id");
  if (typeof application_id !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  // Lookup to determine whether this is an individual or team app
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, team_id, status")
    .eq("id", application_id)
    .maybeSingle();
  if (!app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };
  if (app.status !== "pending") {
    return { ok: false, error: "이미 처리된 지원은 취소할 수 없습니다." };
  }

  if (app.applicant_id) {
    if (app.applicant_id !== user.id) {
      return { ok: false, error: "본인 지원만 취소할 수 있습니다." };
    }
  } else if (app.team_id) {
    const { data: team } = await supabase
      .from("teams")
      .select("lead_profile_id")
      .eq("id", app.team_id)
      .maybeSingle();
    if (!team || team.lead_profile_id !== user.id) {
      return { ok: false, error: "팀장만 팀 지원을 취소할 수 있습니다." };
    }
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: "withdrawn", responded_at: new Date().toISOString() })
    .eq("id", application_id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/applications");
  return { ok: true };
}

export async function decideApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const application_id = formData.get("application_id");
  const decision = formData.get("decision");
  if (
    typeof application_id !== "string" ||
    (decision !== "accepted" && decision !== "rejected")
  ) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("project_id")
    .eq("id", application_id)
    .single();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  const { error } = await supabase
    .from("applications")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", application_id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${app.project_id}/applicants`);
  revalidatePath(`/projects/${app.project_id}`);
  return { ok: true };
}

void strOrNull;
