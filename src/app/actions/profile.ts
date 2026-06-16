"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/profile";
import type { ActionResult } from "./auth";

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const rawAvatarUrl = (formData.get("avatar_url") ?? "").toString().trim();
  const parsed = profileUpdateSchema.safeParse({
    display_name: formData.get("display_name"),
    bio: formData.get("bio") || null,
    avatar_url: rawAvatarUrl ? rawAvatarUrl : null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  // 전화번호(선택): 입력하면 검증·정규화해 저장, 비우면 변경하지 않음.
  const digits = (formData.get("phone") ?? "").toString().replace(/[^0-9]/g, "");
  let phoneUpdate: { phone?: string } = {};
  if (digits) {
    if (!/^01[016789]\d{7,8}$/.test(digits))
      return {
        ok: false,
        error: "올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)",
      };
    const phone =
      digits.length === 11
        ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
        : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    phoneUpdate = { phone };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      bio: parsed.data.bio ?? null,
      ...(parsed.data.avatar_url ? { avatar_url: parsed.data.avatar_url } : {}),
      ...phoneUpdate,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath(`/u/${user.id}`);
  return { ok: true };
}
