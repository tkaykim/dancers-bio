"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { humanizeDbError } from "@/lib/db-errors";
import { getRoundMessage, normalizeRounds } from "@/lib/application-stage";
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

// 최종 합격 토글 — 마지막 선발 단계로 올리거나(확정) 직전 단계로 내린다(해제).
// status는 accepted 그대로 두고 passed_round + confirmed_at 만 움직인다(기존 accepted 쿼리 보존).
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
    .select("project_id, status, confirmed_at, applicant_id, dancer_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (fetchErr || !app) return { ok: false, error: "지원 정보를 찾을 수 없습니다." };

  // 방어적 권한 재확인 (RLS도 막지만 명확한 에러 메시지를 위해).
  if (!(await canManageProject(app.project_id as string))) {
    return { ok: false, error: "확정할 권한이 없습니다." };
  }
  if (confirmed && app.status !== "accepted") {
    return { ok: false, error: "합격 처리된 지원자만 최종 합격할 수 있습니다." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("selection_rounds, round_labels, round_messages")
    .eq("id", app.project_id as string)
    .maybeSingle();
  const total = normalizeRounds(
    (project?.selection_rounds as number | null) ?? null,
  );

  // 확정 = 마지막 단계 통과. 해제 = 직전 단계로 되돌림(1단계 공고는 1차에 머문다).
  const update = confirmed
    ? {
        passed_round: total,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
      }
    : {
        passed_round: Math.max(total - 1, 1),
        confirmed_at: null,
        confirmed_by: null,
      };
  const { error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", applicationId);
  if (error) return { ok: false, error: humanizeDbError(error.message) };

  // 최종 합격 시 본인에게 안내 발송 — 이 시점부터 직접 포기가 막히므로 반드시 알린다.
  // 해제 후 재확정해도 중복 발송되지 않는다(project_notification_log 멱등).
  if (confirmed && app.applicant_id && app.project_id) {
    try {
      const { sendStageEmail } = await import("@/lib/notify/stage-mail");
      const msg = getRoundMessage(project?.round_messages, total);
      await sendStageEmail({
        applicantId: app.applicant_id as string,
        dancerId: (app.dancer_id as string | null) ?? null,
        projectId: app.project_id as string,
        round: total,
        totalRounds: total,
        roundLabels: (project?.round_labels as string[] | null) ?? null,
        bodyOverride: msg.body,
        note: msg.note,
      });
    } catch (e) {
      console.error("[stage-mail] 발송 실패:", e);
    }
  }

  revalidatePath(`/projects/${app.project_id as string}/applicants`);
  revalidatePath(`/projects/${app.project_id as string}`);
  return { ok: true };
}
