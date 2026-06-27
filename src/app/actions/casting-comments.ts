"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

// 공개 보드 페이지에서 클라이언트가 코멘트 제출(비로그인). service-role로 기록.
export async function submitCastingCommentAction(
  fd: FormData,
): Promise<ActionResult> {
  const shareCode = (fd.get("share_code") ?? "").toString().trim();
  const body = (fd.get("body") ?? "").toString().trim();
  const authorName = (fd.get("author_name") ?? "").toString().trim() || null;
  if (!shareCode) return { ok: false, error: "잘못된 요청입니다." };
  if (body.length < 1) return { ok: false, error: "내용을 입력해 주세요." };
  if (body.length > 2000) return { ok: false, error: "내용이 너무 깁니다. (최대 2000자)" };

  const admin = createAdminClient();
  const { data: board } = await admin
    .from("casting_boards")
    .select("id, project_id, is_active, expires_at")
    .eq("share_code", shareCode)
    .maybeSingle();
  if (!board || board.is_active === false)
    return { ok: false, error: "보드를 찾을 수 없습니다." };
  if (board.expires_at && new Date(board.expires_at as string).getTime() < Date.now())
    return { ok: false, error: "만료된 보드입니다." };

  const { error } = await admin.from("casting_board_comments").insert({
    board_id: board.id as string,
    author_name: authorName,
    body,
  });
  if (error) return { ok: false, error: "전달에 실패했습니다. 잠시 후 다시 시도해 주세요." };

  revalidatePath(`/projects/${board.project_id as string}/applicants`);
  return { ok: true };
}

// 관리자: 코멘트 읽음/안읽음 토글.
export async function markCastingCommentReadAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const commentId = (fd.get("comment_id") ?? "").toString().trim();
  const isRead = fd.get("is_read") === "true";
  if (!projectId || !commentId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("casting_board_comments")
    .update({ is_read: isRead })
    .eq("id", commentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}
