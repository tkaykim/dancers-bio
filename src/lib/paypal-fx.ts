// PayPal 외화 환산 정책. (grigoent /training 연동과 동일 정책 — 워크샵 예약금에서 재사용)
//
// 원칙은 원화(KRW) 결제지만 PayPal은 KRW를 지원하지 않는다(CURRENCY_NOT_SUPPORTED).
// 그래서 외화로 청구하되, 환율은 항상 시장가보다 보수적으로(1단위당 원화를 적게) 잡아
// 실제 수취 원화가 정가보다 적어지지 않게 한다.
//
// 시장 환율이 PAYPAL_KRW_PER_USD 아래로 내려가면 손실이 발생하므로 주기적으로 점검한다.

export const PAYPAL_FOREIGN_CURRENCY = (process.env.PAYPAL_FOREIGN_CURRENCY || "USD").toUpperCase();
export const PAYPAL_KRW_PER_UNIT = Number(process.env.PAYPAL_KRW_PER_USD || "1350");

export type ForeignQuote = {
  currency: string;
  amount: number;
  krwPerUnit: number;
  krwAmount: number;
};

export function foreignQuote(krwAmount: number): ForeignQuote | null {
  if (!Number.isFinite(krwAmount) || krwAmount <= 0) return null;
  if (!Number.isFinite(PAYPAL_KRW_PER_UNIT) || PAYPAL_KRW_PER_UNIT <= 0) return null;
  // 절상해서 원 단위 손실까지 제거한다.
  const amount = Math.ceil(krwAmount / PAYPAL_KRW_PER_UNIT);
  return { currency: PAYPAL_FOREIGN_CURRENCY, amount, krwPerUnit: PAYPAL_KRW_PER_UNIT, krwAmount };
}

export function formatForeign(quote: ForeignQuote): string {
  const symbol = quote.currency === "USD" ? "$" : "";
  return `${symbol}${quote.amount.toLocaleString("en-US")}${symbol ? "" : ` ${quote.currency}`}`;
}
