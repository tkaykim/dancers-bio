"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGmailEmail } from "@/lib/gmail";
import { buildCastingBoardEmail } from "@/lib/casting/board-email";
import { makeCastingReviewToken } from "@/lib/quick-token";
import {
  applicationMatchesCandidateStatuses,
  normalizeCandidateStatuses,
  type ClientReviewSettings,
} from "@/lib/casting/review";
import type { ActionResult } from "./auth";

type Settings = {
  genderPriority?: "male" | "female" | null;
  sortBy?: "height" | "manual";
  requirePhoto?: boolean;
  genders?: string[];
  minHeight?: number | null;
  fields?: { height?: boolean; instagram?: boolean; career?: boolean; profile?: boolean };
  clientReview?: ClientReviewSettings;
};

const DEFAULT_SETTINGS: Settings = {
  genderPriority: "male",
  sortBy: "height",
  requirePhoto: true,
  genders: ["male", "female"],
  minHeight: null,
  fields: { height: true, instagram: false, career: true, profile: false },
  clientReview: {
    enabled: false,
    candidateStatuses: ["pending", "accepted", "confirmed"],
    applySelectedAs: "accepted",
  },
};

type CandidateApplication = { applicationId: string; dancerId: string };
type CandidateApplicationRow = {
  id: string;
  dancer_id: string;
  status: string;
  confirmed_at: string | null;
};

function uniqueCandidateApplications(
  rows: CandidateApplicationRow[],
): CandidateApplication[] {
  const byDancer = new Map<
    string,
    { candidate: CandidateApplication; priority: number }
  >();
  for (const row of rows) {
    const priority = row.confirmed_at ? 2 : row.status === "accepted" ? 1 : 0;
    const current = byDancer.get(row.dancer_id);
    if (!current || priority > current.priority) {
      byDancer.set(row.dancer_id, {
        candidate: { applicationId: row.id, dancerId: row.dancer_id },
        priority,
      });
    }
  }
  return [...byDancer.values()].map(({ candidate }) => candidate);
}

// 기존 보드의 합격자 자동선별과 새 클라이언트 검토 대상 선별을 한 경로에서 처리한다.
async function candidateApplications(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  settings: Settings,
): Promise<CandidateApplication[]> {
  const { data } = await admin
    .from("applications")
    .select("id, dancer_id, status, confirmed_at")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .in("status", ["pending", "accepted"])
    .not("dancer_id", "is", null);
  const rows = (data ?? []) as CandidateApplicationRow[];
  if (settings.clientReview?.enabled) {
    const candidateStatuses = normalizeCandidateStatuses(
      settings.clientReview.candidateStatuses,
    );
    return uniqueCandidateApplications(
      rows.filter((row) =>
        applicationMatchesCandidateStatuses(
          { status: row.status, confirmedAt: row.confirmed_at },
          candidateStatuses,
        ),
      ),
    );
  }

  const accepted = rows.filter((row) => row.status === "accepted");
  const confirmed = accepted.filter((row) => row.confirmed_at);
  const selected = confirmed.length > 0 ? confirmed : accepted;
  return uniqueCandidateApplications(selected);
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
    const candidates = await candidateApplications(admin, projectId, DEFAULT_SETTINGS);
    if (candidates.length)
      await admin
        .from("casting_board_members")
        .insert(
          candidates.map((candidate) => ({
            board_id: board.id as string,
            dancer_id: candidate.dancerId,
            application_id: candidate.applicationId,
          })),
        );
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
  const { error } = await supabase
    .from("casting_boards")
    .update(patch)
    .eq("id", boardId)
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}

// 현재 보드 설정의 후보 상태와 동기화한다.
// 검토 모드에서는 기존 선택 이력을 보존하기 위해 후보를 upsert하고, 읽기 시 상태 필터를 적용한다.
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
  const { data: boardData } = await admin
    .from("casting_boards")
    .select("id, settings")
    .eq("id", boardId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!boardData) return { ok: false, error: "보드를 찾을 수 없습니다." };
  const settings = (boardData.settings ?? {}) as Settings;
  const candidates = await candidateApplications(admin, projectId, settings);

  if (!settings.clientReview?.enabled) {
    await admin.from("casting_board_members").delete().eq("board_id", boardId);
  }
  if (candidates.length) {
    await admin
      .from("casting_board_members")
      .upsert(
        candidates.map((candidate) => ({
          board_id: boardId,
          dancer_id: candidate.dancerId,
          application_id: candidate.applicationId,
        })),
        { onConflict: "board_id,dancer_id" },
      );
  }
  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true, data: { count: candidates.length } };
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
    .select("id, title, share_code, project_id, settings, review_token_version")
    .eq("id", boardId)
    .maybeSingle();
  if (!board || board.project_id !== projectId)
    return { ok: false, error: "보드를 찾을 수 없습니다." };

  const settings = (board.settings ?? {}) as Settings;
  const url = settings.clientReview?.enabled
    ? `https://deetz.kr/review/${makeCastingReviewToken(
        board.id as string,
        Number(board.review_token_version ?? 1),
      )}`
    : `https://deetz.kr/cast/${board.share_code as string}`;
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
  const { data: board } = await admin
    .from("casting_boards")
    .select("id")
    .eq("id", boardId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!board) return { ok: false, error: "보드를 찾을 수 없습니다." };
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
