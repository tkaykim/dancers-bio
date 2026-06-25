"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import type { ActionResult } from "./auth";

const VALID_AUDIENCES = new Set(["public", "pending", "accepted", "rejected"]);

// 공지 등록 → 열람대상 지원자에게 인앱 + 웹푸시 알림 (비치명적, 알림톡 없음).
// 대상 = audiences 에 해당하는 지원상태의 본인계정. 'public' 포함 시 전체 지원자.
async function notifyAnnouncementAudience(args: {
  projectId: string;
  title: string | null;
  body: string;
  audiences: string[];
}): Promise<void> {
  try {
    const statuses = args.audiences.includes("public")
      ? ["pending", "accepted", "rejected"]
      : args.audiences.filter((a) => a !== "public");
    if (statuses.length === 0) return;

    const admin = createAdminClient();
    const [{ data: proj }, { data: apps }] = await Promise.all([
      admin.from("projects").select("title").eq("id", args.projectId).maybeSingle(),
      admin
        .from("applications")
        .select("applicant_id")
        .eq("project_id", args.projectId)
        .is("archived_at", null)
        .in("status", statuses)
        .not("applicant_id", "is", null),
    ]);
    const ids = Array.from(
      new Set(
        ((apps ?? []) as Array<{ applicant_id: string | null }>)
          .map((a) => a.applicant_id)
          .filter((v): v is string => !!v),
      ),
    );
    if (ids.length === 0) return;

    const projectTitle = (proj?.title as string) ?? "프로젝트";
    const url = `/projects/${args.projectId}`;
    const preview = (args.title || args.body).slice(0, 50);
    await Promise.all(
      ids.map((rid) =>
        notify({
          recipientId: rid,
          type: "announcement_posted",
          payload: {
            project_id: args.projectId,
            project_title: projectTitle,
            title: args.title,
            url,
          },
          push: { title: `${projectTitle} 공지`, body: preview, url },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyAnnouncementAudience] failed (non-fatal):", err);
  }
}

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

  // 열람대상에게 인앱 + 웹푸시 알림 (비치명적).
  await notifyAnnouncementAudience({ projectId, title, body, audiences });

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
