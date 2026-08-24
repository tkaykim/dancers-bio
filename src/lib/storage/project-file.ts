export const PROJECT_FILES_BUCKET = "project-files";
export const PROJECT_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const PROJECT_FILE_MAX_COUNT = 10;

export const PROJECT_FILE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export type ProjectFileMime = (typeof PROJECT_FILE_ALLOWED_MIME_TYPES)[number];

export type ProjectAttachmentDraft = {
  id?: string;
  path: string;
  name: string;
  size: number;
  mime: string;
};

export function isAllowedProjectFileMime(
  mime: string,
): mime is ProjectFileMime {
  return (PROJECT_FILE_ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export function isProjectImage(mime: string | null): boolean {
  return mime?.startsWith("image/") ?? false;
}

export function isProjectVideo(mime: string | null): boolean {
  return mime?.startsWith("video/") ?? false;
}
