export const DANCER_PORTFOLIO_BUCKET = "portfolio-media";
export const MAX_PORTFOLIO_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const ALLOWED_PORTFOLIO_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "video/mp4",
] as const;

export function portfolioFilePublicPrefix(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${DANCER_PORTFOLIO_BUCKET}/`;
}

export function isValidPortfolioFileUrl(url: string): boolean {
  const prefix = portfolioFilePublicPrefix();
  if (prefix === "/storage/v1/object/public/portfolio-media/") return false;
  return url.startsWith(prefix) && url.length <= prefix.length + 512;
}

export function validatePortfolioFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: "파일을 선택해 주세요." };
  if (file.size > MAX_PORTFOLIO_FILE_BYTES) {
    return { ok: false, error: "파일은 50MB 이하만 업로드할 수 있습니다." };
  }
  if (!(ALLOWED_PORTFOLIO_FILE_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      error: "PDF, JPG, PNG, MP4 형식만 업로드할 수 있습니다.",
    };
  }
  return { ok: true };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
