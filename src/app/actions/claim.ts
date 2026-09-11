"use server";

import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { serverT } from "@/lib/i18n/server";
import actions from "@/lib/i18n/messages/actions";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function claimDancerProfileAction(
  formData: FormData,
): Promise<Result<{ claim_request_id: string; dancer_id: string }>> {
  const profile = await requireProfile();
  const t = await serverT(actions);
  const dancer_id = String(formData.get("dancer_id") ?? "");
  const relation = String(formData.get("relation") ?? "self");
  const message = String(formData.get("message") ?? "").trim();

  if (!dancer_id) {
    return { ok: false, error: t("common.invalid_request") };
  }
  if (!["self", "manager", "other"].includes(relation)) {
    return { ok: false, error: t("claim.relation_required") };
  }
  if (message.length > 1000) {
    return { ok: false, error: t("claim.message_max") };
  }

  const supabase = await createClient();

  // Verify target is a curation profile (profile_id IS NULL)
  const { data: dancer, error: dancerErr } = await supabase
    .from("dancers")
    .select("id, profile_id, stage_name")
    .eq("id", dancer_id)
    .maybeSingle();
  if (dancerErr || !dancer) {
    return { ok: false, error: t("dancer.not_found") };
  }
  if (dancer.profile_id) {
    return { ok: false, error: t("claim.already_owned") };
  }

  // 기존 pending 요청이 있으면 그것을 그대로 사용 (Idempotent — 재시도가 IG 인증 단계로 자연 진입).
  const { data: existing } = await supabase
    .from("dancer_claim_requests")
    .select("id")
    .eq("dancer_id", dancer_id)
    .eq("requester_id", profile.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      data: { claim_request_id: existing.id as string, dancer_id },
    };
  }

  const { data: inserted, error } = await supabase
    .from("dancer_claim_requests")
    .insert({
      dancer_id,
      requester_id: profile.id,
      relation,
      message: message || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: t("claim.already_requested") };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    data: { claim_request_id: inserted.id as string, dancer_id },
  };
}
