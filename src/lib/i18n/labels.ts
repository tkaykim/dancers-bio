import { DEFAULT_LOCALE, type Locale } from "./locale";
import { translator } from "./t";
import labels from "./messages/labels";

/**
 * enum 값 → 언어별 라벨 (docs/design-i18n-ui.md §3.6).
 *   labelFor("status", project.status, locale)   → "모집 중" | "Open" | "募集中"
 * 사전에 없는 값은 그대로 돌려준다(새 enum 값이 화면을 깨지 않게).
 */
export type LabelKind =
  | "visibility"
  | "status"
  | "session_type"
  | "pay_type"
  | "category"
  | "application_status"
  | "stage"
  | "source";

export function labelFor(
  kind: LabelKind,
  value: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!value) return "";
  const key = `${kind}.${value}` as keyof typeof labels.ko;
  if (!Object.hasOwn(labels.ko, key)) return value;
  return translator(labels, locale)(key);
}

/**
 * genres·regions 행의 언어별 라벨. label_<locale> → label_en → label_ko 순으로 폴백한다.
 * 지역 자유 입력(projects.region_text)은 원문이므로 여기 넣지 않는다.
 */
export type TaxonomyRow = {
  label_ko?: string | null;
  label_en?: string | null;
  label_ja?: string | null;
};

export function taxonomyLabel(row: TaxonomyRow | null | undefined, locale: Locale = DEFAULT_LOCALE): string {
  if (!row) return "";
  const byLocale = locale === "ko" ? row.label_ko : locale === "en" ? row.label_en : row.label_ja;
  return byLocale || row.label_en || row.label_ko || "";
}
