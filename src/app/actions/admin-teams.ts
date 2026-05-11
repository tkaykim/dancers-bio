"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadSlug(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  return (data?.slug as string | null) ?? null;
}

function revalidateAfterMutation(id: string, slug: string | null) {
  revalidatePath("/dancers");
  revalidatePath("/admin/teams");
  revalidatePath("/admin");
  revalidatePath("/me/teams");
  revalidatePath(`/t/${id}`);
  if (slug) revalidatePath(`/t/${slug}`);
}

export async function approveTeamAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.is_admin) return { ok: false, error: "관리자만 가능합니다." };

  const id = (formData.get("id") ?? "").toString();
  if (!UUID_RE.test(id)) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({
      approval_status: "approved",
      approval_reject_reason: null,
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const slug = await loadSlug(id);
  revalidateAfterMutation(id, slug);
  return { ok: true };
}

export async function rejectTeamAction(
  formData: FormData,
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.is_admin) return { ok: false, error: "관리자만 가능합니다." };

  const id = (formData.get("id") ?? "").toString();
  const reason = (formData.get("reason") ?? "").toString().trim();
  if (!UUID_RE.test(id)) return { ok: false, error: "잘못된 요청입니다." };
  if (!reason) return { ok: false, error: "거부 사유를 입력해 주세요." };
  if (reason.length > 500) {
    return { ok: false, error: "거부 사유는 500자 이내로 작성해 주세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("teams")
    .update({
      approval_status: "rejected",
      approval_reject_reason: reason,
      approved_at: new Date().toISOString(),
      approved_by: profile.id,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const slug = await loadSlug(id);
  revalidateAfterMutation(id, slug);
  return { ok: true };
}
