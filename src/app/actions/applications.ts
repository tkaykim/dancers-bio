"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
import { NEEDS_DANCER_ERROR } from "@/lib/lite-constants";
import type { ActionResult } from "./auth";

// Lite MVP: 1계정 = 1댄서 가정. team apply / manager-as-actor 분기 모두 제거.
// 항상 본인 own dancer (profile_id = user.id) 중 가장 오래된 1개로 INSERT.
// dancer가 없으면 NEEDS_DANCER sentinel 반환 → 클라이언트에서 onboarding으로 유도.
export async function applyToProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const project_id = formData.get("project_id");
  if (typeof project_id !== "string") {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const cover_message = (formData.get("cover_message") ?? "").toString().trim();

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, status, visibility, deleted_at")
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

  // 본인 own dancer 1개 조회 (multi-dancer는 Lite에서 미지원 — 가장 오래된 1개)
  const { data: ownDancers } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const dancerId = ownDancers?.[0]?.id as string | undefined;
  if (!dancerId) {
    return { ok: false, error: NEEDS_DANCER_ERROR };
  }

  const { error } = await supabase.from("applications").insert({
    project_id,
    applicant_id: user.id,
    dancer_id: dancerId,
    team_id: null,
    source: "apply" as const,
    status: "pending" as const,
    cover_message: cover_message || null,
  });

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
  const { data: app } = await supabase
    .from("applications")
    .select("id, applicant_id, status")
    .eq("id", application_id)
    .maybeSingle();
  if (!app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };
  if (app.status !== "pending") {
    return { ok: false, error: "이미 처리된 지원은 취소할 수 없습니다." };
  }
  if (app.applicant_id !== user.id) {
    return { ok: false, error: "본인 지원만 취소할 수 있습니다." };
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

  const transitionable = new Set(["pending", "accepted", "rejected", "declined"]);
  if (!transitionable.has(app.status)) {
    return {
      ok: false,
      error: "취소·만료된 지원은 수락/거절할 수 없습니다.",
    };
  }
  if (app.status === decision) {
    return { ok: true };
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
