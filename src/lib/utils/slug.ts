/**
 * 사람이 읽는 이름을 URL 슬러그로 변환.
 * - 소문자화
 * - NFKD 정규화 후 악센트 분리 제거
 * - 영문/숫자/하이픈만 남김 (한글/특수문자는 제거됨 → 호출자가 비어있는 결과를 대비)
 * - 연속 하이픈 압축, 양끝 하이픈 제거
 * - 35자 제한 (충돌 시 접미사를 위한 여유)
 */
export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 35)
    .replace(/-+$/g, "");
}

/** 슬러그가 형식적으로 유효한지 (DB unique 충돌은 별도) */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(slug);
}
