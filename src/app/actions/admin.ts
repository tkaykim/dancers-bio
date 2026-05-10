"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "./auth";

export async function setCanCreateProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireProfile();
  if (!me.is_admin) return { ok: false, error: "관리자만 가능합니다." };

  const profile_id = (formData.get("profile_id") ?? "").toString();
  const grant = formData.get("grant") === "true";
  const reason = (formData.get("reason") ?? "").toString().trim() || null;

  if (!profile_id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("profiles")
    .update({ can_create_project: grant })
    .eq("id", profile_id);
  if (updErr) return { ok: false, error: updErr.message };

  await admin.from("creator_permission_audit").insert({
    profile_id,
    granted: grant,
    reason: reason ?? (grant ? "manual admin grant" : "manual admin revoke"),
    actor_id: me.id,
  });

  revalidatePath("/admin/users");
  return { ok: true };
}
