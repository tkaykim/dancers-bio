"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";
import type { ManagerCandidate } from "./project-managers";

function cleanText(value: FormDataEntryValue | null, max = 120): string {
  return (value ?? "").toString().trim().slice(0, max);
}

async function loadChannelProject(channelId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recruitment_channels")
    .select("id, project_id, share_code")
    .eq("id", channelId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; project_id: string; share_code: string };
}

export async function createRecruitmentChannelAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; share_code: string }>> {
  const user = await requireUser();
  const projectId = cleanText(formData.get("project_id"), 80);
  const name = cleanText(formData.get("name"), 80);
  const channelType = cleanText(formData.get("channel_type"), 30) || "external";
  const managerLabel = cleanText(formData.get("manager_label"), 80) || null;
  const notes = cleanText(formData.get("notes"), 500);

  if (!projectId || !name) {
    return { ok: false, error: "프로젝트와 모집채널명을 확인해 주세요." };
  }
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "모집채널을 만들 권한이 없습니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recruitment_channels")
    .insert({
      project_id: projectId,
      name,
      channel_type: channelType,
      manager_label: managerLabel,
      notes,
      created_by: user.id,
    })
    .select("id, share_code")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 같은 이름의 모집채널이 있습니다." };
    }
    if (error.code === "42501") {
      return { ok: false, error: "모집채널을 만들 권한이 없습니다." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  return {
    ok: true,
    data: data as { id: string; share_code: string },
  };
}

export async function archiveRecruitmentChannelAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const channelId = cleanText(formData.get("channel_id"), 80);
  if (!channelId) return { ok: false, error: "잘못된 요청입니다." };

  const channel = await loadChannelProject(channelId);
  if (!channel) return { ok: false, error: "모집채널을 찾을 수 없습니다." };
  if (!(await canManageProject(channel.project_id))) {
    return { ok: false, error: "모집채널을 보관 처리할 권한이 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("recruitment_channels")
    .update({ status: "archived" })
    .eq("id", channelId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${channel.project_id}/applicants`);
  revalidatePath(`/c/${channel.share_code}`);
  return { ok: true };
}

export async function searchRecruitmentChannelMemberCandidatesAction(
  query: string,
  projectId: string,
): Promise<ActionResult<ManagerCandidate[]>> {
  await requireUser();
  const pid = (projectId ?? "").trim();
  if (!pid) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(pid))) {
    return { ok: false, error: "담당자 검색 권한이 없습니다." };
  }

  const term = (query ?? "").trim();
  if (term.length < 1) return { ok: true, data: [] };
  const safe = term.replace(/[%_,]/g, "");
  if (!safe) return { ok: true, data: [] };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_search_manager_candidates", {
    p_term: safe,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as ManagerCandidate[] };
}

export async function addRecruitmentChannelMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const channelId = cleanText(formData.get("channel_id"), 80);
  const profileId = cleanText(formData.get("profile_id"), 80);
  if (!channelId || !profileId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const channel = await loadChannelProject(channelId);
  if (!channel) return { ok: false, error: "모집채널을 찾을 수 없습니다." };
  if (!(await canManageProject(channel.project_id))) {
    return { ok: false, error: "담당자를 추가할 권한이 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("recruitment_channel_members").insert({
    channel_id: channelId,
    profile_id: profileId,
    role: "manager",
    added_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 이 채널 담당자로 등록된 계정입니다." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/projects/${channel.project_id}/applicants`);
  revalidatePath(`/channels/${channel.share_code}/applicants`);
  return { ok: true };
}

export async function removeRecruitmentChannelMemberAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const channelId = cleanText(formData.get("channel_id"), 80);
  const profileId = cleanText(formData.get("profile_id"), 80);
  if (!channelId || !profileId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const channel = await loadChannelProject(channelId);
  if (!channel) return { ok: false, error: "모집채널을 찾을 수 없습니다." };
  if (!(await canManageProject(channel.project_id))) {
    return { ok: false, error: "담당자를 삭제할 권한이 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("recruitment_channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${channel.project_id}/applicants`);
  revalidatePath(`/channels/${channel.share_code}/applicants`);
  return { ok: true };
}
