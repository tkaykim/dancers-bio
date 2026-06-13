"use server";

import { revalidatePath } from "next/cache";
import {
  isProjectOwnerOrAdmin,
  requireUser,
} from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

export type ManagerCandidate = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  instagram_handle: string | null;
};

// 공동관리자로 추가할 "기존 가입 계정" 검색 (이름 또는 인스타 핸들).
export async function searchManagerCandidatesAction(
  query: string,
): Promise<ActionResult<ManagerCandidate[]>> {
  await requireUser();
  const term = (query ?? "").trim();
  if (term.length < 1) return { ok: true, data: [] };
  const safe = term.replace(/[%_,]/g, "");
  if (!safe) return { ok: true, data: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, instagram_handle")
    .or(`display_name.ilike.%${safe}%,instagram_handle.ilike.%${safe}%`)
    .limit(8);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ManagerCandidate[] };
}

// 공동관리자 추가 — 소유자·슈퍼관리자만 (RLS가 이중으로 강제).
export async function addProjectManagerAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const projectId = (formData.get("project_id") ?? "").toString().trim();
  const profileId = (formData.get("profile_id") ?? "").toString().trim();
  if (!projectId || !profileId)
    return { ok: false, error: "잘못된 요청입니다." };

  if (!(await isProjectOwnerOrAdmin(projectId)))
    return { ok: false, error: "공동관리자를 추가할 권한이 없습니다." };

  const supabase = await createClient();

  // 프로젝트 소유자는 이미 전권이라 공동관리자로 또 넣지 않는다.
  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (project && project.owner_id === profileId)
    return { ok: false, error: "이미 이 프로젝트의 소유자입니다." };

  const { error } = await supabase.from("project_managers").insert({
    project_id: projectId,
    profile_id: profileId,
    role: "manager",
    added_by: user.id,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "이미 공동관리자로 등록된 계정입니다." };
    if (error.code === "42501")
      return { ok: false, error: "공동관리자를 추가할 권한이 없습니다." };
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

// 공동관리자 삭제 — 소유자·슈퍼관리자만.
export async function removeProjectManagerAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const projectId = (formData.get("project_id") ?? "").toString().trim();
  const profileId = (formData.get("profile_id") ?? "").toString().trim();
  if (!projectId || !profileId)
    return { ok: false, error: "잘못된 요청입니다." };

  if (!(await isProjectOwnerOrAdmin(projectId)))
    return { ok: false, error: "공동관리자를 삭제할 권한이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_managers")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}
