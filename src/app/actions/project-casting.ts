"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

type Settings = {
  genderPriority?: "male" | "female" | null;
  sortBy?: "height" | "manual";
  requirePhoto?: boolean;
  genders?: string[];
  minHeight?: number | null;
  fields?: { height?: boolean; instagram?: boolean; career?: boolean };
};

const DEFAULT_SETTINGS: Settings = {
  genderPriority: "male",
  sortBy: "height",
  requirePhoto: true,
  genders: ["male", "female"],
  minHeight: null,
  fields: { height: true, instagram: true, career: true },
};

// 합격자(탈락/철회 제외) 댄서 id 목록.
async function acceptedDancerIds(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("applications")
    .select("dancer_id")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .eq("status", "accepted")
    .not("dancer_id", "is", null);
  const ids = new Set<string>();
  for (const r of (data ?? []) as Array<{ dancer_id: string }>) ids.add(r.dancer_id);
  return [...ids];
}

// 보드 생성 + 합격자 전원을 멤버로 시드. 반환=share_code.
export async function createCastingBoardAction(
  fd: FormData,
): Promise<ActionResult<{ id: string; shareCode: string }>> {
  await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const title = (fd.get("title") ?? "").toString().trim() || null;
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data: board, error } = await supabase
    .from("casting_boards")
    .insert({ project_id: projectId, title, settings: DEFAULT_SETTINGS })
    .select("id, share_code")
    .single();
  if (error || !board) return { ok: false, error: error?.message ?? "생성 실패" };

  // 합격자 전원 시드 (best-effort, service-role).
  try {
    const admin = createAdminClient();
    const ids = await acceptedDancerIds(admin, projectId);
    if (ids.length)
      await admin
        .from("casting_board_members")
        .insert(ids.map((dancer_id) => ({ board_id: board.id as string, dancer_id })));
  } catch {
    /* 멤버 시드 실패해도 보드는 생성됨 — UI에서 동기화 버튼으로 보정 */
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { id: board.id as string, shareCode: board.share_code as string } };
}

// 설정 저장(정렬·필터·표시항목·제목·만료·활성).
export async function updateCastingBoardAction(fd: FormData): Promise<ActionResult> {
  await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!boardId || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const settingsRaw = fd.get("settings");
  if (settingsRaw != null) {
    try {
      patch.settings = JSON.parse(settingsRaw.toString());
    } catch {
      return { ok: false, error: "설정 형식 오류" };
    }
  }
  if (fd.get("title") != null) patch.title = fd.get("title")!.toString().trim() || null;
  if (fd.get("is_active") != null) patch.is_active = fd.get("is_active") === "true";
  if (fd.get("expires_at") != null) {
    const v = fd.get("expires_at")!.toString().trim();
    patch.expires_at = v ? new Date(v).toISOString() : null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("casting_boards").update(patch).eq("id", boardId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

// 멤버 = 현재 합격자 전원으로 재동기화(추가만; 기존 수동 제외는 유지하지 않음 = 전체 리셋).
export async function syncCastingBoardMembersAction(
  fd: FormData,
): Promise<ActionResult<{ count: number }>> {
  await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!boardId || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const ids = await acceptedDancerIds(admin, projectId);
  await admin.from("casting_board_members").delete().eq("board_id", boardId);
  if (ids.length)
    await admin
      .from("casting_board_members")
      .insert(ids.map((dancer_id) => ({ board_id: boardId, dancer_id })));
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { count: ids.length } };
}

// 개별 댄서 포함/제외 토글.
export async function toggleCastingBoardMemberAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const include = fd.get("include") === "true";
  if (!boardId || !projectId || !dancerId)
    return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  if (include) {
    await admin
      .from("casting_board_members")
      .upsert({ board_id: boardId, dancer_id: dancerId }, { onConflict: "board_id,dancer_id" });
  } else {
    await admin
      .from("casting_board_members")
      .delete()
      .eq("board_id", boardId)
      .eq("dancer_id", dancerId);
  }
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}
