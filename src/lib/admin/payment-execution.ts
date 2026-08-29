import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadPaymentSource, type CanonicalPaymentSource, type PaymentSourceDescriptor } from "@/lib/admin/payment-sources";
import { calculateRefundQuote, currencyPrecision, matchTossCancel } from "@/lib/payments/refund-calculation";
import { createAdminClient } from "@/lib/supabase/admin";

export type PaymentExecutionResult =
  | {
      ok: true;
      status: "completed" | "provider_pending" | "reconciliation_required";
      providerRefundId: string | null;
      providerStatus: string | null;
      response: unknown;
    }
  | { ok: false; status: number; error: string; code?: string; response?: unknown };

type OperationInput = {
  id: string;
  operationType: "cancel" | "refund";
  source: CanonicalPaymentSource;
  paymentId: string;
  ledgerAmount: number;
  providerAmount: number;
  reason: string;
};

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function tossSecret(): string | null {
  const live = process.env.NEXT_PUBLIC_TOSS_USE_LIVE === "true";
  return (live ? process.env.TOSS_LIVE_SECRET_KEY || process.env.TOSS_SECRET_KEY : process.env.TOSS_SECRET_KEY) ?? null;
}

function tossHeaders(idempotencyKey?: string): Record<string, string> {
  const secret = tossSecret();
  if (!secret) throw new Error("Toss 비밀키가 설정되지 않았습니다.");
  return {
    Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
    "Content-Type": "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

const PAYPAL_API_URL = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX === "true"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

async function paypalAccessToken(): Promise<string> {
  const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal 키가 설정되지 않았습니다.");
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error_description ?? "PayPal 인증에 실패했습니다.");
  return body.access_token as string;
}

function sourceTable(descriptor: PaymentSourceDescriptor): "workshop_reservations" | "workshop_event_orders" {
  return descriptor.sourceType === "workshop_reservation" ? "workshop_reservations" : "workshop_event_orders";
}

async function finishNativeRefund(params: {
  descriptor: PaymentSourceDescriptor;
  ledgerId: string;
  full: boolean;
  providerRefundId: string | null;
  providerStatus: string | null;
  response: unknown;
}): Promise<boolean> {
  const client = adminClient();
  const now = new Date().toISOString();
  const { error: ledgerError } = await client
    .from("deetz_payment_refunds")
    .update({
      status: "completed",
      provider_refund_id: params.providerRefundId,
      provider_status: params.providerStatus,
      response_payload: params.response,
      processed_at: now,
      completed_at: now,
      updated_at: now,
      error_code: null,
      error_message: null,
    })
    .eq("id", params.ledgerId);
  if (ledgerError) {
    console.error("[admin/payment-refund] ledger update failed after PG completion", ledgerError);
    return false;
  }

  const patch: Record<string, unknown> = { updated_at: now };
  if (params.full) {
    patch.status = "refunded";
    patch.refunded_at = now;
  }
  const { error: sourceError } = await client
    .from(sourceTable(params.descriptor))
    .update(patch)
    .eq("id", params.descriptor.paymentId);
  if (sourceError) {
    console.error("[admin/payment-refund] source update failed after PG completion", sourceError);
    await client
      .from("deetz_payment_refunds")
      .update({
        status: "reconciliation_required",
        error_code: "SOURCE_PROJECTION_FAILED",
        error_message: sourceError.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.ledgerId);
    return false;
  }
  return true;
}

async function executeNativeRefund(input: OperationInput): Promise<PaymentExecutionResult> {
  const client = adminClient();
  let descriptor: PaymentSourceDescriptor;
  try {
    descriptor = await loadPaymentSource(input.source, input.paymentId);
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof Error ? error.message : "결제 정보를 확인하지 못했습니다." };
  }
  if (descriptor.sourceSystem !== "deetz" || !descriptor.canRefund || !descriptor.provider || !descriptor.paymentKey) {
    return { ok: false, status: 400, error: "현재 자동 환불할 수 없는 결제입니다." };
  }

  let quote;
  try {
    quote = calculateRefundQuote({
      originalLedgerAmount: descriptor.originalLedgerAmount,
      originalProviderAmount: descriptor.originalProviderAmount,
      ledgerCurrency: descriptor.ledgerCurrency,
      providerCurrency: descriptor.providerCurrency,
      refundedLedgerAmount: descriptor.refundedLedgerAmount,
      refundedProviderAmount: descriptor.refundedProviderAmount,
      requestedLedgerAmount: input.ledgerAmount,
    });
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof Error ? error.message : "환불 금액을 확인해 주세요." };
  }
  const providerUnit = 1 / 10 ** currencyPrecision(quote.providerCurrency);
  if (Math.abs(quote.providerAmount - input.providerAmount) >= providerUnit / 2) {
    return { ok: false, status: 409, error: "승인 대기 중 환불 가능 금액이 변경되었습니다. 요청을 다시 만들어 주세요." };
  }

  const now = new Date().toISOString();
  const { data: existing } = await client
    .from("deetz_payment_refunds")
    .select("id, status, provider_refund_id, provider_status, response_payload")
    .eq("operation_id", input.id)
    .maybeSingle();
  if (existing) {
    if (existing.status === "completed") {
      return {
        ok: true,
        status: "completed",
        providerRefundId: existing.provider_refund_id as string | null,
        providerStatus: existing.provider_status as string | null,
        response: existing.response_payload,
      };
    }
    return { ok: false, status: 409, error: "같은 환불 작업이 이미 처리 중이거나 확인 대기 중입니다." };
  }

  const { data: ledger, error: insertError } = await client
    .from("deetz_payment_refunds")
    .insert({
      operation_id: input.id,
      source_type: descriptor.sourceType,
      source_id: descriptor.paymentId,
      provider: descriptor.provider,
      ledger_amount: quote.ledgerAmount,
      ledger_currency: quote.ledgerCurrency,
      provider_amount: quote.providerAmount,
      provider_currency: quote.providerCurrency,
      idempotency_key: input.id,
      status: "processing",
      reason: input.reason,
      request_payload: {
        ledgerAmount: quote.ledgerAmount,
        ledgerCurrency: quote.ledgerCurrency,
        providerAmount: quote.providerAmount,
        providerCurrency: quote.providerCurrency,
        full: quote.full,
      },
      requested_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (insertError || !ledger) {
    return {
      ok: false,
      status: insertError?.code === "23505" ? 409 : 500,
      error: insertError?.code === "23505" ? "이 결제에는 이미 진행 중인 환불이 있습니다." : "환불 원장을 만들지 못했습니다.",
    };
  }

  let response: Response;
  let body: Record<string, unknown>;
  let providerRefundId: string | null = null;
  let providerStatus: string | null = null;
  try {
    if (descriptor.provider === "toss") {
      const lookup = await fetch(`https://api.tosspayments.com/v1/payments/${descriptor.paymentKey}`, {
        headers: tossHeaders(),
        cache: "no-store",
      });
      const lookupBody = (await lookup.json()) as Record<string, unknown>;
      if (!lookup.ok) {
        await client.from("deetz_payment_refunds").update({ status: "failed", response_payload: lookupBody, error_code: "TOSS_LOOKUP_FAILED", error_message: String(lookupBody.message ?? "토스 결제를 확인하지 못했습니다."), updated_at: new Date().toISOString() }).eq("id", ledger.id);
        return { ok: false, status: 502, error: String(lookupBody.message ?? "토스 결제를 확인하지 못했습니다."), response: lookupBody };
      }
      const balance = Number(lookupBody.balanceAmount);
      if (!Number.isFinite(balance) || balance < quote.providerAmount) {
        await client.from("deetz_payment_refunds").update({ status: "reconciliation_required", response_payload: lookupBody, error_code: "TOSS_BALANCE_MISMATCH", error_message: "토스 잔액과 내부 환불 잔액이 일치하지 않습니다.", updated_at: new Date().toISOString() }).eq("id", ledger.id);
        return { ok: true, status: "reconciliation_required", providerRefundId: null, providerStatus: String(lookupBody.status ?? ""), response: lookupBody };
      }
      response = await fetch(`https://api.tosspayments.com/v1/payments/${descriptor.paymentKey}/cancel`, {
        method: "POST",
        headers: tossHeaders(input.id),
        body: JSON.stringify({ cancelReason: input.reason, ...(!quote.full ? { cancelAmount: quote.providerAmount } : {}) }),
      });
      body = (await response.json()) as Record<string, unknown>;
      const cancel = matchTossCancel(body, {
        amount: quote.providerAmount,
        reason: input.reason,
        useLastTransactionKey: true,
      }).match;
      providerRefundId = cancel?.transactionKey ?? null;
      providerStatus = cancel?.status ?? null;
    } else {
      const token = await paypalAccessToken();
      const lookup = await fetch(`${PAYPAL_API_URL}/v2/payments/captures/${descriptor.paymentKey}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const lookupBody = (await lookup.json()) as Record<string, unknown>;
      if (!lookup.ok) {
        await client.from("deetz_payment_refunds").update({ status: "failed", response_payload: lookupBody, error_code: "PAYPAL_LOOKUP_FAILED", error_message: String(lookupBody.message ?? "PayPal 결제를 확인하지 못했습니다."), updated_at: new Date().toISOString() }).eq("id", ledger.id);
        return { ok: false, status: 502, error: String(lookupBody.message ?? "PayPal 결제를 확인하지 못했습니다."), response: lookupBody };
      }
      response = await fetch(`${PAYPAL_API_URL}/v2/payments/captures/${descriptor.paymentKey}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": input.id,
        },
        body: JSON.stringify({
          amount: {
            value: quote.providerAmount.toFixed(currencyPrecision(quote.providerCurrency)),
            currency_code: quote.providerCurrency,
          },
          note_to_payer: input.reason.slice(0, 255),
        }),
      });
      body = (await response.json()) as Record<string, unknown>;
      providerRefundId = typeof body.id === "string" ? body.id : null;
      providerStatus = typeof body.status === "string" ? body.status : null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "PG 응답을 확인하지 못했습니다.";
    console.error("[admin/payment-refund] provider outcome unknown", error);
    await client.from("deetz_payment_refunds").update({ status: "reconciliation_required", error_code: "PROVIDER_OUTCOME_UNKNOWN", error_message: message, updated_at: new Date().toISOString() }).eq("id", ledger.id);
    return { ok: true, status: "reconciliation_required", providerRefundId: null, providerStatus: null, response: { error: message } };
  }

  if (!response.ok) {
    const message = String(body.message ?? "PG 환불 요청에 실패했습니다.");
    const uncertain = response.status >= 500 || response.status === 409;
    await client
      .from("deetz_payment_refunds")
      .update({
        status: uncertain ? "reconciliation_required" : "failed",
        provider_refund_id: providerRefundId,
        provider_status: providerStatus,
        response_payload: body,
        error_code: String(body.code ?? body.name ?? `HTTP_${response.status}`),
        error_message: message,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledger.id);
    return uncertain
      ? { ok: true, status: "reconciliation_required", providerRefundId, providerStatus, response: body }
      : { ok: false, status: 502, error: message, response: body };
  }

  const completed = descriptor.provider === "toss" ? providerStatus === "DONE" : providerStatus === "COMPLETED";
  if (!completed) {
    await client
      .from("deetz_payment_refunds")
      .update({
        status: "pending",
        provider_refund_id: providerRefundId,
        provider_status: providerStatus,
        response_payload: body,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ledger.id);
    return { ok: true, status: "provider_pending", providerRefundId, providerStatus, response: body };
  }

  const finalized = await finishNativeRefund({
    descriptor,
    ledgerId: ledger.id as string,
    full: quote.full,
    providerRefundId,
    providerStatus,
    response: body,
  });
  return {
    ok: true,
    status: finalized ? "completed" : "reconciliation_required",
    providerRefundId,
    providerStatus,
    response: body,
  };
}

async function executeNativeCancellation(input: OperationInput): Promise<PaymentExecutionResult> {
  let descriptor: PaymentSourceDescriptor;
  try {
    descriptor = await loadPaymentSource(input.source, input.paymentId);
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof Error ? error.message : "결제 정보를 확인하지 못했습니다." };
  }
  if (descriptor.status === "cancelled") {
    return { ok: true, status: "completed", providerRefundId: null, providerStatus: "NOT_CAPTURED", response: { idempotent: true } };
  }
  if (descriptor.sourceSystem !== "deetz" || !descriptor.canCancel) {
    return { ok: false, status: 400, error: "결제 전 대기·실패 건만 취소할 수 있습니다." };
  }

  try {
    if (descriptor.provider === "toss" && descriptor.pgOrderId) {
      const response = await fetch(`https://api.tosspayments.com/v1/payments/orders/${descriptor.pgOrderId}`, {
        headers: tossHeaders(),
        cache: "no-store",
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (response.ok && ["DONE", "PARTIAL_CANCELED"].includes(String(body.status ?? ""))) {
        return { ok: false, status: 409, error: "토스에서 승인된 결제로 확인되었습니다. 환불로 처리해 주세요.", response: body };
      }
      if (!response.ok && response.status >= 500) {
        return { ok: false, status: 502, error: "토스 결제 상태를 확인하지 못해 취소하지 않았습니다.", response: body };
      }
    }
    if (descriptor.provider === "paypal" && descriptor.providerOrderId) {
      const token = await paypalAccessToken();
      const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${descriptor.providerOrderId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) return { ok: false, status: 502, error: "PayPal 주문 상태를 확인하지 못해 취소하지 않았습니다.", response: body };
      if (String(body.status ?? "") === "COMPLETED") {
        return { ok: false, status: 409, error: "PayPal에서 승인된 결제로 확인되었습니다. 환불로 처리해 주세요.", response: body };
      }
    }
  } catch (error) {
    console.error("[admin/payment-cancel] provider lookup failed", error);
    return { ok: false, status: 502, error: "PG 상태를 확인하지 못해 취소하지 않았습니다." };
  }

  const { error } = await adminClient()
    .from(sourceTable(descriptor))
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", descriptor.paymentId)
    .in("status", ["pending", "failed"]);
  if (error) return { ok: false, status: 500, error: "결제 대기 건을 취소하지 못했습니다." };
  return { ok: true, status: "completed", providerRefundId: null, providerStatus: "NOT_CAPTURED", response: null };
}

export async function executeDeetzPaymentOperation(input: OperationInput): Promise<PaymentExecutionResult> {
  if (input.source === "grigoent") {
    return { ok: false, status: 400, error: "grigoent 결제는 내부 명령 API로 실행해야 합니다." };
  }
  return input.operationType === "refund" ? executeNativeRefund(input) : executeNativeCancellation(input);
}

export async function reconcileDeetzPaymentOperation(input: {
  id: string;
  source: CanonicalPaymentSource;
  paymentId: string;
}): Promise<PaymentExecutionResult> {
  if (input.source === "grigoent") return { ok: false, status: 400, error: "grigoent 작업은 내부 명령 API에서 확인해야 합니다." };
  const client = adminClient();
  const { data: ledgerData, error: ledgerError } = await client
    .from("deetz_payment_refunds")
    .select("*")
    .eq("operation_id", input.id)
    .maybeSingle();
  if (ledgerError || !ledgerData) return { ok: false, status: 404, error: "환불 원장을 찾을 수 없습니다." };
  if (ledgerData.status === "completed") {
    return {
      ok: true,
      status: "completed",
      providerRefundId: ledgerData.provider_refund_id as string | null,
      providerStatus: ledgerData.provider_status as string | null,
      response: ledgerData.response_payload,
    };
  }
  if (ledgerData.status === "failed") return { ok: false, status: 409, error: "이미 실패로 종료된 환불입니다." };

  let descriptor: PaymentSourceDescriptor;
  try {
    descriptor = await loadPaymentSource(input.source, input.paymentId);
  } catch (error) {
    return { ok: false, status: 400, error: error instanceof Error ? error.message : "원결제를 찾지 못했습니다." };
  }
  if (!descriptor.provider || !descriptor.paymentKey) return { ok: false, status: 400, error: "PG 거래 정보를 찾을 수 없습니다." };

  let body: Record<string, unknown>;
  let providerRefundId = typeof ledgerData.provider_refund_id === "string" ? ledgerData.provider_refund_id : null;
  let providerStatus: string | null = null;
  try {
    if (descriptor.provider === "toss") {
      const response = await fetch(`https://api.tosspayments.com/v1/payments/${descriptor.paymentKey}`, {
        headers: tossHeaders(),
        cache: "no-store",
      });
      body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) return { ok: false, status: 502, error: String(body.message ?? "토스 환불 상태를 확인하지 못했습니다."), response: body };
      const resolved = matchTossCancel(body, {
        transactionKey: providerRefundId,
        amount: Number(ledgerData.provider_amount),
        reason: String(ledgerData.reason ?? ""),
      });
      if (!resolved.match) {
        const message = resolved.ambiguous
          ? "같은 금액과 사유의 토스 환불이 여러 건이라 자동으로 거래를 특정할 수 없습니다."
          : "토스 응답에서 해당 환불 거래를 찾지 못했습니다.";
        await client.from("deetz_payment_refunds").update({ status: "reconciliation_required", response_payload: body, error_code: resolved.ambiguous ? "TOSS_REFUND_AMBIGUOUS" : "TOSS_REFUND_NOT_FOUND", error_message: message, updated_at: new Date().toISOString() }).eq("id", ledgerData.id);
        return { ok: true, status: "reconciliation_required", providerRefundId, providerStatus: null, response: body };
      }
      providerRefundId = resolved.match.transactionKey ?? providerRefundId;
      providerStatus = resolved.match.status;
    } else {
      if (!providerRefundId) {
        return { ok: true, status: "reconciliation_required", providerRefundId: null, providerStatus: null, response: ledgerData.response_payload };
      }
      const token = await paypalAccessToken();
      const response = await fetch(`${PAYPAL_API_URL}/v2/payments/refunds/${providerRefundId}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      body = (await response.json()) as Record<string, unknown>;
      if (!response.ok) return { ok: false, status: 502, error: String(body.message ?? "PayPal 환불 상태를 확인하지 못했습니다."), response: body };
      providerStatus = typeof body.status === "string" ? body.status : null;
    }
  } catch (error) {
    return { ok: false, status: 502, error: error instanceof Error ? error.message : "PG 환불 상태를 확인하지 못했습니다." };
  }

  const completed = descriptor.provider === "toss" ? providerStatus === "DONE" : providerStatus === "COMPLETED";
  const failed = descriptor.provider === "paypal" && providerStatus === "FAILED";
  if (failed) {
    await client.from("deetz_payment_refunds").update({ status: "failed", provider_refund_id: providerRefundId, provider_status: providerStatus, response_payload: body, error_code: "PROVIDER_REFUND_FAILED", error_message: "PG에서 환불 실패로 확인되었습니다.", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledgerData.id);
    return { ok: false, status: 409, error: "PG에서 환불 실패로 확인되었습니다.", response: body };
  }
  if (!completed) {
    await client.from("deetz_payment_refunds").update({ status: "pending", provider_refund_id: providerRefundId, provider_status: providerStatus, response_payload: body, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledgerData.id);
    return { ok: true, status: "provider_pending", providerRefundId, providerStatus, response: body };
  }

  const full = descriptor.refundedLedgerAmount + Number(ledgerData.ledger_amount) >= descriptor.originalLedgerAmount;
  const finalized = await finishNativeRefund({
    descriptor,
    ledgerId: ledgerData.id as string,
    full,
    providerRefundId,
    providerStatus,
    response: body,
  });
  return { ok: true, status: finalized ? "completed" : "reconciliation_required", providerRefundId, providerStatus, response: body };
}
