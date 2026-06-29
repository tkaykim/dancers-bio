"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
import type { ActionResult } from "./auth";

const STAGE = "prescreen";

export type EvaluationRow = {
  evaluatorId: string;
  evaluatorName: string;
  evaluatorAvatar: string | null;
  score: number;
  comment: string | null;
  isMine: boolean;
  updatedAt: string;
};

// 지원 1건의 평가 목록(사전선별 stage) — 같은 프로젝트 담당자는 전원 조회. RLS가 게이트.
export async function listApplicationEvaluationsAction(
  applicationId: string,
): Promise<ActionResult<{ evaluations: EvaluationRow[]; myScore: number | null }>> {
  const user = await requireUser();
  if (typeof applicationId !== "string" || !applicationId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("application_evaluations")
    .select(
      "evaluator_id, score, comment, updated_at, evaluator:profiles!application_evaluations_evaluator_id_fkey ( display_name, avatar_url )",
    )
    .eq("application_id", applicationId)
    .eq("stage", STAGE)
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  type Row = {
    evaluator_id: string;
    score: number;
    comment: string | null;
    updated_at: string;
    evaluator:
      | { display_name: string | null; avatar_url: string | null }
      | Array<{ display_name: string | null; avatar_url: string | null }>
      | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const evaluations: EvaluationRow[] = rows.map((r) => {
    const prof = Array.isArray(r.evaluator) ? r.evaluator[0] ?? null : r.evaluator;
    return {
      evaluatorId: r.evaluator_id,
      evaluatorName: prof?.display_name ?? "(이름 없음)",
      evaluatorAvatar: prof?.avatar_url ?? null,
      score: r.score,
      comment: r.comment,
      isMine: r.evaluator_id === user.id,
      updatedAt: r.updated_at,
    };
  });
  const myScore = evaluations.find((e) => e.isMine)?.score ?? null;
  return { ok: true, data: { evaluations, myScore } };
}

// 내 평가 저장(upsert) — 점수는 필수(1~10), 코멘트는 선택. RLS가 담당자·본인만 통과시킨다.
export async function upsertApplicationEvaluationAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const applicationId = (formData.get("application_id") ?? "").toString();
  const scoreRaw = (formData.get("score") ?? "").toString();
  const comment = (formData.get("comment") ?? "").toString().trim();
  const score = Number(scoreRaw);
  if (!applicationId) return { ok: false, error: "잘못된 요청입니다." };
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return { ok: false, error: "점수는 1~10 사이여야 합니다." };
  }

  const supabase = await createClient();
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("project_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  const { error } = await supabase.from("application_evaluations").upsert(
    {
      application_id: applicationId,
      evaluator_id: user.id,
      stage: STAGE,
      score,
      comment: comment || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "application_id,evaluator_id,stage" },
  );
  if (error) {
    if (error.code === "42501") {
      return { ok: false, error: "이 지원자를 평가할 권한이 없습니다." };
    }
    return { ok: false, error: humanizeDbError(error.message) };
  }
  revalidatePath(`/projects/${app.project_id as string}/applicants`);
  return { ok: true };
}

// 내 평가 삭제(점수 비우기).
export async function deleteApplicationEvaluationAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const applicationId = (formData.get("application_id") ?? "").toString();
  if (!applicationId) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("applications")
    .select("project_id")
    .eq("id", applicationId)
    .maybeSingle();

  const { error } = await supabase
    .from("application_evaluations")
    .delete()
    .eq("application_id", applicationId)
    .eq("evaluator_id", user.id)
    .eq("stage", STAGE);
  if (error) return { ok: false, error: humanizeDbError(error.message) };
  if (app?.project_id) {
    revalidatePath(`/projects/${app.project_id as string}/applicants`);
  }
  return { ok: true };
}

// 확정 토글 — 수락된 지원자만 확정 가능(거절·대기는 불가). 확정 해제는 항상 허용.
// status는 그대로 두고 confirmed_at 플래그만 set/unset (기존 accepted 쿼리 보존).
export async function setApplicationConfirmedAction(
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const applicationId = (formData.get("application_id") ?? "").toString();
  const confirmed = (formData.get("confirmed") ?? "").toString() === "1";
  if (!applicationId) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("project_id, status, confirmed_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  // 방어적 권한 재확인 (RLS도 막지만 명확한 에러 메시지를 위해).
  if (!(await canManageProject(app.project_id as string))) {
    return { ok: false, error: "확정할 권한이 없습니다." };
  }
  if (confirmed && app.status !== "accepted") {
    return { ok: false, error: "수락한 지원자만 확정할 수 있습니다." };
  }

  const update = confirmed
    ? { confirmed_at: new Date().toISOString(), confirmed_by: user.id }
    : { confirmed_at: null, confirmed_by: null };
  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", applicationId);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  revalidatePath(`/projects/${app.project_id as string}/applicants`);
  revalidatePath(`/projects/${app.project_id as string}`);
  return { ok: true };
}
