import type { AdminPaymentLine, AdminPaymentOperation, AdminPaymentRow } from "@/lib/admin/payments";

export const PAYMENT_PREVIEW_ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const GENERATED_AT = "2026-08-30T09:00:00.000Z";

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function paymentLine(index: number, overrides: Partial<AdminPaymentLine> = {}): AdminPaymentLine {
  return {
    id: uuid(index),
    sequence: 1,
    status: "paid",
    amount: 4_000_000,
    currency: "KRW",
    provider: "toss",
    providerAmount: 4_000_000,
    providerCurrency: "KRW",
    refundedAmount: 0,
    refundedProviderAmount: 0,
    refundableAmount: 4_000_000,
    refundableProviderAmount: 4_000_000,
    paidAt: "2026-08-29T05:20:00.000Z",
    receiptUrl: null,
    canRefund: true,
    canCancel: false,
    refunds: [],
    ...overrides,
  };
}

function operation(index: number, paymentId: string, overrides: Partial<AdminPaymentOperation> = {}): AdminPaymentOperation {
  return {
    id: uuid(8_000 + index),
    operationType: "refund",
    sourcePaymentId: paymentId,
    status: "requested",
    amount: 300_000,
    currency: "KRW",
    providerAmount: 300_000,
    providerCurrency: "KRW",
    reasonCode: "customer_request",
    reasonDetail: "고객 일정 변경 요청을 확인했습니다.",
    requestedBy: OTHER_ADMIN_ID,
    requestedByName: "운영 관리자",
    approvedBy: null,
    approvedByName: null,
    requestedAt: "2026-08-30T08:30:00.000Z",
    approvedAt: null,
    processedAt: null,
    completedAt: null,
    providerRefundId: null,
    providerStatus: null,
    errorMessage: null,
    ...overrides,
  };
}

function row(index: number, overrides: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  const line = paymentLine(index);
  return {
    id: `grigoent:${uuid(1_000 + index)}`,
    source: "grigoent",
    sourceLabel: "grigoent 원장",
    productSlug: "training-and-placement",
    productLabel: "트레이닝 패키지 · 400만원 상품",
    planLabel: "일시불",
    customerName: `테스트 고객 ${String(index).padStart(2, "0")}`,
    customerEmail: `customer${index}@example.com`,
    customerPhone: `010-9000-${String(index).padStart(4, "0")}`,
    status: "completed",
    refundState: "none",
    totalAmount: 4_000_000,
    paidAmount: 4_000_000,
    refundedAmount: 0,
    refundableAmount: 4_000_000,
    currency: "KRW",
    provider: "toss",
    orderNo: `GRT-2608-${String(index).padStart(6, "0")}`,
    createdAt: new Date(Date.parse("2026-08-30T08:00:00.000Z") - index * 60_000).toISOString(),
    paidAt: line.paidAt,
    refundedAt: null,
    deetzApplicationId: index % 3 === 0 ? uuid(5_000 + index) : null,
    eventId: null,
    memo: null,
    paymentCount: 1,
    failedPaymentCount: 0,
    auditFingerprint: null,
    auditUserAgent: null,
    auditReferrer: null,
    isTest: false,
    needsAttention: false,
    attentionReason: null,
    paymentLines: [line],
    operations: [],
    ...overrides,
  };
}

export function buildPaymentPreviewFixtures(): { items: AdminPaymentRow[]; generatedAt: string } {
  const tossPaymentId = uuid(1);
  const toss = row(1, {
    customerName: "김토스",
    customerEmail: "toss@example.com",
    paymentLines: [paymentLine(1, { id: tossPaymentId })],
    operations: [operation(1, tossPaymentId)],
  });

  const paypalPaymentId = uuid(2);
  const paypalRefund = {
    id: uuid(9_002),
    operationId: uuid(8_002),
    status: "completed",
    amount: 40_000,
    currency: "KRW",
    providerAmount: 30,
    providerCurrency: "USD",
    providerRefundId: "PAYPAL-REFUND-EXAMPLE",
    providerStatus: "COMPLETED",
    reason: "고객 요청 부분환불",
    requestedAt: "2026-08-29T06:00:00.000Z",
    completedAt: "2026-08-29T06:01:00.000Z",
    errorMessage: null,
  };
  const paypal = row(2, {
    customerName: "Paula Monteiro",
    customerEmail: "paula@example.com",
    productSlug: "audition-fee",
    productLabel: "오디션 참석비",
    totalAmount: 100_000,
    paidAmount: 60_000,
    refundedAmount: 40_000,
    refundableAmount: 60_000,
    provider: "paypal",
    refundState: "partial",
    refundedAt: paypalRefund.completedAt,
    paymentLines: [paymentLine(2, {
      id: paypalPaymentId,
      amount: 100_000,
      provider: "paypal",
      providerAmount: 75,
      providerCurrency: "USD",
      refundedAmount: 40_000,
      refundedProviderAmount: 30,
      refundableAmount: 60_000,
      refundableProviderAmount: 45,
      refunds: [paypalRefund],
    })],
    operations: [operation(2, paypalPaymentId, {
      status: "completed",
      amount: 40_000,
      providerAmount: 30,
      providerCurrency: "USD",
      approvedBy: PAYMENT_PREVIEW_ADMIN_ID,
      approvedByName: "책임 관리자",
      approvedAt: "2026-08-29T06:00:30.000Z",
      processedAt: "2026-08-29T06:00:30.000Z",
      completedAt: "2026-08-29T06:01:00.000Z",
      providerRefundId: "PAYPAL-REFUND-EXAMPLE",
      providerStatus: "COMPLETED",
    })],
  });

  const pendingPaymentId = uuid(3);
  const pending = row(3, {
    source: "workshop",
    sourceLabel: "워크샵 예약",
    id: `workshop:${uuid(1_003)}`,
    productSlug: "workshop-reservation",
    productLabel: "워크샵 예약금 · Alex Kim",
    planLabel: "alex-kim",
    customerName: "예약 대기 고객",
    status: "pending",
    totalAmount: 50_000,
    paidAmount: 0,
    refundableAmount: 0,
    provider: "paypal",
    paidAt: null,
    paymentLines: [paymentLine(3, {
      id: pendingPaymentId,
      status: "pending",
      amount: 50_000,
      provider: "paypal",
      providerAmount: 37.5,
      providerCurrency: "USD",
      refundableAmount: 0,
      refundableProviderAmount: 0,
      paidAt: null,
      canRefund: false,
      canCancel: true,
    })],
  });

  const attentionPaymentId = uuid(4);
  const attention = row(4, {
    customerName: "대사 필요 고객",
    needsAttention: true,
    attentionReason: "PG 결과 대사가 필요한 환불·취소 작업이 있습니다",
    refundState: "attention",
    paymentLines: [paymentLine(4, { id: attentionPaymentId, canRefund: false })],
    operations: [operation(4, attentionPaymentId, {
      status: "reconciliation_required",
      amount: 500_000,
      providerAmount: 500_000,
      approvedBy: PAYMENT_PREVIEW_ADMIN_ID,
      approvedByName: "책임 관리자",
      approvedAt: "2026-08-30T07:00:00.000Z",
      processedAt: "2026-08-30T07:00:00.000Z",
      errorMessage: "PG 응답이 유실되어 거래 상태를 다시 확인해야 합니다.",
    })],
  });

  const visa = row(5, {
    id: `visa_mirror:${uuid(1_005)}`,
    source: "visa_mirror",
    sourceLabel: "deetz 비자 미러",
    productSlug: "monthly-training",
    productLabel: "월간 트레이닝 · 140만원",
    customerName: "Visa Mirror",
    totalAmount: 1_400_000,
    paidAmount: 1_400_000,
    refundableAmount: 0,
    paymentLines: [],
  });

  const failed = row(6, {
    source: "workshop_event",
    sourceLabel: "워크샵 행사",
    id: `workshop_event:${uuid(1_006)}`,
    productSlug: "workshop-event",
    productLabel: "워크샵 행사 · Summer Dance Night",
    customerName: "결제 실패 고객",
    status: "failed",
    totalAmount: 80_000,
    paidAmount: 0,
    refundableAmount: 0,
    failedPaymentCount: 1,
    needsAttention: true,
    attentionReason: "결제 실패 이력이 있습니다",
    paymentLines: [paymentLine(6, {
      status: "failed",
      amount: 80_000,
      refundableAmount: 0,
      refundableProviderAmount: 0,
      paidAt: null,
      canRefund: false,
      canCancel: true,
    })],
  });

  const filler = Array.from({ length: 66 }, (_, offset) => {
    const index = offset + 10;
    if (index % 11 === 0) {
      return row(index, {
        productSlug: "monthly-training-100",
        productLabel: "월간 트레이닝 · 100만원",
        customerName: `검색 고객 ${index}`,
        totalAmount: 1_000_000,
        paidAmount: 1_000_000,
        refundableAmount: 1_000_000,
        paymentLines: [paymentLine(index, { amount: 1_000_000, refundableAmount: 1_000_000, refundableProviderAmount: 1_000_000 })],
      });
    }
    return row(index);
  });

  return { items: [toss, paypal, pending, attention, visa, failed, ...filler], generatedAt: GENERATED_AT };
}
