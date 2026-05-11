export const PORTFOLIO_UPLOADS_BUCKET = "portfolio-uploads";
export const MAX_PORTFOLIO_PDF_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_PORTFOLIO_MIME = ["application/pdf"] as const;

export function validatePortfolioPdfFile(
  file: File,
): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: "파일을 선택해 주세요." };
  if (file.size > MAX_PORTFOLIO_PDF_BYTES) {
    return { ok: false, error: "PDF는 10MB 이하만 업로드할 수 있습니다." };
  }
  if (!(ALLOWED_PORTFOLIO_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, error: "PDF 파일만 업로드할 수 있습니다." };
  }
  return { ok: true };
}

export function isValidPortfolioStoragePath(
  path: string,
  ownerId: string,
): boolean {
  if (!path || !ownerId) return false;
  // path must start with "<ownerId>/"
  if (!path.startsWith(`${ownerId}/`)) return false;
  // No traversal, reasonable length
  if (path.includes("..") || path.length > 256) return false;
  return true;
}
