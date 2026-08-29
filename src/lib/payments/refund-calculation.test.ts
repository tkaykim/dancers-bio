import assert from "node:assert/strict";
import test from "node:test";

// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { calculateRefundQuote, extractPayPalCapture, matchTossCancel } from "./refund-calculation.ts";

test("Toss KRW 결제는 여러 번 부분환불한 뒤 남은 금액을 정확히 전액환불한다", () => {
  const first = calculateRefundQuote({
    originalLedgerAmount: 1_000_000,
    originalProviderAmount: 1_000_000,
    ledgerCurrency: "KRW",
    providerCurrency: "KRW",
    refundedLedgerAmount: 0,
    refundedProviderAmount: 0,
    requestedLedgerAmount: 300_000,
  });
  assert.equal(first.providerAmount, 300_000);
  assert.equal(first.full, false);
  assert.equal(first.remainingLedgerAfter, 700_000);

  const last = calculateRefundQuote({
    originalLedgerAmount: 1_000_000,
    originalProviderAmount: 1_000_000,
    ledgerCurrency: "KRW",
    providerCurrency: "KRW",
    refundedLedgerAmount: 300_000,
    refundedProviderAmount: 300_000,
    requestedLedgerAmount: 700_000,
  });
  assert.equal(last.providerAmount, 700_000);
  assert.equal(last.full, true);
  assert.equal(last.remainingProviderAfter, 0);
});

test("PayPal 10만원·75달러 결제는 원화 부분환불을 승인 통화로 비례 계산한다", () => {
  const partial = calculateRefundQuote({
    originalLedgerAmount: 100_000,
    originalProviderAmount: 75,
    ledgerCurrency: "KRW",
    providerCurrency: "USD",
    refundedLedgerAmount: 0,
    refundedProviderAmount: 0,
    requestedLedgerAmount: 40_000,
  });
  assert.equal(partial.providerAmount, 30);
  assert.equal(partial.remainingProviderAfter, 45);

  const final = calculateRefundQuote({
    originalLedgerAmount: 100_000,
    originalProviderAmount: 75,
    ledgerCurrency: "KRW",
    providerCurrency: "USD",
    refundedLedgerAmount: 40_000,
    refundedProviderAmount: 30,
    requestedLedgerAmount: 60_000,
  });
  assert.equal(final.providerAmount, 45);
  assert.equal(final.full, true);
});

test("PayPal 최소 통화 단위보다 작은 부분환불은 거부한다", () => {
  assert.throws(
    () => calculateRefundQuote({
      originalLedgerAmount: 4_000_000,
      originalProviderAmount: 3_000,
      ledgerCurrency: "KRW",
      providerCurrency: "USD",
      refundedLedgerAmount: 0,
      refundedProviderAmount: 0,
      requestedLedgerAmount: 1,
    }),
    /최소 환불 단위/,
  );
});

test("PayPal 원본 승인 응답에서 capture 금액과 통화를 추출한다", () => {
  const capture = extractPayPalCapture({
    purchase_units: [{ payments: { captures: [{ id: "CAPTURE-1", amount: { value: "75.00", currency_code: "USD" } }] } }],
  });
  assert.deepEqual(capture, { id: "CAPTURE-1", amount: 75, currency: "USD" });
});

test("토스 취소 응답은 배열 순서가 아니라 lastTransactionKey로 이번 환불을 찾는다", () => {
  const result = matchTossCancel({
    lastTransactionKey: "new-refund",
    cancels: [
      { transactionKey: "new-refund", cancelAmount: 200_000, cancelReason: "고객 요청", cancelStatus: "DONE" },
      { transactionKey: "old-refund", cancelAmount: 100_000, cancelReason: "고객 요청", cancelStatus: "DONE" },
    ],
  }, { amount: 200_000, reason: "고객 요청", useLastTransactionKey: true });
  assert.deepEqual(result, { match: { transactionKey: "new-refund", status: "DONE" }, ambiguous: false });
});

test("식별키 없이 같은 금액과 사유의 토스 취소가 여러 건이면 자동 확정하지 않는다", () => {
  const result = matchTossCancel({
    cancels: [
      { transactionKey: "refund-1", cancelAmount: 100_000, cancelReason: "고객 요청", cancelStatus: "DONE" },
      { transactionKey: "refund-2", cancelAmount: 100_000, cancelReason: "고객 요청", cancelStatus: "DONE" },
    ],
  }, { amount: 100_000, reason: "고객 요청" });
  assert.deepEqual(result, { match: null, ambiguous: true });
});
