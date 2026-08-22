/**
 * 공고 언어 판별.
 *
 * 왜 필요한가
 *   deetz 공고 대부분은 한국어지만, 외국인 댄서만 뽑는 공고는 본문 전체가 영어다
 *   (예: 4wbhr5 "[China Tour] Male Idol Solo Concert Dancer Audition" — 공고문에
 *   "Applicants with Korean or Japanese nationality are not eligible" 이 적혀 있다).
 *   그런 공고에서도 에러·라벨이 전부 한국어로 나가면 지원자는 왜 막혔는지 모른다.
 *   실제로 그 공고 지원자가 "모집 정원이 마감되었습니다."만 보고 인스타 DM으로 "??" 를 보냈다.
 *
 * 왜 공고 본문으로 판별하나
 *   운영자가 공고마다 언어 플래그를 켜 주기를 기대할 수 없다. 4wbhr5 에도 아무도 켜지
 *   않았을 것이다. 반면 공고문 자체는 이미 그 공고가 누구를 향하는지 말하고 있다.
 *   실제 데이터에서 두 부류는 겹치지 않는다 — 한국어 공고는 한글 비중이 최소 0.87,
 *   영문 공고(4wbhr5)는 한글 0자 / 라틴문자 774자다. 임계값 0.1 이면 양쪽 다 안전하다.
 *
 * 우선순위: 공고 본문 > Accept-Language > 한국어
 *   본문을 브라우저 언어보다 위에 두는 이유 — 한국어 공고를 영어 브라우저로 열었을 때
 *   한국어 본문 주위만 영어 껍데기를 씌우면 오히려 읽기 나빠진다. 공고 언어가 곧
 *   그 공고가 말을 거는 대상의 언어다. Accept-Language 는 본문이 짧아 판단이 서지
 *   않을 때(제목만 있는 공고 등)만 쓴다.
 */

export type Locale = "ko" | "en";

export const DEFAULT_LOCALE: Locale = "ko";

/** 한글 음절·자모 */
const HANGUL = /[\uac00-\ud7a3\u1100-\u11ff\u3130-\u318f]/g;
const LATIN = /[A-Za-z]/g;

/** 한글 비중이 이 값 미만이면 영문 공고로 본다. */
const HANGUL_RATIO_MIN = 0.1;
/** 글자 수가 이보다 적으면 판단을 보류한다(짧은 제목만으로 단정하지 않는다). */
const MIN_LETTERS = 12;

/** 공고 제목·본문 등에서 언어를 추정한다. 판단이 서지 않으면 null. */
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
  }
  return null;
}

/** 공고 본문 → Accept-Language → 한국어 순으로 언어를 정한다. */
export function resolveLocale(input: {
  /** 공고 제목·본문 등. 이게 1순위 근거다. */
  text?: Array<string | null | undefined>;
  acceptLanguage?: string | null;
}): Locale {
  return (
    (input.text ? detectLocaleFromText(...input.text) : null) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    DEFAULT_LOCALE
  );
}
