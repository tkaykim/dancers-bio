"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation/profile";
import type { ActionResult } from "./auth";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = profileUpdateSchema.safeParse({
    display_name: formData.get("display_name"),
    bio: formData.get("bio") || null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }

  const supabase = await createClient();

  // Optional avatar upload
  let avatar_url: string | undefined;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > MAX_AVATAR_BYTES) {
      return { ok: false, error: "이미지는 5MB 이하만 업로드할 수 있습니다." };
    }
    if (!ALLOWED_AVATAR_TYPES.includes(avatar.type)) {
      return { ok: false, error: "JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다." };
    }
    const ext = avatar.type.split("/")[1] ?? "jpg";
    const path = `${user.id}/avatar_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, avatar, { upsert: true, contentType: avatar.type });
    if (uploadError) {
      return { ok: false, error: `이미지 업로드 실패: ${uploadError.message}` };
    }
    const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
    avatar_url = data.publicUrl;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      bio: parsed.data.bio ?? null,
      ...(avatar_url ? { avatar_url } : {}),
    })
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/me");
  revalidatePath(`/u/${user.id}`);
  return { ok: true };
}
