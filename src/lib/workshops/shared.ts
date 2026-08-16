// deetz Workshop(수요 기반 해외 안무가 초청) 공용 타입·상수.
// 서버/클라이언트 양쪽에서 쓰므로 server-only 금지.

/**
 * 예약금·환불 고지 문구 버전. 예약 시 동의 시각과 함께 저장한다(분쟁 시 어떤 문구에 동의했는지 근거).
 * 문구(components/workshops/copy.ts POLICY_ROWS)를 고치면 이 값도 올린다.
 */
export const WORKSHOP_POLICY_VERSION = "2026-08-16";

/**
 * 결제창을 여는 동안 좌석을 잡아두는 시간(분).
 * Toss 는 승인 리다이렉트 후 10분 내 승인을 요구한다 — 그보다 살짝 길게 잡되,
 * 이탈한 사람이 남의 자리를 오래 막지 않도록 15분으로 제한한다.
 */
export const SEAT_HOLD_MINUTES = 15;

export const WORKSHOP_STATUSES = [
  "suggested",
  "published",
  "recruiting",
  "confirmed",
  "completed",
  "archived",
] as const;
export type WorkshopStatus = (typeof WORKSHOP_STATUSES)[number];

export const WORKSHOP_STATUS_LABEL: Record<WorkshopStatus, string> = {
  suggested: "제안 접수",
  published: "수요 모집",
  recruiting: "모집 오픈",
  confirmed: "초청 확정",
  completed: "진행 완료",
  archived: "보관",
};

export const RESERVATION_STATUSES = [
  "pending",
  "paid",
  "cancelled",
  "refunded",
  "transferred",
  "confirmed",
  "recovery_required",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "결제 대기",
  paid: "예약 완료",
  cancelled: "취소",
  refunded: "환불 완료",
  transferred: "양도",
  confirmed: "참가 확정",
  // 돈은 받았는데 취소·만료된 주문이라 정상 예약으로 자동 복귀시키지 않은 건. 운영자가 처리한다.
  recovery_required: "확인 필요 (결제됨)",
};

/** 공개 페이지에 카드로 노출하는 상태 (suggested/archived 제외) */
export const PUBLIC_STATUSES: WorkshopStatus[] = ["published", "recruiting", "confirmed", "completed"];

export type WorkshopArtist = {
  id: string;
  slug: string | null;
  name: string;
  instagram_handle: string;
  image_url: string | null;
  country: string | null;
  genres: string[];
  headline: string | null;
  description: string | null;
  status: WorkshopStatus;
  deposit_amount: number | null;
  total_price: number | null;
  min_headcount: number | null;
  max_headcount: number | null;
  expected_period: string | null;
  recruit_deadline: string | null;
  recruit_opened_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

/** 공개 카드에 demand/예약 집계를 붙인 형태 */
export type WorkshopArtistPublic = WorkshopArtist & {
  demand_count: number;
  reserved_count: number;
};

/** 인스타 핸들 정규화 — @, URL, 공백 제거 후 소문자. */
export function normalizeInstagramHandle(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "");
  s = s.replace(/^@+/, "");
  s = s.split(/[/?#\s]/)[0] ?? "";
  return s.toLowerCase();
}

export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${normalizeInstagramHandle(handle)}/`;
}

/** 금액 표기(원). 만원 단위가 아닌 전체 자릿수 — 결제 금액 혼동 방지. */
export function won(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 주문번호: WKS-YYMMDD-XXXXXX (KST 기준 날짜) */
export function buildWorkshopOrderNo(now: Date, random: string): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yy = String(kst.getUTCFullYear()).slice(2);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `WKS-${yy}${mm}${dd}-${random.toUpperCase()}`;
}

/** slug 자동 생성 — 영문/숫자/하이픈. 한글 등은 제거되므로 admin에서 수정 가능. */
export function suggestSlug(nameOrHandle: string): string {
  return nameOrHandle
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
