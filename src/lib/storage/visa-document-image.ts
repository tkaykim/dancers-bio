"use client";

import { shouldOptimizeVisaImage } from "@/lib/visa/document-attachments";

export const VISA_IMAGE_MAX_DIMENSION = 4_096;
const VISA_IMAGE_TARGET_BYTES = 8 * 1024 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function prepareVisaAttachmentFile(file: File): Promise<{
  file: File;
  optimized: boolean;
  originalSize: number;
}> {
  if (!shouldOptimizeVisaImage(file)) {
    return { file, optimized: false, originalSize: file.size };
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, VISA_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return { file, optimized: false, originalSize: file.size };
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let best: Blob | null = null;
    for (const quality of [0.9, 0.84, 0.78]) {
      const candidate = await canvasBlob(canvas, quality);
      if (candidate && (!best || candidate.size < best.size)) best = candidate;
      if (candidate && candidate.size <= VISA_IMAGE_TARGET_BYTES) break;
    }
    if (!best || best.size >= file.size) {
      return { file, optimized: false, originalSize: file.size };
    }
    const optimizedFile = new File([best], file.name, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
    return { file: optimizedFile, optimized: true, originalSize: file.size };
  } catch {
    return { file, optimized: false, originalSize: file.size };
  }
}
