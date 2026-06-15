// 정산 금액 계산 유틸 (서버·클라이언트 공용, 순수 함수).
// 원천징수 기본 3.3% (소득세 3% + 지방소득세 0.3%). 세액은 원 단위 절사(버림).

export const DEFAULT_WITHHOLDING_RATE = 0.033;

export type SettlementStatus = "pending" | "requested" | "paid" | "cancelled";

export function calcSettlement(
  gross: number,
  rate: number = DEFAULT_WITHHOLDING_RATE,
): { gross: number; tax: number; net: number; rate: number } {
  const g = Math.max(0, Math.round(gross || 0));
  const r = rate >= 0 && rate < 1 ? rate : DEFAULT_WITHHOLDING_RATE;
  const tax = Math.floor(g * r); // 원 단위 절사
  return { gross: g, tax, net: g - tax, rate: r };
}

export function formatWon(n: number): string {
  return `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
}

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: "정산금액 확정",
  requested: "출금신청 완료 · 입금대기",
  paid: "입금완료",
  cancelled: "취소됨",
};
