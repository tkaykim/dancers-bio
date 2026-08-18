"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/profile";
import { parseInternationalPhone } from "@/lib/phone";
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

  const phoneUnavailable = ["true", "on"].includes(
    (formData.get("phone_unavailable") ?? "").toString(),
  );
  let phone: string | null = null;
  if (!phoneUnavailable) {
    const parsedPhone = parseInternationalPhone(
      (formData.get("phone") ?? "").toString(),
      (formData.get("phone_country") ?? "KR").toString(),
    );
    if (!parsedPhone.ok) {
      return { ok: false, error: parsedPhone.error };
    }
    phone = parsedPhone.e164;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      bio: parsed.data.bio ?? null,
      ...(parsed.data.avatar_url ? { avatar_url: parsed.data.avatar_url } : {}),
      phone,
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath(`/u/${user.id}`);
  return { ok: true };
}
