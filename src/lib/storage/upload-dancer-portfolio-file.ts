"use client";

import { createClient } from "@/lib/supabase/browser";
import {
  DANCER_PORTFOLIO_BUCKET,
  validatePortfolioFile,
} from "./dancer-portfolio-file";

export type UploadPortfolioFileResult =
  | {
      ok: true;
      url: string;
      path: string;
      name: string;
      size: number;
      mime: string;
    }
  | { ok: false; error: string };

// dancer 본인 포트폴리오 1개 업로드. path = {dancer_id}/portfolio-file/{timestamp}-{name}
// RLS: portfolio-media INSERT policy = dancer.profile_id = auth.uid() (or admin).
export async function uploadDancerPortfolioFileFromBrowser(
  file: File,
  dancerId: string,
): Promise<UploadPortfolioFileResult> {
  const valid = validatePortfolioFile(file);
  if (!valid.ok) return valid;

  // 파일명 정리: 한글/공백/특수문자 제거하여 storage path 안전화.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${dancerId}/portfolio-file/${Date.now()}-${safeName}`;

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(DANCER_PORTFOLIO_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) {
    return { ok: false, error: `업로드 실패: ${error.message}` };
  }

  const { data } = supabase.storage
    .from(DANCER_PORTFOLIO_BUCKET)
    .getPublicUrl(path);

  return {
    ok: true,
    url: data.publicUrl,
    path,
    name: file.name,
    size: file.size,
    mime: file.type,
  };
}
