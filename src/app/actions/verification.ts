"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("instagram_verifications")
    .select("id, code, instagram_handle, expires_at")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

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

  const admin = createAdminClient();
  const { error } = await admin.rpc("approve_instagram_verification", {
    p_verification_id: id,
    p_reviewer_id: profile.id,
  });
  if (error) return { ok: false, error: error.message };

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

  const admin = createAdminClient();
  const { error } = await admin.rpc("reject_instagram_verification", {
    p_verification_id: id,
    p_reviewer_id: profile.id,
    p_reason: reason ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/verifications");
  return { ok: true };
}
