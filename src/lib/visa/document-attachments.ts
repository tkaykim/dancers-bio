export const VISA_DOCUMENTS_BUCKET = "visa-documents";
export const VISA_ACTIVITY_PHOTO_MIN_COUNT = 4;
export const VISA_ATTACHMENT_MAX_SORT_ORDER = 32_767;
export const VISA_IMAGE_OPTIMIZE_THRESHOLD_BYTES = 6 * 1024 * 1024;

export const VISA_ATTACHMENT_KINDS = [
  "passport_copy",
  "dancer_profile",
  "id_photo",
  "activity_photo",
] as const;

export type VisaAttachmentKind = (typeof VISA_ATTACHMENT_KINDS)[number];

export type VisaDocumentAttachment = {
  id: string;
  kind: VisaAttachmentKind;
  sortOrder: number;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  viewUrl: string | null;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

export function normalizeVisaAttachmentMimeType(fileName: string, mimeType: string): string | null {
  const normalizedMime = mimeType.trim().toLowerCase() === "image/jpg"
    ? "image/jpeg"
    : mimeType.trim().toLowerCase();
  if (normalizedMime in EXTENSION_BY_MIME) return normalizedMime;
  const extension = fileName.trim().toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXTENSION[extension] ?? null;
}

export function shouldOptimizeVisaImage(input: {
  name: string;
  type: string;
  size: number;
}): boolean {
  const mimeType = normalizeVisaAttachmentMimeType(input.name, input.type);
  return mimeType !== null
    && ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    && input.size > VISA_IMAGE_OPTIMIZE_THRESHOLD_BYTES;
}

export function visaAttachmentExtension(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType] ?? null;
}

export function validateVisaAttachmentMetadata(input: {
  kind: VisaAttachmentKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}): { ok: true; mimeType: string; extension: string } | { ok: false; error: string } {
  const originalName = input.originalName.trim();
  if (!originalName || originalName.length > 255) {
    return { ok: false, error: "invalid_name" };
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1) {
    return { ok: false, error: "empty_file" };
  }
  const mimeType = normalizeVisaAttachmentMimeType(originalName, input.mimeType);
  if (!mimeType) return { ok: false, error: "unsupported_file_type" };
  if ((input.kind === "id_photo" || input.kind === "activity_photo") && mimeType === "application/pdf") {
    return { ok: false, error: "image_required" };
  }
  const extension = visaAttachmentExtension(mimeType);
  if (!extension) return { ok: false, error: "unsupported_file_type" };
  return { ok: true, mimeType, extension };
}

export function visaAttachmentRequirementsMet(attachments: VisaDocumentAttachment[]): boolean {
  const count = (kind: VisaAttachmentKind) => attachments.filter((item) => item.kind === kind).length;
  return count("passport_copy") === 1
    && count("dancer_profile") === 1
    && count("id_photo") === 1
    && count("activity_photo") >= VISA_ACTIVITY_PHOTO_MIN_COUNT;
}

export function nextAvailableActivitySlot(attachments: VisaDocumentAttachment[]): number | null {
  const used = new Set(
    attachments
      .filter((item) => item.kind === "activity_photo")
      .map((item) => item.sortOrder),
  );
  for (let slot = 0; slot <= VISA_ATTACHMENT_MAX_SORT_ORDER; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return null;
}

export function formatVisaAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
