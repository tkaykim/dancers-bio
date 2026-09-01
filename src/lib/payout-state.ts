// 정산 건별 "실제로 지급됐는가" 판정 정본.
//
// 배경: 출금이 잔액(원장) 경로로 일원화된 뒤, `settlements.status`는 금액이
// 확정되면 `pending`에 머물고 **영원히 바뀌지 않는다**. 실제 지급은
// `withdrawal_requests`(+ 원장 withdraw)에 기록되기 때문이다.
// 그래서 status만 보고 화면을 그리면 이미 이체가 끝난 건도 계속
// "출금신청 전"으로 보인다(관리자 큐 오독·댄서 문의의 직접 원인).
//
// 잔액은 댄서 단위라 "이 정산 건이 지급됐는지"는 원장 배분으로 판정한다.
// 배분 규칙 = **선입선출(FIFO)** — 먼저 적립된 정산부터 출금에 소진된다.
// (원장 earn 행이 ref_id로 정산 건을 가리키므로 정확한 연결이 가능하다.)

export type SettlementPayoutStage =
  | "awaiting_amount" // 금액 미확정
  | "withdrawable" // 잔액에 남아 있음 (본인 출금 신청 전)
  | "requested" // 출금 신청됨, 이체 대기
  | "partially_paid" // 일부만 지급됨
  | "paid" // 전액 지급 완료
  | "cancelled"; // 취소됨 (관리 콘솔에서만 보임)

export const PAYOUT_STAGE_LABEL: Record<SettlementPayoutStage, string> = {
  awaiting_amount: "정산 확정 대기",
  withdrawable: "출금 가능",
  requested: "출금 신청됨",
  partially_paid: "일부 지급",
  paid: "지급 완료",
  cancelled: "취소됨",
};

export type LedgerEntryInput = {
  entryType: string;
  refType: string | null;
  refId: string | null;
  amount: number; // earn=양수 / withdraw·spend=음수
  createdAt: string;
};

export type SettlementPayout = {
  settlementId: string;
  net: number; // 이 정산의 세후 적립액
  paidAmount: number; // 실제 이체가 끝난 금액
  reservedAmount: number; // 출금 신청됐지만 아직 이체 전
  stage: SettlementPayoutStage;
  paidAt: string | null; // 전액 지급이 완료된 시점
};

/**
 * 한 댄서의 원장·출금신청을 받아 정산 건별 지급 상태를 계산한다.
 *
 * @param ledger 그 댄서의 원장 전체(적립·출금 모두)
 * @param requestedTotal 이체 대기(status='requested') 출금 신청 합계
 * @param legacyRequestedNet 구 경로(settlements.status='requested') 예약분 합계
 */
export function computeSettlementPayouts(
  ledger: LedgerEntryInput[],
  requestedTotal: number,
  legacyRequestedNet = 0,
): Map<string, SettlementPayout> {
  // 적립(earn)만 정산 건에 귀속된다. 적립 순서 = 소진 순서(FIFO).
  const earns = ledger
    .filter(
      (e) => e.amount > 0 && e.refType === "settlement" && e.refId !== null,
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // 출금·사용 등 잔액을 빼는 모든 기록(음수)을 소진량으로 본다.
  // 이체 시각은 전액 지급 완료 표시에 쓰려고 함께 들고 간다.
  const drains = ledger
    .filter((e) => e.amount < 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const result = new Map<string, SettlementPayout>();
  let drainIndex = 0;
  let drainLeft = drains.length > 0 ? -drains[0].amount : 0;
  // 신청 중(아직 이체 전) 예약분은 지급이 끝난 뒤 남은 적립에서 채운다.
  let reserveLeft = Math.max(0, requestedTotal) + Math.max(0, legacyRequestedNet);

  for (const earn of earns) {
    const settlementId = earn.refId as string;
    const net = earn.amount;
    let paid = 0;
    let paidAt: string | null = null;

    // FIFO 소진: 이 적립분이 채워질 때까지 출금 기록을 당겨 쓴다.
    while (paid < net && drainIndex < drains.length) {
      const take = Math.min(net - paid, drainLeft);
      paid += take;
      drainLeft -= take;
      if (take > 0) paidAt = drains[drainIndex].createdAt;
      if (drainLeft === 0) {
        drainIndex += 1;
        drainLeft = drainIndex < drains.length ? -drains[drainIndex].amount : 0;
      }
    }

    const unpaid = net - paid;
    const reserved = Math.min(unpaid, reserveLeft);
    reserveLeft -= reserved;

    let stage: SettlementPayoutStage;
    if (paid >= net && net > 0) stage = "paid";
    else if (paid > 0) stage = "partially_paid";
    else if (reserved > 0) stage = "requested";
    else stage = "withdrawable";

    result.set(settlementId, {
      settlementId,
      net,
      paidAmount: paid,
      reservedAmount: reserved,
      stage,
      paidAt: paid >= net ? paidAt : null,
    });
  }

  return result;
}

/** 화면 표시용 단계 판정 — 원장 정보가 없으면 기존 status로 폴백한다. */
export function resolvePayoutStage(
  status: string,
  gross: number | null | undefined,
  payout: SettlementPayout | undefined,
): SettlementPayoutStage {
  if (status === "cancelled") return "cancelled";
  if (status === "pending" && (gross == null || gross <= 0))
    return "awaiting_amount";
  if (status === "paid") return "paid";
  if (status === "requested") return "requested";
  return payout?.stage ?? "withdrawable";
}
