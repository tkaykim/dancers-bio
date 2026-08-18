// deetz Workshop 행사(Event) 공용 타입·표기 — 서버/클라이언트 공용(server-only 금지).
//
// ⚠️ 공개 타입(PublicEventSession)에는 capacity 가 없다 — 정원은 관리자 전용이며
//    서버가 "is_closed" 불리언으로만 마감 여부를 내려보낸다(응답에 숫자 미포함).

export type EventLang = "ko" | "en";

export const EVENT_TERMS_VERSION = "events-2026-08-18";

export type PublicEvent = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  poster_url: string | null;
  country_code: string | null;
  city: string | null;
  /** 행사 통화 — 참가자 표시·PayPal 청구 통화. */
  currency: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_map_url: string | null;
  timezone: string;
  starts_on: string;
  ends_on: string;
  apply_deadline: string | null;
  status: "draft" | "open" | "closed" | "completed" | "cancelled";
  default_lang: "ko" | "en" | "ja";
};

export type PublicEventSession = {
  id: string;
  sort: number;
  session_date: string;
  start_time: string; // "15:00:00"
  end_time: string;
  title: string;
  instructor_name: string;
  instructor_instagram: string | null;
  instructor_image_url: string | null;
  dancer_slug: string | null;
  level: string | null;
  /** 행사 통화 기준 가격(정본). */
  price_local: number | null;
  /** Toss(한국 카드)용 — null 이면 해당 행사에서 Toss 옵션이 숨는다. */
  price_krw: number | null;
  price_usd: number | null;
  venue_override: string | null;
  /** 정원 도달 또는 수동 마감 — 숫자는 절대 내려보내지 않는다. */
  is_closed: boolean;
};

export type EventOrderStatus = "pending" | "paid" | "cancelled" | "refunded" | "recovery_required";

export const EVENT_ORDER_STATUS_LABEL: Record<EventOrderStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  cancelled: "취소",
  refunded: "환불 완료",
  recovery_required: "확인 필요 (결제됨)",
};

// ── 통화 ────────────────────────────────────────────────────────────────────

/** PayPal 이 주문 통화로 받는 통화들(2026 기준 주요만). 여기 없으면 USD 폴백. */
export const PAYPAL_SUPPORTED_CURRENCIES = new Set([
  "AUD","BRL","CAD","CNY","CZK","DKK","EUR","HKD","HUF","ILS","JPY","MYR","MXN",
  "TWD","NZD","NOK","PHP","PLN","GBP","SGD","SEK","CHF","THB","USD",
]);

/** 통화 표기 — 기호·소수점 자리. 없는 통화는 "CODE 1,234" 로. */
const CURRENCY_INFO: Record<string, { symbol: string; decimals: number }> = {
  KRW: { symbol: "₩", decimals: 0 },
  THB: { symbol: "฿", decimals: 0 },
  USD: { symbol: "$", decimals: 0 },
  JPY: { symbol: "¥", decimals: 0 },
  EUR: { symbol: "€", decimals: 0 },
  TWD: { symbol: "NT$", decimals: 0 },
  HKD: { symbol: "HK$", decimals: 0 },
  SGD: { symbol: "S$", decimals: 0 },
  PHP: { symbol: "₱", decimals: 0 },
  CNY: { symbol: "¥", decimals: 0 },
  GBP: { symbol: "£", decimals: 0 },
};

export function formatMoney(currency: string, amount: number): string {
  const info = CURRENCY_INFO[currency];
  const n = Number(amount).toLocaleString("en-US", {
    maximumFractionDigits: info?.decimals ?? 2,
  });
  return info ? `${info.symbol}${n}` : `${currency} ${n}`;
}

/** 개최 국가 → 통화 자동 제안 (어드민 행사 생성 폼용). */
export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  KR: "KRW", TH: "THB", JP: "JPY", US: "USD", TW: "TWD", HK: "HKD", SG: "SGD",
  PH: "PHP", CN: "CNY", GB: "GBP", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR",
  VN: "USD", ID: "USD", MY: "MYR", AU: "AUD", CA: "CAD", MX: "MXN", BR: "BRL",
};

/** 주요 타임존 (어드민 select 용). */
export const EVENT_TIMEZONES = [
  "Asia/Seoul", "Asia/Bangkok", "Asia/Tokyo", "Asia/Taipei", "Asia/Hong_Kong",
  "Asia/Singapore", "Asia/Manila", "Asia/Ho_Chi_Minh", "Asia/Jakarta", "Asia/Shanghai",
  "America/Los_Angeles", "America/New_York", "Europe/London", "Europe/Paris", "Australia/Sydney",
];

/** "15:00:00" → "15:00" */
export function hhmm(t: string): string {
  return t.slice(0, 5);
}

export function formatBaht(n: number): string {
  return `฿${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatUsd(n: number): string {
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatKrw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

/** 행사 주문번호: WKE-YYMMDD-XXXXXX (KST 기준) */
export function buildEventOrderNo(now: Date, random: string): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yy = String(kst.getUTCFullYear()).slice(2);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `WKE-${yy}${mm}${dd}-${random.toUpperCase()}`;
}

/** 행사 페이지 UI 문구 (EN/KO — 방콕 등 해외 행사는 EN 기본) */
export const ET: Record<
  EventLang,
  {
    scheduleTitle: string;
    venueLabel: string;
    deadlineLabel: string;
    closed: string;
    select: string;
    selected: string;
    perClass: string;
    totalLabel: (n: number) => string;
    registerCta: string;
    backToSchedule: string;
    formTitle: string;
    name: string;
    email: string;
    emailNote: string;
    phone: string;
    phoneOptional: string;
    agree1: string;
    agree2: string;
    agreeConfirm: string;
    createOrder: string;
    creating: string;
    payTitle: string;
    orderNoLabel: string;
    payPaypal: string;
    paypalNote: string;
    payKrw: string;
    payKrwCard: string;
    payKrwTransfer: string;
    krwNote: string;
    editInfo: string;
    errNeedFields: string;
    errAgree: string;
    errGeneric: string;
    seatErrors: Record<string, string>;
    successTitle: string;
    successBody: string;
    confirmingTitle: string;
    confirmingBody: string;
    recoveryTitle: string;
    recoveryBody: string;
    failTitle: string;
    failBody: string;
    backToEvent: string;
    contact: string;
  }
> = {
  en: {
    scheduleTitle: "Schedule",
    venueLabel: "Venue",
    deadlineLabel: "Registration closes",
    closed: "Sold out",
    select: "Select",
    selected: "Selected",
    perClass: "per class",
    totalLabel: (n) => `${n} ${n === 1 ? "class" : "classes"}`,
    registerCta: "Register",
    backToSchedule: "Back to schedule",
    formTitle: "Your info",
    name: "Name",
    email: "Email",
    emailNote: "Your ticket confirmation will be sent here.",
    phone: "Phone",
    phoneOptional: "(optional)",
    agree1: "Classes may be cancelled by the organizer — in that case you get a full refund.",
    agree2: "For cancellations or changes, reply to your confirmation email.",
    agreeConfirm: "I understand and agree.",
    createOrder: "Continue to payment",
    creating: "Reserving seats…",
    payTitle: "Payment",
    orderNoLabel: "Order",
    payPaypal: "Pay with PayPal / card",
    paypalNote: "Charged in Thai Baht. If your PayPal account does not support THB, USD is charged instead.",
    payKrw: "Pay in Korean Won",
    payKrwCard: "Korean card",
    payKrwTransfer: "Korean bank transfer",
    krwNote: "For Korean cards and bank accounts (Toss Payments).",
    editInfo: "Edit my info",
    errNeedFields: "Please enter your name and email.",
    errAgree: "Please confirm the policy above.",
    errGeneric: "Something went wrong. Please try again.",
    seatErrors: {
      NOT_OPEN: "Registration is not open right now.",
      DEADLINE: "Registration has closed.",
      SESSION_CLOSED: "One of the selected classes is closed.",
      FULL: "One of the selected classes just sold out. Please reselect.",
      DUPLICATE: "This email is already registered for one of the selected classes.",
      NO_SESSIONS: "Please select at least one class.",
      BAD_SESSION: "Please reselect your classes.",
    },
    successTitle: "You're in!",
    successBody: "A confirmation email is on its way. Show it at the door on class day.",
    confirmingTitle: "Confirming your payment",
    confirmingBody: "Hold on a moment. Please don't close this screen.",
    recoveryTitle: "Payment received",
    recoveryBody: "Your payment went through, but we need to double-check the registration. We'll email you shortly.",
    failTitle: "Payment not completed",
    failBody: "The payment was cancelled or failed. Your seats are held for a few minutes — you can try again.",
    backToEvent: "Back to event",
    contact: "Questions? contact@deetz.kr",
  },
  ko: {
    scheduleTitle: "시간표",
    venueLabel: "장소",
    deadlineLabel: "신청 마감",
    closed: "마감",
    select: "선택",
    selected: "선택됨",
    perClass: "클래스당",
    totalLabel: (n) => `${n}개 클래스`,
    registerCta: "신청하기",
    backToSchedule: "시간표로",
    formTitle: "신청자 정보",
    name: "이름",
    email: "이메일",
    emailNote: "신청 확인 메일이 이 주소로 발송됩니다.",
    phone: "휴대폰",
    phoneOptional: "(선택)",
    agree1: "주최 측 사정으로 클래스가 취소되면 전액 환불됩니다.",
    agree2: "취소·변경은 확인 메일에 회신해 주시면 처리해 드립니다.",
    agreeConfirm: "위 내용을 확인했고 동의합니다.",
    createOrder: "결제로 진행",
    creating: "자리 확보 중…",
    payTitle: "결제",
    orderNoLabel: "주문번호",
    payPaypal: "PayPal · 해외카드 결제",
    paypalNote: "태국 바트(฿)로 결제됩니다. 계정이 바트를 지원하지 않으면 달러($)로 결제됩니다.",
    payKrw: "원화(₩) 결제",
    payKrwCard: "카드",
    payKrwTransfer: "계좌이체",
    krwNote: "한국 카드·계좌용 (토스페이먼츠)",
    editInfo: "정보 수정",
    errNeedFields: "이름과 이메일을 입력해 주세요.",
    errAgree: "안내 사항에 동의해 주세요.",
    errGeneric: "오류가 발생했습니다. 다시 시도해 주세요.",
    seatErrors: {
      NOT_OPEN: "지금은 신청 기간이 아닙니다.",
      DEADLINE: "신청이 마감되었습니다.",
      SESSION_CLOSED: "선택한 클래스 중 마감된 클래스가 있습니다.",
      FULL: "선택한 클래스가 방금 마감되었습니다. 다시 선택해 주세요.",
      DUPLICATE: "이 이메일로 이미 신청된 클래스가 있습니다.",
      NO_SESSIONS: "클래스를 하나 이상 선택해 주세요.",
      BAD_SESSION: "클래스를 다시 선택해 주세요.",
    },
    successTitle: "신청이 완료되었습니다!",
    successBody: "확인 메일을 보내드렸어요. 수업 당일 입장 시 보여주시면 됩니다.",
    confirmingTitle: "결제를 확인하고 있습니다",
    confirmingBody: "잠시만 기다려 주세요. 화면을 닫지 말아 주세요.",
    recoveryTitle: "결제가 완료되었습니다",
    recoveryBody: "결제는 정상 처리됐지만 신청 확정에 확인이 필요합니다. 곧 메일로 안내드립니다.",
    failTitle: "결제가 완료되지 않았습니다",
    failBody: "결제가 취소되었거나 실패했습니다. 자리는 몇 분간 유지되니 다시 시도해 주세요.",
    backToEvent: "행사 페이지로",
    contact: "문의: contact@deetz.kr",
  },
};
