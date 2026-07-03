"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import { buildCastingBoardEmail } from "@/lib/casting/board-email";
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

// 보드에 넣을 댄서 id 목록.
// 확정(confirmed_at)이 하나라도 있으면 = 확정자만(최종 캐스팅). 없으면 accepted 전원(확정 흐름 미사용 프로젝트 호환).
async function acceptedDancerIds(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("applications")
    .select("dancer_id, confirmed_at")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .eq("status", "accepted")
    .not("dancer_id", "is", null);
  const rows = (data ?? []) as Array<{ dancer_id: string; confirmed_at: string | null }>;
  const confirmed = rows.filter((r) => r.confirmed_at);
  const use = confirmed.length > 0 ? confirmed : rows;
  return [...new Set(use.map((r) => r.dancer_id))];
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

// 공지(notes)만 인라인 저장 — 공개 보드 페이지(/cast)에서 관리자가 바로 편집할 때 사용.
export async function updateCastingBoardNotesAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  if (!boardId) return { ok: false, error: "잘못된 요청입니다." };

  let notes: string[];
  try {
    const raw = JSON.parse((fd.get("notes") ?? "[]").toString());
    if (!Array.isArray(raw)) throw new Error("not array");
    notes = raw
      .map((n) => (typeof n === "string" ? n.trim() : ""))
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return { ok: false, error: "공지 형식 오류" };
  }

  const admin = createAdminClient();
  const { data: board } = await admin
    .from("casting_boards")
    .select("id, project_id, share_code, settings")
    .eq("id", boardId)
    .maybeSingle();
  if (!board) return { ok: false, error: "보드를 찾을 수 없습니다." };
  if (!(await canManageProject(board.project_id as string)))
    return { ok: false, error: "권한이 없습니다." };

  const settings = { ...((board.settings ?? {}) as Record<string, unknown>) };
  settings.notes = notes;
  delete settings.note; // 레거시 단일 공지 제거

  const { error } = await admin
    .from("casting_boards")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", boardId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/cast/${board.share_code as string}`);
  revalidatePath(`/projects/${board.project_id as string}/applicants`);
  return { ok: true };
}

// 클라이언트에게 보드 링크를 deetz 메일로 발송 + 이력 기록.
export async function sendCastingBoardEmailAction(
  fd: FormData,
): Promise<ActionResult<{ sentTo: string }>> {
  const user = await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const email = (fd.get("recipient_email") ?? "").toString().trim();
  const name = (fd.get("recipient_name") ?? "").toString().trim() || null;
  const message = (fd.get("message") ?? "").toString().trim() || null;
  if (!boardId || !projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email))
    return { ok: false, error: "받는 사람 이메일을 정확히 입력해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { data: board } = await admin
    .from("casting_boards")
    .select("id, title, share_code, project_id")
    .eq("id", boardId)
    .maybeSingle();
  if (!board || board.project_id !== projectId)
    return { ok: false, error: "보드를 찾을 수 없습니다." };

  const url = `https://deetz.kr/cast/${board.share_code as string}`;
  const mail = buildCastingBoardEmail({
    boardTitle: (board.title as string) ?? null,
    boardUrl: url,
    recipientName: name,
    message,
  });

  const res = await sendGmailEmail({ to: email, ...mail });
  await admin.from("casting_board_sends").insert({
    board_id: boardId,
    recipient_email: email,
    recipient_name: name,
    message,
    status: res.ok ? "sent" : "failed",
    error: res.ok ? null : "send_failed",
    sent_by: user.id,
  });
  if (!res.ok) return { ok: false, error: "메일 발송에 실패했습니다." };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { sentTo: email } };
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
