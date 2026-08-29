import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { calculateRefundQuote, extractPayPalCapture, extractTossCharge, type RefundQuote } from "@/lib/payments/refund-calculation";
import { createAdminClient } from "@/lib/supabase/admin";

export type CanonicalPaymentSource = "grigoent" | "workshop" | "workshop_event";
export type CanonicalSourceType = "training_payment" | "workshop_reservation" | "workshop_event";

export type PaymentSourceDescriptor = {
  source: CanonicalPaymentSource;
  sourceSystem: "grigoent" | "deetz";
  sourceType: CanonicalSourceType;
  paymentId: string;
  orderId: string;
  orderNo: string | null;
  status: string;
  provider: "toss" | "paypal" | null;
  paymentKey: string | null;
  pgOrderId: string | null;
  providerOrderId: string | null;
  raw: unknown;
  originalLedgerAmount: number;
  ledgerCurrency: string;
  originalProviderAmount: number;
  providerCurrency: string;
  refundedLedgerAmount: number;
  refundedProviderAmount: number;
  refundableLedgerAmount: number;
  refundableProviderAmount: number;
  canRefund: boolean;
  canCancel: boolean;
};

type UnknownRow = Record<string, unknown>;

function deetzClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function grigoentClient(): SupabaseClient | null {
  const url = process.env.GRIGOENT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_GRIGOENT_SUPABASE_URL;
  const key = process.env.GRIGOENT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function stringValue(row: UnknownRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(row: UnknownRow, key: string): number | null {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function providerCharge(params: {
  provider: string | null;
  raw: unknown;
  paymentKey: string | null;
  ledgerAmount: number;
  ledgerCurrency: string;
}): { amount: number; currency: string } {
  if (params.provider === "toss") {
    const toss = extractTossCharge(params.raw);
    return { amount: toss.amount ?? params.ledgerAmount, currency: toss.currency };
  }
  if (params.provider === "paypal") {
    const capture = extractPayPalCapture(params.raw);
    if (!capture.amount || !capture.currency) {
      throw new Error("PayPal 승인 통화와 금액을 원결제에서 찾을 수 없습니다.");
    }
    return { amount: capture.amount, currency: capture.currency };
  }
  return { amount: params.ledgerAmount, currency: params.ledgerCurrency };
}

function sums(rows: UnknownRow[], ledgerKey: string): { ledger: number; provider: number } {
  return rows
    .filter((row) => stringValue(row, "status") === "completed")
    .reduce<{ ledger: number; provider: number }>(
      (acc, row) => ({
        ledger: acc.ledger + (numberValue(row, ledgerKey) ?? 0),
        provider: acc.provider + (numberValue(row, "provider_amount") ?? 0),
      }),
      { ledger: 0, provider: 0 },
    );
}

function finishDescriptor(
  base: Omit<PaymentSourceDescriptor, "originalProviderAmount" | "providerCurrency" | "refundableLedgerAmount" | "refundableProviderAmount" | "canRefund" | "canCancel">,
  refunds: { ledger: number; provider: number },
): PaymentSourceDescriptor {
  const charge = providerCharge({
    provider: base.provider,
    raw: base.raw,
    paymentKey: base.paymentKey,
    ledgerAmount: base.originalLedgerAmount,
    ledgerCurrency: base.ledgerCurrency,
  });
  const refundableLedgerAmount = Math.max(0, base.originalLedgerAmount - refunds.ledger);
  const refundableProviderAmount = Math.max(0, charge.amount - refunds.provider);
  const captured = base.source === "workshop"
    ? ["paid", "confirmed", "transferred"].includes(base.status)
    : ["paid"].includes(base.status);

  return {
    ...base,
    originalProviderAmount: charge.amount,
    providerCurrency: charge.currency,
    refundedLedgerAmount: refunds.ledger,
    refundedProviderAmount: refunds.provider,
    refundableLedgerAmount,
    refundableProviderAmount,
    canRefund: captured && Boolean(base.provider && base.paymentKey) && refundableLedgerAmount > 0,
    canCancel: ["pending", "failed"].includes(base.status) && !base.paymentKey,
  };
}

async function loadGrigoentPayment(paymentId: string): Promise<PaymentSourceDescriptor> {
  const client = grigoentClient();
  if (!client) throw new Error("grigoent 결제 원장 연결 설정이 없습니다.");
  const { data, error } = await client
    .from("training_order_payments")
    .select("id, order_id, amount, currency, status, pg_provider, payment_key, pg_order_id, provider_order_id, raw")
    .eq("id", paymentId)
    .maybeSingle();
  if (error || !data) throw new Error("grigoent 결제 건을 찾을 수 없습니다.");
  const payment = data as UnknownRow;
  const orderId = stringValue(payment, "order_id");
  if (!orderId) throw new Error("grigoent 주문 연결을 확인할 수 없습니다.");
  const [{ data: order }, { data: refundRows, error: refundError }] = await Promise.all([
    client.from("training_orders").select("id, order_no").eq("id", orderId).maybeSingle(),
    client.from("training_payment_refunds").select("ledger_amount_krw, provider_amount, status").eq("payment_id", paymentId),
  ]);
  if (refundError) throw new Error("grigoent 환불 원장을 읽지 못했습니다.");
  const amount = numberValue(payment, "amount");
  if (!amount || amount <= 0) throw new Error("원결제 금액을 확인할 수 없습니다.");
  const refunds = sums((refundRows ?? []) as UnknownRow[], "ledger_amount_krw");

  return finishDescriptor(
    {
      source: "grigoent",
      sourceSystem: "grigoent",
      sourceType: "training_payment",
      paymentId,
      orderId,
      orderNo: stringValue((order ?? {}) as UnknownRow, "order_no"),
      status: stringValue(payment, "status") ?? "unknown",
      provider: stringValue(payment, "pg_provider") as "toss" | "paypal" | null,
      paymentKey: stringValue(payment, "payment_key"),
      pgOrderId: stringValue(payment, "pg_order_id"),
      providerOrderId: stringValue(payment, "provider_order_id"),
      raw: payment.raw,
      originalLedgerAmount: amount,
      ledgerCurrency: "KRW",
      refundedLedgerAmount: refunds.ledger,
      refundedProviderAmount: refunds.provider,
    },
    refunds,
  );
}

async function loadWorkshopPayment(paymentId: string): Promise<PaymentSourceDescriptor> {
  const client = deetzClient();
  const { data, error } = await client
    .from("workshop_reservations")
    .select("id, amount, status, pg_provider, payment_key, pg_order_id, provider_order_id, order_no, raw")
    .eq("id", paymentId)
    .maybeSingle();
  if (error || !data) throw new Error("워크샵 예약 결제를 찾을 수 없습니다.");
  const payment = data as UnknownRow;
  const { data: refundRows, error: refundError } = await client
    .from("deetz_payment_refunds")
    .select("ledger_amount, provider_amount, status")
    .eq("source_type", "workshop_reservation")
    .eq("source_id", paymentId);
  if (refundError) throw new Error("워크샵 환불 원장을 읽지 못했습니다.");
  const amount = numberValue(payment, "amount");
  if (!amount || amount <= 0) throw new Error("원결제 금액을 확인할 수 없습니다.");
  const refunds = sums((refundRows ?? []) as UnknownRow[], "ledger_amount");

  return finishDescriptor(
    {
      source: "workshop",
      sourceSystem: "deetz",
      sourceType: "workshop_reservation",
      paymentId,
      orderId: paymentId,
      orderNo: stringValue(payment, "order_no"),
      status: stringValue(payment, "status") ?? "unknown",
      provider: stringValue(payment, "pg_provider") as "toss" | "paypal" | null,
      paymentKey: stringValue(payment, "payment_key"),
      pgOrderId: stringValue(payment, "pg_order_id"),
      providerOrderId: stringValue(payment, "provider_order_id"),
      raw: payment.raw,
      originalLedgerAmount: amount,
      ledgerCurrency: "KRW",
      refundedLedgerAmount: refunds.ledger,
      refundedProviderAmount: refunds.provider,
    },
    refunds,
  );
}

async function loadEventPayment(paymentId: string): Promise<PaymentSourceDescriptor> {
  const client = deetzClient();
  const { data, error } = await client
    .from("workshop_event_orders")
    .select("id, charged_amount, charged_currency, amount_krw, status, pg_provider, payment_key, pg_order_id, provider_order_id, order_no, raw")
    .eq("id", paymentId)
    .maybeSingle();
  if (error || !data) throw new Error("워크샵 행사 결제를 찾을 수 없습니다.");
  const payment = data as UnknownRow;
  const { data: refundRows, error: refundError } = await client
    .from("deetz_payment_refunds")
    .select("ledger_amount, provider_amount, status")
    .eq("source_type", "workshop_event")
    .eq("source_id", paymentId);
  if (refundError) throw new Error("행사 환불 원장을 읽지 못했습니다.");
  const amount = numberValue(payment, "charged_amount") ?? numberValue(payment, "amount_krw");
  const currency = stringValue(payment, "charged_currency") ?? "KRW";
  if (!amount || amount <= 0) throw new Error("원결제 금액을 확인할 수 없습니다.");
  const refunds = sums((refundRows ?? []) as UnknownRow[], "ledger_amount");

  return finishDescriptor(
    {
      source: "workshop_event",
      sourceSystem: "deetz",
      sourceType: "workshop_event",
      paymentId,
      orderId: paymentId,
      orderNo: stringValue(payment, "order_no"),
      status: stringValue(payment, "status") ?? "unknown",
      provider: stringValue(payment, "pg_provider") as "toss" | "paypal" | null,
      paymentKey: stringValue(payment, "payment_key"),
      pgOrderId: stringValue(payment, "pg_order_id"),
      providerOrderId: stringValue(payment, "provider_order_id"),
      raw: payment.raw,
      originalLedgerAmount: amount,
      ledgerCurrency: currency,
      refundedLedgerAmount: refunds.ledger,
      refundedProviderAmount: refunds.provider,
    },
    refunds,
  );
}

export async function loadPaymentSource(
  source: CanonicalPaymentSource,
  paymentId: string,
): Promise<PaymentSourceDescriptor> {
  if (source === "grigoent") return loadGrigoentPayment(paymentId);
  if (source === "workshop") return loadWorkshopPayment(paymentId);
  return loadEventPayment(paymentId);
}

export async function quotePaymentRefund(
  source: CanonicalPaymentSource,
  paymentId: string,
  requestedLedgerAmount: number,
): Promise<{ descriptor: PaymentSourceDescriptor; quote: RefundQuote }> {
  const descriptor = await loadPaymentSource(source, paymentId);
  if (!descriptor.canRefund) throw new Error("이 결제는 현재 자동 환불할 수 없습니다.");
  const quote = calculateRefundQuote({
    originalLedgerAmount: descriptor.originalLedgerAmount,
    originalProviderAmount: descriptor.originalProviderAmount,
    ledgerCurrency: descriptor.ledgerCurrency,
    providerCurrency: descriptor.providerCurrency,
    refundedLedgerAmount: descriptor.refundedLedgerAmount,
    refundedProviderAmount: descriptor.refundedProviderAmount,
    requestedLedgerAmount,
  });
  return { descriptor, quote };
}
