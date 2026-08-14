"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTriageBuckets } from "@/lib/scoring/triage-data";
import type { ActionResult } from "./auth";

/**
 * 트리아지 A등급 일괄 승인.
 *
 * 안전장치 (docs/QUALITY_PLAN.md §2):
 *  1. 관리자만.
 *  2. 화면에서 넘어온 id 를 그대로 믿지 않고, 서버에서 트리아지를 **다시 계산**해
 *     autoApprovable=true 인 교집합만 승인한다(중복 후보·정보부족이 섞여 들어오는 것 차단).
 *  3. 1회 호출 상한 300건 — 실수로 전량이 나가는 것을 막는 폭주 가드.
 *  4. **승인 알림톡을 보내지 않는다.** 개별 승인(approveDancerAction)과 다른 점이다.
 *     일괄 승인은 수백 건 동시 발송이 되므로 외부 발송은 대표 승인 후 별도 실행한다.
 */

const MAX_PER_CALL = 300;

export type BulkApproveResult = ActionResult & {
  approved?: number;
  skipped?: number;
};

export async function bulkApproveTierAAction(
  formData: FormData,
): Promise<BulkApproveResult> {
  const profile = await requireProfile();
  if (!profile.is_admin) {
    return { ok: false, error: "관리자만 가능합니다." };
  }

  const requested = formData.getAll("id").map((v) => v.toString());
  if (requested.length === 0) {
    return { ok: false, error: "선택된 프로필이 없습니다." };
  }

  // 서버에서 재계산 — 화면 상태가 오래됐거나 조작됐어도 A등급만 통과한다.
  const buckets = await loadTriageBuckets();
  const approvable = new Set(
    buckets.A.filter((r) => r.triage.autoApprovable).map((r) => r.id),
  );
  const targets = requested.filter((id) => approvable.has(id));
  const skipped = requested.length - targets.length;

  if (targets.length === 0) {
    return {
      ok: false,
      error: "승인 가능한 대상이 없습니다. 목록을 새로고침해 주세요.",
    };
  }
  if (targets.length > MAX_PER_CALL) {
    return {
      ok: false,
      error: `한 번에 최대 ${MAX_PER_CALL}건까지 승인할 수 있습니다. (요청 ${targets.length}건)`,
    };
  }

  // admin_bulk_approve_dancers 는 service_role 에만 EXECUTE 가 있고,
  // 내부에서 pending 인 행만 갱신하며 approved_at 을 채운다.
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_bulk_approve_dancers", {
    p_ids: targets,
    p_note: `bulk:tierA:${profile.id}`,
  });
  if (error) return { ok: false, error: error.message };

  const approved = Array.isArray(data) ? data.length : targets.length;

  revalidatePath("/admin/dancers");
  revalidatePath("/admin/dancers/triage");
  revalidatePath("/admin");
  revalidatePath("/dancers");

  return { ok: true, approved, skipped };
}
