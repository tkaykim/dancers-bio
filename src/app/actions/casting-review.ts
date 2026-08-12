"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCastingReviewToken } from "@/lib/quick-token";
import {
  applicationMatchesCandidateStatuses,
  normalizeCandidateStatuses,
  normalizeClientDecision,
  type ClientDecision,
  type ClientReviewSettings,
} from "@/lib/casting/review";
import type { ActionResult } from "./auth";

type ReviewBoardRow = {
  id: string;
  project_id: string;
  share_code: string;
  settings: { clientReview?: ClientReviewSettings } | null;
  is_active: boolean;
  expires_at: string | null;
  review_token_version: number;
};

type ReviewMemberRow = {
  id: string;
  board_id: string;
  dancer_id: string | null;
  application_id: string | null;
  sort_order: number;
  display_name: string | null;
  korean_name: string | null;
  gender: string | null;
  height_cm: number | null;
  client_decision: ClientDecision;
  client_note: string | null;
};

type DecisionInput = {
  memberId: string;
  decision: ClientDecision;
  note: string | null;
};

function usableReviewBoard(
  board: ReviewBoardRow,
  version: number,
): boolean {
  if (board.review_token_version !== version || board.is_active === false) {
    return false;
  }
  if (board.expires_at && new Date(board.expires_at).getTime() < Date.now()) {
    return false;
  }
  return board.settings?.clientReview?.enabled === true;
}

function parseDecisionInputs(raw: FormDataEntryValue | null): DecisionInput[] | null {
  try {
    const parsed = JSON.parse((raw ?? "[]").toString());
    if (!Array.isArray(parsed) || parsed.length > 300) return null;
    const byMember = new Map<string, DecisionInput>();
    for (const item of parsed) {
      const memberId =
        item && typeof item.memberId === "string" ? item.memberId.trim() : "";
      const decision = normalizeClientDecision(item?.decision);
      const note = typeof item?.note === "string" ? item.note.trim() : "";
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          memberId,
        ) ||
        !decision ||
        note.length > 500
      ) {
        return null;
      }
      byMember.set(memberId, { memberId, decision, note: note || null });
    }
    return [...byMember.values()];
  } catch {
    return null;
  }
}

// 비로그인 클라이언트가 서명 링크로 후보 선택 결과를 한 번에 제출한다.
// application.status는 건드리지 않고 casting_board_members에만 기록한다.
export async function submitCastingBoardReviewAction(
  fd: FormData,
): Promise<ActionResult<{ updated: number }>> {
  const token = (fd.get("review_token") ?? "").toString().trim();
  const reviewerName = (fd.get("reviewer_name") ?? "").toString().trim();
  const verified = verifyCastingReviewToken(token);
  const decisions = parseDecisionInputs(fd.get("decisions"));
  if (!verified || !decisions) {
    return { ok: false, error: "검토 링크 또는 제출 내용이 올바르지 않습니다." };
  }
  if (reviewerName.length < 1 || reviewerName.length > 80) {
    return { ok: false, error: "검토자 이름을 입력해 주세요." };
  }
  if (decisions.length === 0) {
    return { ok: false, error: "변경된 선택이 없습니다." };
  }

  const admin = createAdminClient();
  const { data: boardData } = await admin
    .from("casting_boards")
    .select(
      "id, project_id, share_code, settings, is_active, expires_at, review_token_version",
    )
    .eq("id", verified.boardId)
    .maybeSingle();
  const board = boardData as ReviewBoardRow | null;
  if (!board || !usableReviewBoard(board, verified.version)) {
    return { ok: false, error: "만료되었거나 철회된 검토 링크입니다." };
  }

  const memberIds = decisions.map((decision) => decision.memberId);
  const { data: memberData } = await admin
    .from("casting_board_members")
    .select(
      "id, board_id, dancer_id, application_id, sort_order, display_name, korean_name, gender, height_cm, client_decision, client_note",
    )
    .eq("board_id", board.id)
    .in("id", memberIds);
  const members = (memberData ?? []) as ReviewMemberRow[];
  const memberById = new Map(members.map((member) => [member.id, member]));
  if (members.length !== memberIds.length) {
    return { ok: false, error: "검토 대상이 변경되었습니다. 페이지를 새로고침해 주세요." };
  }

  const applicationIds = members
    .map((member) => member.application_id)
    .filter((id): id is string => Boolean(id));
  const { data: applicationData } = applicationIds.length
    ? await admin
        .from("applications")
        .select("id, status, confirmed_at")
        .in("id", applicationIds)
        .is("archived_at", null)
    : { data: [] };
  const applicationById = new Map(
    ((applicationData ?? []) as Array<{
      id: string;
      status: string;
      confirmed_at: string | null;
    }>).map((application) => [application.id, application]),
  );
  const candidateStatuses = normalizeCandidateStatuses(
    board.settings?.clientReview?.candidateStatuses,
  );
  for (const member of members) {
    if (!member.application_id) continue;
    const application = applicationById.get(member.application_id);
    if (
      !application ||
      !applicationMatchesCandidateStatuses(
        { status: application.status, confirmedAt: application.confirmed_at },
        candidateStatuses,
      )
    ) {
      return {
        ok: false,
        error: "지원 상태가 변경되었습니다. 페이지를 새로고침해 주세요.",
      };
    }
  }

  const changed = decisions
    .map((input) => ({ input, member: memberById.get(input.memberId)! }))
    .filter(
      ({ input, member }) =>
        input.decision !== member.client_decision ||
        input.note !== (member.client_note ?? null),
    );
  if (changed.length === 0) {
    return { ok: true, data: { updated: 0 } };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("casting_board_members")
    .upsert(
      changed.map(({ input, member }) => ({
        id: member.id,
        board_id: member.board_id,
        dancer_id: member.dancer_id,
        application_id: member.application_id,
        sort_order: member.sort_order,
        display_name: member.display_name,
        korean_name: member.korean_name,
        gender: member.gender,
        height_cm: member.height_cm,
        client_decision: input.decision,
        client_note: input.note,
        client_decided_at: now,
        client_decided_by: reviewerName,
      })),
      { onConflict: "id" },
    );
  if (updateError) {
    return { ok: false, error: "검토 결과 저장에 실패했습니다." };
  }

  await admin.from("casting_board_review_events").insert(
    changed.map(({ input, member }) => ({
      board_id: board.id,
      member_id: member.id,
      application_id: member.application_id,
      previous_decision: member.client_decision,
      decision: input.decision,
      actor_kind: "client",
      actor_name: reviewerName,
    })),
  );
  await admin
    .from("casting_boards")
    .update({
      review_submitted_at: now,
      review_submitted_by: reviewerName,
      updated_at: now,
    })
    .eq("id", board.id);

  revalidatePath(`/review/${token}`);
  revalidatePath(`/projects/${board.project_id}/applicants`);
  return { ok: true, data: { updated: changed.length } };
}

// 관리자가 클라이언트의 selected 결과만 실제 수락 또는 확정으로 반영한다.
// hold/excluded는 자동 거절하지 않아 외부 거절 메일의 오발송을 막는다.
export async function applyCastingBoardReviewAction(
  fd: FormData,
): Promise<ActionResult<{ updated: number }>> {
  const user = await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!boardId || !projectId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "클라이언트 선택을 반영할 권한이 없습니다." };
  }

  const admin = createAdminClient();
  const { data: boardData } = await admin
    .from("casting_boards")
    .select("id, project_id, settings")
    .eq("id", boardId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!boardData) return { ok: false, error: "보드를 찾을 수 없습니다." };
  const settings = (boardData.settings ?? {}) as {
    clientReview?: ClientReviewSettings;
  };
  const applyAs =
    settings.clientReview?.applySelectedAs === "confirmed"
      ? "confirmed"
      : "accepted";

  const { data: selectedData } = await admin
    .from("casting_board_members")
    .select("id, application_id")
    .eq("board_id", boardId)
    .eq("client_decision", "selected")
    .not("application_id", "is", null);
  const selected = (selectedData ?? []) as Array<{
    id: string;
    application_id: string;
  }>;
  const selectedApplicationIds = [
    ...new Set(selected.map((row) => row.application_id)),
  ];
  if (selectedApplicationIds.length === 0) {
    return { ok: false, error: "선택된 지원자가 없습니다." };
  }

  const candidateStatuses = normalizeCandidateStatuses(
    settings.clientReview?.candidateStatuses,
  );
  const { data: eligibleData } = await admin
    .from("applications")
    .select("id, status, confirmed_at")
    .eq("project_id", projectId)
    .in("id", selectedApplicationIds)
    .is("archived_at", null);
  const applicationIds = ((eligibleData ?? []) as Array<{
    id: string;
    status: string;
    confirmed_at: string | null;
  }>)
    .filter((application) =>
      applicationMatchesCandidateStatuses(
        {
          status: application.status,
          confirmedAt: application.confirmed_at,
        },
        candidateStatuses,
      ),
    )
    .map((application) => application.id);
  if (applicationIds.length === 0) {
    return {
      ok: false,
      error: "선택된 지원자의 상태가 변경되었습니다. 보드를 다시 확인해 주세요.",
    };
  }

  const now = new Date().toISOString();
  const patch =
    applyAs === "confirmed"
      ? {
          status: "accepted" as const,
          responded_at: now,
          rejection_reason: null,
          confirmed_at: now,
          confirmed_by: user.id,
        }
      : {
          status: "accepted" as const,
          responded_at: now,
          rejection_reason: null,
        };
  const supabase = await createClient();
  const { data: updatedData, error } = await supabase
    .from("applications")
    .update(patch)
    .eq("project_id", projectId)
    .in("id", applicationIds)
    .in("status", ["pending", "accepted"])
    .is("archived_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const updated = (updatedData ?? []) as Array<{ id: string }>;

  const memberByApplication = new Map(
    selected.map((row) => [row.application_id, row.id]),
  );
  if (updated.length > 0) {
    await admin.from("casting_board_review_events").insert(
      updated.map((row) => ({
        board_id: boardId,
        member_id: memberByApplication.get(row.id) ?? null,
        application_id: row.id,
        previous_decision: "selected",
        decision: "selected",
        actor_kind: "manager",
        actor_profile_id: user.id,
        actor_name: applyAs === "confirmed" ? "확정 반영" : "수락 반영",
      })),
    );
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { updated: updated.length } };
}

// 기존 서명 링크를 철회하고 새 링크를 만들기 위한 버전 증가.
export async function regenerateCastingReviewLinkAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireUser();
  const boardId = (fd.get("board_id") ?? "").toString().trim();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  if (!boardId || !projectId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  if (!(await canManageProject(projectId))) {
    return { ok: false, error: "검토 링크를 재발급할 권한이 없습니다." };
  }

  const admin = createAdminClient();
  const { data: board } = await admin
    .from("casting_boards")
    .select("review_token_version")
    .eq("id", boardId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!board) return { ok: false, error: "보드를 찾을 수 없습니다." };
  const nextVersion = Number(board.review_token_version ?? 1) + 1;
  const { error } = await admin
    .from("casting_boards")
    .update({ review_token_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("id", boardId)
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/applicants`);
  return { ok: true };
}
