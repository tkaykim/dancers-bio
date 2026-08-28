"use client";

import { Upload } from "tus-js-client";
import { VISA_DOCUMENTS_BUCKET } from "@/lib/visa/document-attachments";
import { visaDocumentResumableEndpoint } from "@/lib/storage/visa-document-endpoint";

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

export async function uploadVisaAttachmentToSignedUrl(input: {
  file: File;
  storagePath: string;
  token: string;
  mimeType: string;
  onProgress?: (percentage: number) => void;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { ok: false, error: "Supabase Storage is unavailable." };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const upload = new Upload(input.file, {
      endpoint: visaDocumentResumableEndpoint(supabaseUrl),
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      headers: { "x-signature": input.token },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async (file) => [
        "visa-document",
        input.storagePath,
        file.size,
        file.type,
        file.lastModified,
      ].join(":"),
      chunkSize: TUS_CHUNK_BYTES,
      metadata: {
        bucketName: VISA_DOCUMENTS_BUCKET,
        objectName: input.storagePath,
        contentType: input.mimeType,
        cacheControl: "3600",
      },
      onProgress: (uploadedBytes, totalBytes) => {
        const percentage = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
        input.onProgress?.(Math.min(100, Math.max(0, percentage)));
      },
      onError: (error) => finish({ ok: false, error: error.message }),
      onSuccess: () => finish({ ok: true }),
    });

    void upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch((error: unknown) => {
        finish({ ok: false, error: error instanceof Error ? error.message : "Upload failed." });
      });
  });
}
