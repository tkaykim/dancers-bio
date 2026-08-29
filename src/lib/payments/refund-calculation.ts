export type RefundQuote = {
  ledgerAmount: number;
  providerAmount: number;
  ledgerCurrency: string;
  providerCurrency: string;
  remainingLedgerBefore: number;
  remainingProviderBefore: number;
  remainingLedgerAfter: number;
  remainingProviderAfter: number;
  full: boolean;
};

type RefundQuoteInput = {
  originalLedgerAmount: number;
  originalProviderAmount: number;
  ledgerCurrency: string;
  providerCurrency: string;
  refundedLedgerAmount: number;
  refundedProviderAmount: number;
  requestedLedgerAmount: number;
};

export function currencyPrecision(currency: string): number {
  return ["KRW", "JPY"].includes(currency.toUpperCase()) ? 0 : 2;
}

export function roundCurrency(amount: number, currency: string): number {
  const factor = 10 ** currencyPrecision(currency);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
}

function assertFinitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label}을 확인해 주세요.`);
}

export function calculateRefundQuote(input: RefundQuoteInput): RefundQuote {
  assertFinitePositive(input.originalLedgerAmount, "원결제 금액");
  assertFinitePositive(input.originalProviderAmount, "PG 승인 금액");
  assertFinitePositive(input.requestedLedgerAmount, "환불 금액");

  const ledgerCurrency = input.ledgerCurrency.toUpperCase();
  const providerCurrency = input.providerCurrency.toUpperCase();
  const ledgerPrecision = currencyPrecision(ledgerCurrency);
  const ledgerUnit = 1 / 10 ** ledgerPrecision;
  const providerUnit = 1 / 10 ** currencyPrecision(providerCurrency);
  const remainingLedgerBefore = roundCurrency(
    input.originalLedgerAmount - Math.max(0, input.refundedLedgerAmount),
    ledgerCurrency,
  );
  const remainingProviderBefore = roundCurrency(
    input.originalProviderAmount - Math.max(0, input.refundedProviderAmount),
    providerCurrency,
  );
  const requestedLedgerAmount = roundCurrency(input.requestedLedgerAmount, ledgerCurrency);

  if (remainingLedgerBefore < ledgerUnit || remainingProviderBefore < providerUnit) {
    throw new Error("환불 가능한 잔액이 없습니다.");
  }
  if (requestedLedgerAmount > remainingLedgerBefore) {
    throw new Error("환불 금액이 환불 가능 잔액보다 큽니다.");
  }

  const full = Math.abs(requestedLedgerAmount - remainingLedgerBefore) < ledgerUnit / 2;
  const providerAmount = full
    ? remainingProviderBefore
    : roundCurrency(
        (input.originalProviderAmount * requestedLedgerAmount) / input.originalLedgerAmount,
        providerCurrency,
      );

  if (providerAmount < providerUnit) {
    throw new Error(`이 금액은 ${providerCurrency} 최소 환불 단위보다 작습니다.`);
  }
  if (providerAmount >= remainingProviderBefore && !full) {
    throw new Error("부분환불 금액이 PG 환불 가능 잔액에 너무 가깝습니다. 전액 환불을 선택해 주세요.");
  }

  return {
    ledgerAmount: requestedLedgerAmount,
    providerAmount,
    ledgerCurrency,
    providerCurrency,
    remainingLedgerBefore,
    remainingProviderBefore,
    remainingLedgerAfter: roundCurrency(remainingLedgerBefore - requestedLedgerAmount, ledgerCurrency),
    remainingProviderAfter: roundCurrency(remainingProviderBefore - providerAmount, providerCurrency),
    full,
  };
}

export function extractPayPalCapture(raw: unknown): {
  id: string | null;
  amount: number | null;
  currency: string | null;
} {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const units = Array.isArray(root.purchase_units) ? root.purchase_units : [];
  const unit = units[0] && typeof units[0] === "object" ? (units[0] as Record<string, unknown>) : {};
  const payments = unit.payments && typeof unit.payments === "object"
    ? (unit.payments as Record<string, unknown>)
    : {};
  const captures = Array.isArray(payments.captures) ? payments.captures : [];
  const capture = captures[0] && typeof captures[0] === "object"
    ? (captures[0] as Record<string, unknown>)
    : {};
  const amount = capture.amount && typeof capture.amount === "object"
    ? (capture.amount as Record<string, unknown>)
    : {};
  const parsed = Number(amount.value);

  return {
    id: typeof capture.id === "string" ? capture.id : null,
    amount: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
    currency: typeof amount.currency_code === "string" ? amount.currency_code.toUpperCase() : null,
  };
}

export function extractTossCharge(raw: unknown): { amount: number | null; currency: string } {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const amount = Number(value.totalAmount);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    currency: typeof value.currency === "string" ? value.currency.toUpperCase() : "KRW",
  };
}

export function matchTossCancel(
  raw: unknown,
  input: {
    transactionKey?: string | null;
    amount?: number;
    reason?: string;
    useLastTransactionKey?: boolean;
  },
): {
  match: { transactionKey: string | null; status: string | null } | null;
  ambiguous: boolean;
} {
  const root = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cancels = (Array.isArray(root.cancels) ? root.cancels : [])
    .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === "object"));
  const expectedKey = input.transactionKey
    ?? (input.useLastTransactionKey && typeof root.lastTransactionKey === "string" ? root.lastTransactionKey : null);

  if (expectedKey) {
    const exact = cancels.find((cancel) => cancel.transactionKey === expectedKey);
    if (exact) {
      return {
        match: {
          transactionKey: typeof exact.transactionKey === "string" ? exact.transactionKey : null,
          status: typeof exact.cancelStatus === "string" ? exact.cancelStatus : null,
        },
        ambiguous: false,
      };
    }
  }

  const candidates = cancels.filter((cancel) => {
    if (input.amount !== undefined && Number(cancel.cancelAmount) !== input.amount) return false;
    if (input.reason !== undefined && cancel.cancelReason !== input.reason) return false;
    return input.amount !== undefined || input.reason !== undefined;
  });
  if (candidates.length !== 1) return { match: null, ambiguous: candidates.length > 1 };
  const match = candidates[0];
  return {
    match: {
      transactionKey: typeof match.transactionKey === "string" ? match.transactionKey : null,
      status: typeof match.cancelStatus === "string" ? match.cancelStatus : null,
    },
    ambiguous: false,
  };
}
