/**
 * 경력 title 키워드 → "프로 근접도" 티어 사전.
 *
 * 데이터 부트스트랩: 실제 careers.title 빈도 마이닝(2026-05 기준)으로 1차안 구성.
 * 운영하며 스폿체크로 보강한다. 모든 매칭은 대소문자 무시 substring.
 *
 * 한 title이 여러 티어에 매칭되면 **가장 높은 티어**의 배수만 적용한다(곱하지 않음).
 *  - 예: "YG 빅히트 콘서트" → S(YG) 매칭 → ×TIER_MULTIPLIER.S
 */

export type KeywordTier = "S" | "A" | "B";

/** 티어별 배수. none(매칭 없음)은 1.0. */
export const TIER_MULTIPLIER: Record<KeywordTier, number> = {
  S: 2.0,
  A: 1.5,
  B: 1.2,
};

/**
 * Tier S — 최정상 소속사·아티스트·초대형 무대/크루.
 * "실제 프로페셔널과 맞닿음"의 최강 신호.
 */
const TIER_S: string[] = [
  // 메이저 소속사
  "sm ", "sm엔터", "에스엠", "yg", "jyp", "제이와이피", "hybe", "하이브", "빅히트",
  "더블랙레이블", "블랙레이블",
  // 빅네임 아티스트
  "방탄", "bts", "블랙핑크", "blackpink", "에스파", "aespa", "뉴진스", "newjeans",
  "르세라핌", "le sserafim", "아이브", "ive", "세븐틴", "seventeen", "스트레이키즈",
  "stray kids", "엑소", "exo", "트와이스", "twice", "있지", "itzy", "엔시티", "nct",
  // 월드클래스 크루
  "원밀리언", "밀리언", "1million", "스우파", "스트릿우먼", "swf", "저스트절크",
  "저스트저크", "just jerk",
  // 초대형 무대/대회
  "올림픽", "빌보드", "billboard", "코첼라", "coachella", "월드투어", "world tour",
  "월드오브댄스", "world of dance", "wod",
  // 메인 음악방송
  "엠카운트다운", "뮤직뱅크", "인기가요", "음악중심",
];

/**
 * Tier A — 유명 소속사/스튜디오/방송사/브랜드/대형 행사.
 */
const TIER_A: string[] = [
  // 유명 크루/스튜디오
  "ygx", "프리픽스", "prepix", "라치카", "lachica", "홀리뱅", "holybang",
  "코카앤버터", "코카n버터", "딥앤댑", "deepndap", "가비", "gabee", "웨이비", "wayb",
  "프라우드몬스터", "잼리퍼블릭",
  // 방송사
  "kbs", "mbc", "sbs", "mnet", "엠넷", "jtbc", "tvn",
  // 브랜드/매체
  "나이키", "nike", "삼성", "samsung", "현대", "hyundai", "보그", "vogue", "엘르",
  "화보", "광고", "cf", "디올", "dior", "샤넬", "chanel", "구찌", "gucci",
  // 대형 무대/행사
  "콘서트", "시상식", "페스티벌", "갈라", "단독콘서트", "팬미팅", "국가대표",
  "뮤직비디오", "뮤비", "mv", "뮤지컬", "영화", "드라마",
  // 아이돌/가수 일반
  "아이돌", "가수", "데뷔", "컴백",
];

/**
 * Tier B — 일반 전문 활동(강의·대회·심사 등). 약한 가산.
 */
const TIER_B: string[] = [
  "강사", "트레이너", "아카데미", "티칭", "워크샵", "워크숍", "workshop",
  "대회", "우승", "입상", "수상", "심사", "초청", "디렉터", "director", "안무감독",
];

const TIERS: Array<{ tier: KeywordTier; words: string[] }> = [
  { tier: "S", words: TIER_S },
  { tier: "A", words: TIER_A },
  { tier: "B", words: TIER_B },
];

/**
 * title에서 매칭되는 가장 높은 키워드 티어를 반환. 없으면 null.
 * S > A > B 순으로 먼저 매칭되는 티어를 채택.
 */
export function matchKeywordTier(title: string | null | undefined): KeywordTier | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const { tier, words } of TIERS) {
    for (const w of words) {
      if (t.includes(w)) return tier;
    }
  }
  return null;
}

/** title의 키워드 티어 배수 (매칭 없으면 1.0). */
export function keywordMultiplier(title: string | null | undefined): number {
  const tier = matchKeywordTier(title);
  return tier ? TIER_MULTIPLIER[tier] : 1.0;
}
