"use client";

import { createClient } from "@/lib/supabase/browser";
import { compressAvatarImage } from "./image-compress";
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
  // 큰 사진(700KB+, 또는 longest side > 1600px)은 1600px JPEG 로 자동 축소.
  // GIF/SVG/이미 작은 파일은 그대로 둠.
  const compressed = await compressAvatarImage(file);

  const valid = validateAvatarFile(compressed);
  if (!valid.ok) return valid;

  const ext = (compressed.type.split("/")[1] ?? "jpg").replace(/[^a-z0-9]/gi, "");
  const path = `${ownerFolder}/${filenamePrefix}_${Date.now()}.${ext}`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PROFILE_PHOTOS_BUCKET)
    .upload(path, compressed, { upsert: true, contentType: compressed.type });
  if (error) return { ok: false, error: `이미지 업로드 실패: ${error.message}` };

  const { data } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(path);
  return { ok: true, url: data.publicUrl };
}
