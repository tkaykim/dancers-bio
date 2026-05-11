"use client";

import { createClient } from "@/lib/supabase/browser";
import {
  PORTFOLIO_UPLOADS_BUCKET,
  validatePortfolioPdfFile,
} from "./portfolio-uploads";

export type UploadPortfolioResult =
  | { ok: true; storagePath: string }
  | { ok: false; error: string };

/**
 * Upload a PDF portfolio directly from the browser into the private
 * `portfolio-uploads` bucket. Returns the storage path so the server
 * action can fetch the bytes with a service-role client and pass them
 * to Anthropic. The server action is responsible for deleting the
 * object after parsing.
 */
export async function uploadPortfolioPdfFromBrowser(
  file: File,
  ownerId: string,
): Promise<UploadPortfolioResult> {
  const valid = validatePortfolioPdfFile(file);
  if (!valid.ok) return valid;

  const path = `${ownerId}/portfolio_${Date.now()}.pdf`;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(PORTFOLIO_UPLOADS_BUCKET)
    .upload(path, file, { upsert: false, contentType: "application/pdf" });
  if (error) {
    return { ok: false, error: `PDF 업로드 실패: ${error.message}` };
  }
  return { ok: true, storagePath: path };
}
