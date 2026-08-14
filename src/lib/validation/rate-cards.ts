// 댄서 단가 카드 — 서비스 종류·국가·통화 상수 + 검증 헬퍼.
// DB: public.dancer_rate_cards (service_type enum = dancer_service_type)

export const RATE_SERVICE_TYPES = [
  "choreography_production",
  "challenge",
  "model_fee",
  "class_workshop",
  "overseas_workshop",
] as const;

export type RateServiceType = (typeof RATE_SERVICE_TYPES)[number];

export const RATE_SERVICE_LABELS: Record<RateServiceType, string> = {
  choreography_production: "안무제작",
  challenge: "챌린지 참여",
  model_fee: "모델료",
  class_workshop: "강습·워크샵 (국내)",
  overseas_workshop: "해외워크샵",
};

export const RATE_SERVICE_HINTS: Record<RateServiceType, string> = {
  choreography_production: "안무 1곡 제작 등",
  challenge: "챌린지 1편(릴스/IG 게시) 등",
  model_fee: "촬영·광고 모델 1일 등",
  class_workshop: "국내 워크샵/레슨 1회 등",
  overseas_workshop: "국가별로 단가가 다르면 나라별로 추가하세요",
};

/** 해외워크샵만 국가별 단가를 가진다. (다른 서비스는 country = null) */
export function isCountryService(t: RateServiceType): boolean {
  return t === "overseas_workshop";
}

/** 자주 쓰는 국가 (자유 입력도 허용). code = ISO 3166-1 alpha-2 */
export const COMMON_COUNTRIES: { code: string; label: string }[] = [
  { code: "JP", label: "일본" },
  { code: "US", label: "미국" },
  { code: "CN", label: "중국" },
  { code: "TW", label: "대만" },
  { code: "HK", label: "홍콩" },
  { code: "TH", label: "태국" },
  { code: "VN", label: "베트남" },
  { code: "SG", label: "싱가포르" },
  { code: "ID", label: "인도네시아" },
  { code: "PH", label: "필리핀" },
  { code: "FR", label: "프랑스" },
  { code: "DE", label: "독일" },
  { code: "GB", label: "영국" },
  { code: "AU", label: "호주" },
];

const COUNTRY_LABEL = new Map(COMMON_COUNTRIES.map((c) => [c.code, c.label]));

/** 국가코드 → 한글 라벨. null = "기본 해외" (미지정국 폴백). */
export function countryLabel(code: string | null): string {
  if (!code) return "기본 해외 (미지정국)";
  return COUNTRY_LABEL.get(code) ?? code;
}

export const CURRENCIES = ["KRW", "USD", "JPY", "EUR", "CNY", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  KRW: "₩",
  USD: "$",
  JPY: "¥",
  EUR: "€",
  CNY: "¥",
  GBP: "£",
};

/** 단가 1행을 사람이 읽는 문자열로. */
export function formatRate(opts: {
  price: number | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
}): string {
  const sym = CURRENCY_SYMBOL[(opts.currency as Currency) ?? "KRW"] ?? "";
  const fmt = (n: number) => `${sym}${n.toLocaleString()}`;
  if (opts.price != null) return fmt(opts.price);
  if (opts.price_min != null && opts.price_max != null)
    return `${fmt(opts.price_min)} ~ ${fmt(opts.price_max)}`;
  if (opts.price_min != null) return `${fmt(opts.price_min)} ~`;
  if (opts.price_max != null) return `~ ${fmt(opts.price_max)}`;
  return "미정";
}
