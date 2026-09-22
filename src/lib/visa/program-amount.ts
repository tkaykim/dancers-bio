// 프로그램(트레이닝 패키지) 결제 링크 금액.
//
// 관리자가 링크를 발급할 때 금액을 직접 정하고, 그 값은 payment_meta.issued_amount_krw 에 남는다.
// grigoent 결제 서버는 /api/visa/payment-context 로 이 값을 받아 청구 금액으로 쓴다.
// 오디션 참가비 10만원을 이미 낸 지원자는 기본값이 3,900,000원이다(프로그램 비용에 포함된 금액).

export const PROGRAM_BASE_KRW = 4_000_000;
export const AUDITION_FEE_KRW = 100_000;

// grigoent visa-payment-ref.ts 의 LINK_AMOUNT_MIN/MAX_KRW 와 같은 범위를 쓴다.
export const PROGRAM_AMOUNT_MIN_KRW = 10_000;
export const PROGRAM_AMOUNT_MAX_KRW = 20_000_000;

type PaymentSnapshot = {
  payment_status?: string | null;
  payment_meta?: unknown;
};

function metaOf(row: PaymentSnapshot): Record<string, unknown> {
  return row.payment_meta && typeof row.payment_meta === "object"
    ? (row.payment_meta as Record<string, unknown>)
    : {};
}

/** 이 케이스에서 오디션 참가비가 결제됐는지. 프로그램 링크로 넘어간 뒤에도 보관 이력으로 판단한다. */
export function hasPaidAuditionFee(row: PaymentSnapshot): boolean {
  const meta = metaOf(row);
  const issued = typeof meta.issued_product_slug === "string" ? meta.issued_product_slug : "audition-fee";
  if (row.payment_status === "paid" && issued === "audition-fee") return true;
  const completed = Array.isArray(meta.completed_payments) ? meta.completed_payments : [];
  return completed.some(
    (item) =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).product_slug === "audition-fee" &&
      (item as Record<string, unknown>).status === "paid",
  );
}

/** 현재 발급된 프로그램 링크의 금액. 없으면 null(=요금제 기본 금액으로 결제). */
export function issuedProgramAmount(row: PaymentSnapshot): number | null {
  const meta = metaOf(row);
  if (meta.issued_product_slug !== "training-and-placement") return null;
  const amount = meta.issued_amount_krw;
  return typeof amount === "number" &&
    Number.isInteger(amount) &&
    amount >= PROGRAM_AMOUNT_MIN_KRW &&
    amount <= PROGRAM_AMOUNT_MAX_KRW
    ? amount
    : null;
}

/** 링크 발급 화면의 기본 금액. */
export function defaultProgramAmount(row: PaymentSnapshot): number {
  return (
    issuedProgramAmount(row) ??
    (hasPaidAuditionFee(row) ? PROGRAM_BASE_KRW - AUDITION_FEE_KRW : PROGRAM_BASE_KRW)
  );
}
