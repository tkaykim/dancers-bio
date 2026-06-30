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

// 금액 입력용 천단위 콤마 포맷. 숫자만 남기고 콤마 삽입(예: "1000000" → "1,000,000").
// 서버 액션의 parseWon이 콤마를 제거하므로 콤마 포함 문자열을 그대로 제출해도 안전.
export function formatWonInput(v: string | number | null | undefined): string {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

// 4단계 개념: 정산대기(금액 미입력) → 정산완료(pending+금액有) → 출금신청(requested) → 입금완료(paid)
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: "정산완료",
  requested: "출금신청",
  paid: "입금완료",
  cancelled: "취소됨",
};

// 셀프 계좌수집(/settle)은 댄서가 계좌만 내도 pending + gross=null 행을 만든다.
// 이 상태는 "정산완료"가 아니라 "정산대기(금액 미입력)" — 담당자가 금액을 확정하기 전.
export function isAwaitingAmount(
  status: SettlementStatus,
  gross: number | null | undefined,
): boolean {
  return status === "pending" && (gross == null || gross <= 0);
}

// 금액 미입력 pending 은 "정산대기"로, 그 외는 기본 라벨로 표시.
export function settlementStageLabel(
  status: SettlementStatus,
  gross: number | null | undefined,
): string {
  if (isAwaitingAmount(status, gross)) return "정산대기";
  return SETTLEMENT_STATUS_LABEL[status];
}
