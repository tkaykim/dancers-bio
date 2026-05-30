"use server";

import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeScores, type RecomputeSummary } from "@/lib/scoring/recompute";
import type { ActionResult } from "./auth";

/**
 * 경력 점수 전체 재계산 (관리자 전용). 사전/가중치 변경 후 호출.
 */
export async function recomputeAllScoresAction(): Promise<
  ActionResult<RecomputeSummary>
> {
  await requireAdmin();
  try {
    const admin = createAdminClient();
    const summary = await recomputeScores(admin);
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
