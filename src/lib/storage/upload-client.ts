"use client";

import { createClient } from "@/lib/supabase/browser";
import {
  PROFILE_PHOTOS_BUCKET,
  validateAvatarFile,
} from "./profile-photos";

export type UploadAvatarResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadAvatarFromBrowser(
  file: File,
  ownerFolder: string,
  filenamePrefix: "avatar" | "profile",
): Promise<UploadAvatarResult> {
  const valid = validateAvatarFile(file);
  if (!valid.ok) return valid;

  const ext = (file.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "");
  const path = `${ownerFolder}/${filenamePrefix}_${Date.now()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, error: `이미지 업로드 실패: ${error.message}` };

  const { data } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
