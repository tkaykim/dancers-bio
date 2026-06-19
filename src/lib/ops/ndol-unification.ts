export const NDOL_UNIFIED_PARENT_SHORT_CODE = "ndol26";

export const NDOL_UNIFIED_SHORT_CODES = [
  "ndol26",
  "ndol02",
  "ndolsm",
  "ndolbd",
  "ndol37",
  "ndoldc",
  "ndolha",
  "ndolhl",
  "ndolhy",
  "ndoljh",
  "ndolka",
  "ndolkm",
  "ndolsj",
  "ndolsp",
  "ay25bg",
  "zudrz5",
] as const;

const LEGACY_SHORT_CODES: ReadonlySet<string> = new Set(
  NDOL_UNIFIED_SHORT_CODES.filter(
    (code) => code !== NDOL_UNIFIED_PARENT_SHORT_CODE,
  ),
);

export function isNdolUnifiedLegacyShortCode(
  shortCode: string | null | undefined,
): boolean {
  return !!shortCode && LEGACY_SHORT_CODES.has(shortCode);
}
