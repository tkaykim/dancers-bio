"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;

function generateCode(): string {
  // 6 digits, no leading-zero issue: 100000-999999 inclusive
  return String(100000 + Math.floor(Math.random() * 900000));
}

type RequestData = {
  code: string;
  instagram_handle: string;
  expires_at: string;
};

export async function requestInstagramVerification(
  formData: FormData,
): Promise<ActionResult<RequestData>> {
  const user = await requireUser();
  const handleRaw = (formData.get("instagram_handle") ?? "").toString().trim();
  const handle = handleRaw.replace(/^@/, "").trim();
  if (!handle || !HANDLE_RE.test(handle)) {
    return {
      ok: false,
      error: "올바른 인스타그램 핸들을 입력해 주세요. (영문/숫자/./_, 최대 30자)",
    };
  }
  // Lite: claim 본인확인용일 때 claim_request_id 를 함께 저장.
  // 같은 사용자가 동시에 creator-perm용 + claim용을 동시에 가질 수 있으니
  // 'pending' 검색은 (profile_id, claim_request_id) 쌍 기준으로 한다.
  const claimRequestId = (formData.get("claim_request_id") ?? "").toString().trim() || null;

  const supabase = await createClient();

  let existingQ = supabase
    .from("instagram_verifications")
    .select("id, code, instagram_handle, expires_at")
    .eq("profile_id", user.id)
    .eq("status", "pending");
  existingQ = claimRequestId
    ? existingQ.eq("claim_request_id", claimRequestId)
    : existingQ.is("claim_request_id", null);
  const { data: existing } = await existingQ.maybeSingle();

  if (existing) {
    if (new Date(existing.expires_at).getTime() > Date.now()) {
      // reuse the same code, optionally update handle if changed
      if (existing.instagram_handle !== handle) {
        await supabase
          .from("instagram_verifications")
          .update({ instagram_handle: handle })
          .eq("id", existing.id);
      }
      revalidatePath("/verify-instagram");
      return {
        ok: true,
        data: {
          code: existing.code,
          instagram_handle: handle,
          expires_at: existing.expires_at,
        },
      };
    }
    // expired — flip then create new
    await supabase
      .from("instagram_verifications")
      .update({ status: "expired" })
      .eq("id", existing.id);
  }

  const code = generateCode();
  const { data, error } = await supabase
    .from("instagram_verifications")
    .insert({
      profile_id: user.id,
      code,
      instagram_handle: handle,
      status: "pending",
      claim_request_id: claimRequestId,
    })
    .select("code, instagram_handle, expires_at")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath("/verify-instagram");
  return {
    ok: true,
    data: {
      code: data.code,
      instagram_handle: data.instagram_handle,
      expires_at: data.expires_at,
    },
  };
}

export async function approveInstagramVerificationAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.is_admin) {
    return { ok: false, error: "관리자만 가능합니다." };
  }
  const id = (formData.get("id") ?? "").toString();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();

  // 1) IG verification 자체 승인 (기존 RPC). creator-perm 발급도 같이 일어남.
  //    (claim 전용이라도 RPC를 우회하기보다 호출하는 편이 코드 일관성·SECURITY DEFINER 활용 측면 유리.)
  const { error } = await supabase.rpc("approve_instagram_verification", {
    p_verification_id: id,
    p_reviewer_id: profile.id,
  });
  if (error) {
    if (error.message === "admin only") {
      return { ok: false, error: "관리자 권한 확인에 실패했습니다. 다시 로그인해 주세요." };
    }
    return { ok: false, error: error.message };
  }

  // 2) claim 연결이 있는 경우: claim_request 승인 + dancers.profile_id 설정.
  const { data: verif } = await supabase
    .from("instagram_verifications")
    .select("claim_request_id, profile_id")
    .eq("id", id)
    .maybeSingle();

  if (verif?.claim_request_id) {
    const { data: claim } = await supabase
      .from("dancer_claim_requests")
      .select("id, dancer_id, requester_id, status")
      .eq("id", verif.claim_request_id)
      .maybeSingle();

    if (claim && claim.status === "pending") {
      // dancer.profile_id 설정 — 이미 다른 사용자가 점유했으면 skip
      const { data: dancer } = await supabase
        .from("dancers")
        .select("id, profile_id")
        .eq("id", claim.dancer_id)
        .maybeSingle();

      if (dancer && !dancer.profile_id) {
        await supabase
          .from("dancers")
          .update({ profile_id: claim.requester_id })
          .eq("id", claim.dancer_id);
      }

      await supabase
        .from("dancer_claim_requests")
        .update({
          status: "approved",
          responded_at: new Date().toISOString(),
          responded_by: profile.id,
        })
        .eq("id", claim.id);
    }
  }

  revalidatePath("/admin/verifications");
  return { ok: true };
}

export async function rejectInstagramVerificationAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.is_admin) {
    return { ok: false, error: "관리자만 가능합니다." };
  }
  const id = (formData.get("id") ?? "").toString();
  const reason = (formData.get("reason") ?? "").toString().trim() || null;
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_instagram_verification", {
    p_verification_id: id,
    p_reviewer_id: profile.id,
    p_reason: reason ?? undefined,
  });
  if (error) {
    if (error.message === "admin only") {
      return { ok: false, error: "관리자 권한 확인에 실패했습니다. 다시 로그인해 주세요." };
    }
    return { ok: false, error: error.message };
  }

  // claim 연결이 있는 경우: claim_request도 같이 reject.
  const { data: verif } = await supabase
    .from("instagram_verifications")
    .select("claim_request_id")
    .eq("id", id)
    .maybeSingle();
  if (verif?.claim_request_id) {
    await supabase
      .from("dancer_claim_requests")
      .update({
        status: "rejected",
        reject_reason: reason,
        responded_at: new Date().toISOString(),
        responded_by: profile.id,
      })
      .eq("id", verif.claim_request_id)
      .eq("status", "pending");
  }

  revalidatePath("/admin/verifications");
  return { ok: true };
}
