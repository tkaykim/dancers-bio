// 매출채권(받을 돈) 공용 타입·라벨 — 설계 정본 docs/design-client-receivables.md rev1.
// 서버·클라이언트 공용(순수 상수/함수만, server-only 금지).

export type DealPricingModel =
  | "fixed"
  | "per_unit"
  | "min_guarantee_plus_unit"
  | "revenue_share"
  | "composite";

export type DealStatus = "negotiating" | "active" | "completed" | "cancelled";

export type RevenueLineType =
  | "base"
  | "installment"
  | "unit_billing"
  | "option"
  | "expense_rebill"
  | "revenue_share"
  | "adjustment";

export type RevenueLineStatus =
  | "draft"
  | "confirmed"
  | "invoiced"
  | "received"
  | "cancelled";

export const PRICING_MODEL_LABELS: Record<DealPricingModel, string> = {
  fixed: "정액",
  per_unit: "단가 × 수량",
  min_guarantee_plus_unit: "최소보장 + 초과 단가",
  revenue_share: "매출 배분(RS%)",
  composite: "혼합",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  negotiating: "협의중",
  active: "진행중",
  completed: "완료",
  cancelled: "취소",
};

export const LINE_TYPE_LABELS: Record<RevenueLineType, string> = {
  base: "기본",
  installment: "분할(계약금/잔금)",
  unit_billing: "단가×수량 확정",
  option: "옵션(+α)",
  expense_rebill: "실비 재청구",
  revenue_share: "매출 배분",
  adjustment: "정정(±)",
};

export const LINE_STATUS_LABELS: Record<RevenueLineStatus, string> = {
  draft: "초안",
  confirmed: "확정",
  invoiced: "계산서 발행",
  received: "수납 완료",
  cancelled: "취소",
};

// 채권으로 집계하는 라인 상태(설계 §6.1 — 풀 수주액과 동일 규약).
export const BILLABLE_LINE_STATUSES: RevenueLineStatus[] = [
  "confirmed",
  "invoiced",
  "received",
];

export function lineBilledTotal(l: {
  supply_amount: number;
  vat_amount: number;
}): number {
  return (l.supply_amount ?? 0) + (l.vat_amount ?? 0);
}

// 연체 = 저장 상태가 아니라 계산(설계 §2): 기일 경과 + 아직 수납 전.
export function isLineOverdue(
  l: { status: RevenueLineStatus; due_date: string | null },
  todayYmd: string,
): boolean {
  if (!l.due_date) return false;
  if (l.status !== "confirmed" && l.status !== "invoiced") return false;
  return l.due_date < todayYmd;
}

export function todayYmdKst(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

// 딜 조건 한 줄 요약(콘솔 표시용).
export function dealTermsSummary(d: {
  pricing_model: DealPricingModel;
  unit_price: number | null;
  unit_label: string | null;
  quantity_cap: number | null;
  quantity_min: number | null;
  min_guarantee_amount: number | null;
  revenue_share_pct: number | null;
  expected_supply_amount: number | null;
}): string {
  const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
  switch (d.pricing_model) {
    case "fixed":
      return d.expected_supply_amount != null
        ? `정액 ${won(d.expected_supply_amount)} (공급가)`
        : "정액";
    case "per_unit": {
      const unit = d.unit_label || "1건";
      const cap = d.quantity_cap != null ? ` · 상한 ${d.quantity_cap}` : "";
      return d.unit_price != null
        ? `${unit} × ${won(d.unit_price)}${cap}`
        : `단가×수량${cap}`;
    }
    case "min_guarantee_plus_unit": {
      const base =
        d.min_guarantee_amount != null
          ? `최소보장 ${won(d.min_guarantee_amount)}`
          : d.quantity_min != null
            ? `최소 ${d.quantity_min}`
            : "최소보장";
      const unit =
        d.unit_price != null ? ` + 초과 ${won(d.unit_price)}/건` : " + 초과 단가";
      return base + unit;
    }
    case "revenue_share":
      return d.revenue_share_pct != null
        ? `매출의 ${Number(d.revenue_share_pct)}%`
        : "매출 배분(RS%)";
    case "composite":
      return "혼합(라인 참조)";
  }
}
