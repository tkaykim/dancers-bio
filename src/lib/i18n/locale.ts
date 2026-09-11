/**
 * 언어(locale) 모델과 판별 규칙. 서버·클라이언트·미들웨어가 함께 쓴다(부작용 없음).
 *
 * 두 종류의 언어가 있다 (docs/design-i18n-ui.md §3.1).
 *   - 요청 언어(requested): 이용자가 원한 언어. `?lang=` → 쿠키 → Accept-Language → ko.
 *     쿠키·프로필에는 항상 이 값을 저장한다. 기존 다국어 기능(비자·워크숍·빌리지·프로그램·
 *     간편접수·영상제출)은 이 값을 쓴다.
 *   - UI 언어(ui): 전역 문구(셸·피드·공고·인증·내 계정)가 쓰는 언어. 요청 언어에
 *     운영 경로 강제 ko 와 플래그 `UI_LOCALES` 를 적용한 값이다.
 *
 * 공고 본문 언어 판별(detectLocaleFromText)은 /apply·/submit 이 공고 언어를 먼저 보기 위한 것이다.
 *   deetz 공고 대부분은 한국어지만, 외국인 댄서만 뽑는 공고는 본문 전체가 영어다
 *   (예: 4wbhr5 "[China Tour] Male Idol Solo Concert Dancer Audition"). 그런 공고에서
 *   에러·라벨이 전부 한국어로 나가면 지원자는 왜 막혔는지 모른다.
 *   실제 데이터에서 한국어 공고는 한글 비중이 최소 0.87, 영문 공고는 한글 0자라 임계값 0.1이면 안전하다.
 */

export const LOCALES = ["ko", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

/** 이용자가 고른 언어를 담는 쿠키. 비밀이 아니므로 httpOnly 를 켜지 않는다. */
export const LOCALE_COOKIE = "deetz_lang";
/** 미들웨어 → 서버 컴포넌트·액션. 전역 문구용 UI 언어. */
export const UI_LOCALE_HEADER = "x-locale";
/** 미들웨어 → 서버 컴포넌트·액션. 강등 전 요청 언어(기능 사전용). */
export const REQUESTED_LOCALE_HEADER = "x-locale-requested";

/** 언어 전환기·메타데이터에서 쓰는 자기 표기. 번역하지 않는다. */
export const LOCALE_LABELS: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

/** Intl·<html lang>·JSON-LD inLanguage 용 BCP 47 태그. */
export const LOCALE_TAGS: Record<Locale, string> = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * 플래그 `UI_LOCALES` 로 열린 언어 집합. 쉼표 구분("ko,en").
 * 미설정 시 운영(production)은 ko 만, 프리뷰·로컬은 세 언어 전부다 —
 * 프리뷰 QA 가 플래그 없이도 돌아가야 하기 때문이다(docs/SPEC-DELTA-i18n-ui.md).
 * ko 는 항상 포함한다.
 */
export function enabledLocales(): Set<Locale> {
  const raw = process.env.UI_LOCALES?.trim();
  const set = new Set<Locale>([DEFAULT_LOCALE]);
  if (raw) {
    for (const part of raw.split(",")) {
      const v = part.trim().toLowerCase();
      if (isLocale(v)) set.add(v);
    }
    return set;
  }
  if (process.env.VERCEL_ENV === "production") return set;
  for (const l of LOCALES) set.add(l);
  return set;
}

/**
 * 관리자·운영 경로는 항상 한국어 UI 다. 세그먼트 경계로 판정한다
 * (`/admin`, `/admin/...` 은 잡고 `/administer` 는 잡지 않는다).
 */
const FORCED_KO_PATH = /^\/(admin|ops|ndol|channels)(\/|$)/;
export function isForcedKoPath(pathname: string): boolean {
  return FORCED_KO_PATH.test(pathname);
}

/** 한글 음절·자모 */
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/g;
const LATIN = /[A-Za-z]/g;

/** 한글 비중이 이 값 미만이면 영문 공고로 본다. */
const HANGUL_RATIO_MIN = 0.1;
/** 글자 수가 이보다 적으면 판단을 보류한다(짧은 제목만으로 단정하지 않는다). */
const MIN_LETTERS = 12;

/** 공고 제목·본문 등에서 언어를 추정한다. 판단이 서지 않으면 null. (ko | en 만 낸다) */
export function detectLocaleFromText(
  ...parts: Array<string | null | undefined>
): Locale | null {
  const text = parts.filter(Boolean).join(" ");
  const hangul = text.match(HANGUL)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  const letters = hangul + latin;
  if (letters < MIN_LETTERS) return null;
  return hangul / letters < HANGUL_RATIO_MIN ? "en" : "ko";
}

/** "ko-KR,ko;q=0.9,en-US;q=0.8" 에서 우리가 아는 첫 언어를 고른다. */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { tag: rawTag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag.startsWith("ko")) return "ko";
    if (tag.startsWith("en")) return "en";
    if (tag.startsWith("ja")) return "ja";
  }
  return null;
}

/**
 * 요청 언어 결정(미들웨어가 쓴다). `?lang=` → 쿠키 → Accept-Language → ko.
 */
export function resolveRequestedLocale(input: {
  queryLang?: string | null;
  cookieLang?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.queryLang)) return input.queryLang;
  if (isLocale(input.cookieLang)) return input.cookieLang;
  return localeFromAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LOCALE;
}

/** 요청 언어에 운영 경로 강제 ko 와 플래그를 적용한 UI 언어. */
export function resolveUiLocale(requested: Locale, pathname: string): Locale {
  if (isForcedKoPath(pathname)) return DEFAULT_LOCALE;
  return enabledLocales().has(requested) ? requested : DEFAULT_LOCALE;
}

/**
 * 공고 본문 → fallback 순으로 언어를 정하는 순수 함수.
 * fallback 은 호출자가 미리 정한 요청 언어다(서버에서는 `localeFor()` 가 이를 감싼다).
 * `acceptLanguage` 는 옛 호출자 호환용이며, fallback 이 없을 때만 본다.
 */
export function resolveLocale(input: {
  /** 공고 제목·본문 등. 이게 1순위 근거다. */
  text?: Array<string | null | undefined>;
  fallback?: Locale | null;
  acceptLanguage?: string | null;
}): Locale {
  return (
    (input.text ? detectLocaleFromText(...input.text) : null) ??
    input.fallback ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
