export const PROFILE_PHOTOS_BUCKET = "profile-photos";
export const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export function profilePhotosPublicPrefix(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${PROFILE_PHOTOS_BUCKET}/`;
}

export function isValidProfilePhotoUrl(url: string): boolean {
  const prefix = profilePhotosPublicPrefix();
  // Reject when the env is missing so we never accept arbitrary URLs.
  if (prefix === "/storage/v1/object/public/profile-photos/") return false;
  return url.startsWith(prefix) && url.length <= prefix.length + 256;
}

export function validateAvatarFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: "파일을 선택해 주세요." };
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "이미지는 10MB 이하만 업로드할 수 있습니다." };
  }
  if (!(ALLOWED_AVATAR_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다." };
  }
  return { ok: true };
}
