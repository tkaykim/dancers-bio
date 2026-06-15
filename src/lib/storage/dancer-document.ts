"use client";

import { createClient } from "@/lib/supabase/browser";

export const DANCER_DOCS_BUCKET = "dancer-docs";
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_DOC_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type DancerDocType = "id_card" | "bankbook";

export function validateDocFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "파일을 선택해 주세요." };
  if (file.size > MAX_DOC_BYTES)
    return { ok: false, error: "파일은 10MB 이하만 업로드할 수 있습니다." };
  if (!(ALLOWED_DOC_TYPES as readonly string[]).includes(file.type))
    return { ok: false, error: "JPG, PNG, WEBP, PDF만 업로드할 수 있습니다." };
  return { ok: true };
}

export type UploadDocResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

// 비공개 버킷 직접 업로드. path = {dancer_id}/docs/{doc_type}-{ts}.{ext}
// RLS(dancer-docs write) = is_admin OR can_act_as_dancer(dancer_id).
export async function uploadDancerDocFromBrowser(
  file: File,
  dancerId: string,
  docType: DancerDocType,
): Promise<UploadDocResult> {
  const valid = validateDocFile(file);
  if (!valid.ok) return valid;

  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
  const path = `${dancerId}/docs/${docType}-${Date.now()}.${ext}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(DANCER_DOCS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, error: `업로드 실패: ${error.message}` };
  return { ok: true, path };
}
