"use client";

import { createClient } from "@/lib/supabase/browser";

// 프로젝트 첨부파일 업로드 (브라우저 → project-files 버킷).
// 저장 경로는 안전한 영문으로 정규화하고, 원본 파일명은 별도로 보존해
// project_attachments.file_name 에 저장한다(표시용).
export const PROJECT_FILES_BUCKET = "project-files";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
] as const;

export type UploadedProjectFile = {
  path: string;
  name: string;
  size: number;
  mime: string;
};

export async function uploadProjectFileFromBrowser(
  file: File,
): Promise<{ ok: true; file: UploadedProjectFile } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: "빈 파일입니다." };
  if (file.size > MAX_BYTES)
    return { ok: false, error: "파일은 50MB 이하만 업로드할 수 있습니다." };
  if (!(ALLOWED as readonly string[]).includes(file.type))
    return { ok: false, error: "PDF·이미지(JPG/PNG/WebP)·MP4만 업로드할 수 있습니다." };

  // storage key 는 한글/공백/특수문자 불가 → 영문 정규화. 원본명은 따로 보존.
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `uploads/${Date.now()}-${rand}-${safe}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PROJECT_FILES_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { ok: false, error: `업로드 실패: ${error.message}` };

  return {
    ok: true,
    file: { path, name: file.name, size: file.size, mime: file.type },
  };
}
