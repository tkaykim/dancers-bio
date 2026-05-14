"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
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

  let individualDancerId: string | null = null;
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
    // Individual: 댄서가 있어야 한다. applications.dancer_id ↔ team_id 는
    // XOR 제약(applications_dancer_team_xor) + RLS WITH CHECK 가 dancer/team
    // 분기만 인정하므로, 반드시 dancer_id 가 채워져야 한다.
    //
    // 폼에서 specific dancer 를 골라 보냈으면(`dancer_id` 필드) 그걸 우선 사용.
    // 없으면 본인 own dancer 중 첫 번째, 그것도 없으면 본인이 매니저로 가공하는
    // dancer 중 첫 번째를 사용한다 (can_act_as_dancer = owns OR manages).
    const preselectedDancerId = (formData.get("dancer_id") ?? "").toString().trim();
    if (preselectedDancerId) {
      const { data: chosen } = await supabase
        .from("dancers")
        .select("id, profile_id")
        .eq("id", preselectedDancerId)
        .maybeSingle();
      if (!chosen) {
        return { ok: false, error: "선택한 댄서 프로필을 찾을 수 없습니다." };
      }
      // 본인 소유 또는 매니저 권한 확인
      const isOwn = chosen.profile_id === user.id;
      let isManager = false;
      if (!isOwn) {
        const { data: mgr } = await supabase
          .from("dancer_managers")
          .select("dancer_id")
          .eq("dancer_id", chosen.id)
          .eq("manager_id", user.id)
          .maybeSingle();
        isManager = !!mgr;
      }
      if (!isOwn && !isManager) {
        return { ok: false, error: "선택한 댄서로 지원할 권한이 없습니다." };
      }
      individualDancerId = chosen.id as string;
    } else {
      // own dancer 우선
      const { data: ownDancers } = await supabase
        .from("dancers")
        .select("id")
        .eq("profile_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (ownDancers && ownDancers.length > 0) {
        individualDancerId = ownDancers[0].id as string;
      } else {
        // managed dancer 폴백
        const { data: managed } = await supabase
          .from("dancer_managers")
          .select("dancer_id")
          .eq("manager_id", user.id)
          .limit(1);
        if (managed && managed.length > 0) {
          individualDancerId = managed[0].dancer_id as string;
        }
      }
      if (!individualDancerId) {
        return {
          ok: false,
          error: "개인 지원은 댄서 포트폴리오가 필요합니다.",
        };
      }
    }
  }

  const insertPayload: {
    project_id: string;
    applicant_id: string | null;
    dancer_id: string | null;
    team_id: string | null;
    source: "apply";
    status: "pending";
    cover_message: string | null;
  } = applyAsTeamId
    ? {
        project_id,
        team_id: applyAsTeamId,
        dancer_id: null,
        applicant_id: null,
        source: "apply",
        status: "pending",
        cover_message: cover_message || null,
      }
    : {
        project_id,
        applicant_id: user.id,
        dancer_id: individualDancerId,
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
    return { ok: false, error: humanizeDbError(error.message) };
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
    .select("project_id, status")
    .eq("id", application_id)
    .single();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  // 시나리오 5: 수락↔거절 양방향 전이 허용. 단 사용자가 본인이 취소한 지원
  // (withdrawn, cancelled_*) 이나 만료(expired) 는 owner 가 임의로 수락/거절 못 함.
  const transitionable = new Set(["pending", "accepted", "rejected", "declined"]);
  if (!transitionable.has(app.status)) {
    return {
      ok: false,
      error: "취소·만료된 지원은 수락/거절할 수 없습니다.",
    };
  }
  if (app.status === decision) {
    return { ok: true }; // no-op
  }

  const { error } = await supabase
    .from("applications")
    .update({ status: decision, responded_at: new Date().toISOString() })
    .eq("id", application_id);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  revalidatePath(`/projects/${app.project_id}/applicants`);
  revalidatePath(`/projects/${app.project_id}`);
  return { ok: true };
}

void strOrNull;
