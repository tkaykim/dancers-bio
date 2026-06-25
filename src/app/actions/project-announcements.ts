"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

const VALID_AUDIENCES = new Set(["public", "pending", "accepted", "rejected"]);

function parseAudiences(fd: FormData): string[] {
  const raw = fd.getAll("audiences").map((v) => v.toString());
  return Array.from(new Set(raw.filter((v) => VALID_AUDIENCES.has(v))));
}

function text(fd: FormData, key: string, max: number): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v ? v.slice(0, max) : null;
}

export async function createAnnouncementAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const body = text(fd, "body", 4000);
  const title = text(fd, "title", 200);
  const audiences = parseAudiences(fd);
  const pinned = fd.get("pinned") === "true";

  if (!projectId || !body)
    return { ok: false, error: "공지 내용을 입력해 주세요." };
  if (audiences.length === 0)
    return { ok: false, error: "열람 대상을 한 개 이상 선택해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_announcements")
    .insert({
      project_id: projectId,
      title,
      body,
      audiences,
      pinned,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateAnnouncementAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = (fd.get("announcement_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const body = text(fd, "body", 4000);
  const title = text(fd, "title", 200);
  const audiences = parseAudiences(fd);
  const pinned = fd.get("pinned") === "true";

  if (!id || !projectId || !body)
    return { ok: false, error: "공지 내용을 입력해 주세요." };
  if (audiences.length === 0)
    return { ok: false, error: "열람 대상을 한 개 이상 선택해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_announcements")
    .update({
      title,
      body,
      audiences,
      pinned,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

export async function deleteAnnouncementAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const id = (fd.get("announcement_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!id || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("project_announcements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}
