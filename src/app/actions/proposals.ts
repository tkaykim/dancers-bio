"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  respondProposalSchema,
  sendProposalSchema,
} from "@/lib/validation/proposals";
import type { ActionResult } from "./auth";

export async function sendDirectProposalAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = sendProposalSchema.safeParse({
    project_id: formData.get("project_id"),
    applicant_id: formData.get("applicant_id"),
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
    .select("owner_id, status, deleted_at")
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
  if (project.status === "closed" || project.status === "cancelled" || project.status === "completed") {
    return { ok: false, error: "마감된 프로젝트입니다." };
  }

  const { error } = await supabase.from("applications").insert({
    project_id: parsed.data.project_id,
    applicant_id: parsed.data.applicant_id,
    source: "direct_proposal",
    status: "pending",
    cover_message: parsed.data.cover_message,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "이미 제안을 보냈거나 해당 댄서가 지원한 프로젝트입니다.",
      };
    }
    return { ok: false, error: error.message };
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
    .select("id, applicant_id, project_id, source, status")
    .eq("id", parsed.data.application_id)
    .single();
  if (!app) return { ok: false, error: "제안을 찾을 수 없습니다." };
  if (app.applicant_id !== user.id) {
    return { ok: false, error: "권한이 없습니다." };
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
  if (error) return { ok: false, error: error.message };

  revalidatePath("/proposals");
  revalidatePath(`/projects/${app.project_id}/applicants`);
  revalidatePath(`/projects/${app.project_id}`);
  return { ok: true, data: { accepted } };
}
