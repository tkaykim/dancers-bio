"use client";

import { createClient } from "@/lib/supabase/browser";
import { VISA_DOCUMENTS_BUCKET } from "@/lib/visa/document-attachments";

export async function uploadVisaAttachmentToSignedUrl(input: {
  file: File;
  storagePath: string;
  token: string;
  mimeType: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(VISA_DOCUMENTS_BUCKET)
    .uploadToSignedUrl(input.storagePath, input.token, input.file, {
      contentType: input.mimeType,
      cacheControl: "3600",
    });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
