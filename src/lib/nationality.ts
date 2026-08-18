import { COUNTRIES } from "@/lib/data/countries";

export type NationalityOption = {
  code: string;
  label: string;
};

export const MAX_NATIONALITIES = 10;
const VALID_NATIONALITY_CODES = new Set(COUNTRIES.map((country) => country.code));

/**
 * JSONB로 저장된 국적 목록을 안전하게 화면·지원서용 값으로 정규화한다.
 * 클라이언트가 보낸 값은 서버에서 다시 검증하므로 임의 객체가 그대로 노출되지 않는다.
 */
export function normalizeNationalityOptions(value: unknown): NationalityOption[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: NationalityOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const code = String((item as { code?: unknown }).code ?? "")
      .trim()
      .toUpperCase();
    const label = String((item as { label?: unknown }).label ?? "").trim();
    if (
      !VALID_NATIONALITY_CODES.has(code) ||
      !label ||
      label.length > 100 ||
      seen.has(code)
    ) {
      continue;
    }
    seen.add(code);
    result.push({ code, label });
    if (result.length >= MAX_NATIONALITIES) break;
  }
  return result;
}
