"use server";

import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function claimDancerProfileAction(
  formData: FormData,
): Promise<Result> {
  const profile = await requireProfile();
  const dancer_id = String(formData.get("dancer_id") ?? "");
  const relation = String(formData.get("relation") ?? "self");
  const message = String(formData.get("message") ?? "").trim();

  if (!dancer_id) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  if (!["self", "manager", "other"].includes(relation)) {
    return { ok: false, error: "관계 정보를 선택해 주세요." };
  }
  if (message.length > 1000) {
    return { ok: false, error: "메시지는 1000자 이내로 작성해 주세요." };
  }

  const supabase = await createClient();

  // Verify target is a curation profile (profile_id IS NULL)
  const { data: dancer, error: dancerErr } = await supabase
    .from("dancers")
    .select("id, profile_id, stage_name")
    .eq("id", dancer_id)
    .maybeSingle();
  if (dancerErr || !dancer) {
    return { ok: false, error: "댄서 프로필을 찾을 수 없습니다." };
  }
  if (dancer.profile_id) {
    return {
      ok: false,
      error: "이미 소유자가 있는 프로필입니다.",
    };
  }

  const { error } = await supabase
    .from("dancer_claim_requests")
    .insert({
      dancer_id,
      requester_id: profile.id,
      relation,
      message: message || null,
      status: "pending",
    });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "이미 신청한 프로필입니다. 관리자 처리 결과를 기다려 주세요.",
      };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
