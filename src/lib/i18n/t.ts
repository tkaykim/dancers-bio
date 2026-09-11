/**
 * 순수 번역 함수. 서버·클라이언트 공용이며 부작용이 없다.
 *
 * 사전 모듈 형태 (docs/design-i18n-ui.md §3.4)
 *   const ko = { "tab.casting": "캐스팅", … } as const;
 *   type Key = keyof typeof ko;
 *   const en: Record<Key, string> = { … };
 *   const ja: Record<Key, string> = { … };
 *   const messages = { ko, en, ja } satisfies Messages<Key>;
 *   export default messages;
 *
 * 사용
 *   서버 컴포넌트·액션: const t = await serverT(messages)   (./server)
 *   클라이언트 컴포넌트: const t = useT(messages)            (./provider)
 *
 * 누락 키는 개발 모드에서 `[missing:key]` 를 돌려주고 콘솔에 남긴다. 운영에서는 ko 값으로 폴백한다.
 */
import { DEFAULT_LOCALE, LOCALE_TAGS, type Locale } from "./locale";
import { interpolate } from "./interpolate";

export type Messages<K extends string = string> = {
  readonly ko: Readonly<Record<K, string>>;
  readonly en: Readonly<Record<K, string>>;
  readonly ja: Readonly<Record<K, string>>;
};

export type KeyOf<M> = M extends { readonly ko: Readonly<Record<infer K, string>> }
  ? Extract<K, string>
  : never;

export type Vars = Record<string, string | number>;
export type Translator<M> = (key: KeyOf<M>, vars?: Vars) => string;

export function translator<M extends Messages>(messages: M, locale: Locale): Translator<M> {
  const table = (messages[locale] ?? messages[DEFAULT_LOCALE]) as Readonly<Record<string, string>>;
  const base = messages[DEFAULT_LOCALE] as Readonly<Record<string, string>>;
  return (key, vars) => {
    let raw = table[key];
    if (raw === undefined || raw === "") {
      if (process.env.NODE_ENV !== "production") {
        console.error(`[i18n] missing ${locale}:${key}`);
        raw = base[key] ?? `[missing:${key}]`;
      } else {
        raw = base[key] ?? "";
      }
    }
    return interpolate(raw, vars);
  };
}

/**
 * 기수 복수형 카테고리. 한국어·일본어는 항상 other, 영어는 one/other.
 * 사전 키는 `<key>_one` · `<key>_other` 두 개로 둔다.
 */
export function plural(locale: Locale, n: number): "one" | "other" {
  try {
    return new Intl.PluralRules(LOCALE_TAGS[locale]).select(n) === "one" ? "one" : "other";
  } catch {
    return n === 1 && locale === "en" ? "one" : "other";
  }
}

/** `<key>_one` / `<key>_other` 를 골라 {count} 를 채운 문장. */
export function tCount<M extends Messages>(
  t: Translator<M>,
  key: string,
  locale: Locale,
  n: number,
  vars?: Vars,
): string {
  const k = `${key}_${plural(locale, n)}` as KeyOf<M>;
  return t(k, { count: n.toLocaleString(LOCALE_TAGS[locale]), ...vars });
}

export function localeTag(locale: Locale): string {
  return LOCALE_TAGS[locale];
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale]).format(n);
}
