import type { Locale } from "@/lib/i18n/locale";

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

/**
 * 공고 언어에 맞춘 금액 표기. 영문 공고 참여자에게 나가는 정산 메일에 쓴다.
 * "원"을 그대로 붙이면 영문 메일 한복판에 한글이 남는다.
 */
export function formatMoney(n: number, locale: Locale): string {
  const amount = Math.round(n || 0);
  return locale === "en"
    ? `KRW ${amount.toLocaleString("en-US")}`
    : `${amount.toLocaleString("ko-KR")}원`;
}

// 금액 입력용 천단위 콤마 포맷. 숫자만 남기고 콤마 삽입(예: "1000000" → "1,000,000").
// 서버 액션의 parseWon이 콤마를 제거하므로 콤마 포함 문자열을 그대로 제출해도 안전.
export function formatWonInput(v: string | number | null | undefined): string {
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

// ── 역할·세무 차원 (스태프 정산 풀 — docs/design-staff-settlement-pool.md) ──
// dancer·travel = 직접비 / staff·referral = 풀 분배 / other = 예외.
export type SettlementRole = "dancer" | "travel" | "staff" | "referral" | "other";
export type SettlementTaxMode = "withholding" | "invoice";

export const SETTLEMENT_ROLE_LABEL: Record<SettlementRole, string> = {
  dancer: "출연료",
  travel: "교통비",
  staff: "스태프",
  referral: "소개비",
  other: "기타",
};

export const DIRECT_COST_ROLES: readonly SettlementRole[] = ["dancer", "travel"];

export function settlementRoleLabel(role: string | null | undefined): string {
  return SETTLEMENT_ROLE_LABEL[(role ?? "dancer") as SettlementRole] ?? "기타";
}

/**
 * 실제 이체될 금액(현금 기준) — 원장·이체파일·알림 표시가 모두 이 값을 쓴다.
 * withholding: 세전 − 3.3%(원단위 절사) / invoice(사업자): 세전 + 부가세(부가세 포함 전달).
 * 풀 차감은 항상 gross(공급가) — 부가세는 매입세액공제로 회수되므로 비용이 아니다.
 */
export function calcPayout(input: {
  gross: number;
  rate?: number;
  taxMode?: SettlementTaxMode | string | null;
  vatAmount?: number | null;
}): { gross: number; tax: number; vat: number; transfer: number } {
  const g = Math.max(0, Math.round(input.gross || 0));
  if ((input.taxMode ?? "withholding") === "invoice") {
    const vat = Math.max(0, Math.round(input.vatAmount ?? 0));
    return { gross: g, tax: 0, vat, transfer: g + vat };
  }
  const c = calcSettlement(g, input.rate ?? DEFAULT_WITHHOLDING_RATE);
  return { gross: c.gross, tax: c.tax, vat: 0, transfer: c.net };
}

// 4단계 개념: 정산 확정 대기(금액 미입력) → 정산 확정(pending+금액有, 잔액 반영)
//            → 지급 처리 중(requested, 구 경로 잔여) → 입금완료(paid)
// 라벨 정본 — 옛 "정산완료"는 금액 확정을 뜻했는데 "돈 다 받음"으로 읽혀 CS를
// 만들었다. "출금 가능"도 잔액을 출금한 뒤에는 거짓이 되므로, 행의 사실만
// 말하는 "정산 확정"으로 교체(확정 대기 → 정산 확정 사다리). 2026-08-27.
export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: "정산 확정",
  requested: "지급 처리 중",
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

// 금액 미입력 pending 은 "정산 확정 대기"로, 그 외는 기본 라벨로 표시.
export function settlementStageLabel(
  status: SettlementStatus,
  gross: number | null | undefined,
): string {
  if (isAwaitingAmount(status, gross)) return "정산 확정 대기";
  return SETTLEMENT_STATUS_LABEL[status];
}
