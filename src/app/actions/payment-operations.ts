"use server";

import { createHmac, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { executeDeetzPaymentOperation, reconcileDeetzPaymentOperation, type PaymentExecutionResult } from "@/lib/admin/payment-execution";
import { loadPaymentSource, quotePaymentRefund, type CanonicalPaymentSource } from "@/lib/admin/payment-sources";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";

export type PaymentOperationActionResult =
  | { ok: true; operationId: string; status: string; message: string }
  | { ok: false; error: string };

const requestSchema = z
  .object({
    operationType: z.enum(["cancel", "refund"]),
    source: z.enum(["grigoent", "workshop", "workshop_event"]),
    paymentId: z.string().uuid(),
    amount: z.number().positive().optional(),
    reasonCode: z.enum(["customer_request", "duplicate", "schedule_change", "service_issue", "other"]),
    reasonDetail: z.string().trim().min(2, "사유를 2자 이상 입력해 주세요.").max(500),
  })
  .superRefine((value, ctx) => {
    if (value.operationType === "refund" && !value.amount) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "환불 금액을 입력해 주세요." });
    }
  });

const operationIdSchema = z.object({ operationId: z.string().uuid() });

type OperationRow = {
  id: string;
  operation_type: "cancel" | "refund";
  source_system: "deetz" | "grigoent";
  source_type: "training_payment" | "workshop_reservation" | "workshop_event";
  source_order_id: string;
  source_payment_id: string;
  provider: "toss" | "paypal" | null;
  ledger_amount: number;
  ledger_currency: string;
  provider_amount: number;
  provider_currency: string;
  reason_detail: string;
  status: string;
  requested_by: string;
  requested_by_name: string;
  approved_by: string | null;
  processed_at: string | null;
};

function adminClient(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

function displayName(profile: { id: string; display_name?: string | null }): string {
  return profile.display_name?.trim() || `관리자 ${profile.id.slice(0, 8)}`;
}

function sourceFromType(type: OperationRow["source_type"]): CanonicalPaymentSource {
  if (type === "training_payment") return "grigoent";
  if (type === "workshop_reservation") return "workshop";
  return "workshop_event";
}

function executionStatus(result: PaymentExecutionResult): string {
  if (!result.ok) return "failed";
  return result.status;
}

function grigoCommandUrl(): string {
  if (process.env.GRIGOENT_PAYMENT_COMMAND_URL) return process.env.GRIGOENT_PAYMENT_COMMAND_URL;
  const base = (process.env.GRIGOENT_SITE_URL ?? "https://www.grigoent.co.kr").replace(/\/$/, "");
  return `${base}/api/internal/payment-operations`;
}

async function executeGrigoentOperation(
  operation: OperationRow,
  approverId: string,
  action: "cancel" | "refund" | "reconcile" = operation.operation_type,
): Promise<PaymentExecutionResult> {
  const secret = process.env.PAYMENT_COMMAND_SECRET?.trim();
  if (!secret || secret.length < 32) {
    return { ok: false, status: 500, error: "PAYMENT_COMMAND_SECRET 설정이 없거나 너무 짧습니다." };
  }
  const raw = JSON.stringify({
    operationId: operation.id,
    action,
    paymentId: operation.source_payment_id,
    reason: operation.reason_detail,
    ...(action === "refund" ? { amount: Math.round(Number(operation.ledger_amount)) } : {}),
    requestedBy: operation.requested_by,
    approvedBy: operation.approved_by ?? approverId,
  });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");

  try {
    const response = await fetch(grigoCommandUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-timestamp": timestamp,
        "x-payment-signature": signature,
      },
      body: raw,
      cache: "no-store",
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok || body.ok !== true) {
      return {
        ok: false,
        status: response.status,
        error: typeof body.error === "string" ? body.error : "grigoent 환불 실행에 실패했습니다.",
        response: body,
      };
    }
    return {
      ok: true,
      status: body.status === "provider_pending"
        ? "provider_pending"
        : body.status === "reconciliation_required"
          ? "reconciliation_required"
          : "completed",
      providerRefundId: typeof body.providerRefundId === "string" ? body.providerRefundId : null,
      providerStatus: typeof body.providerStatus === "string" ? body.providerStatus : null,
      response: body,
    };
  } catch (error) {
    console.error("[payment-operations] grigo command outcome unknown", error);
    return {
      ok: true,
      status: "reconciliation_required",
      providerRefundId: null,
      providerStatus: null,
      response: { error: error instanceof Error ? error.message : "응답 없음" },
    };
  }
}

export async function requestPaymentOperationAction(
  input: z.input<typeof requestSchema>,
): Promise<PaymentOperationActionResult> {
  const profile = await requireAdmin();
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };

  try {
    const value = parsed.data;
    const quoted = value.operationType === "refund"
      ? await quotePaymentRefund(value.source, value.paymentId, value.amount as number)
      : null;
    const descriptor = quoted?.descriptor ?? await loadPaymentSource(value.source, value.paymentId);
    if (value.operationType === "cancel" && !descriptor.canCancel) {
      return { ok: false, error: "결제 전 대기·실패 건만 취소 요청할 수 있습니다." };
    }
    const quote = quoted?.quote ?? null;
    const operationId = randomUUID();
    const now = new Date().toISOString();
    const { error } = await adminClient().from("payment_operations").insert({
      id: operationId,
      operation_type: value.operationType,
      source_system: descriptor.sourceSystem,
      source_type: descriptor.sourceType,
      source_order_id: descriptor.orderId,
      source_payment_id: descriptor.paymentId,
      order_no: descriptor.orderNo,
      provider: descriptor.provider,
      ledger_amount: quote?.ledgerAmount ?? 0,
      ledger_currency: descriptor.ledgerCurrency,
      provider_amount: quote?.providerAmount ?? 0,
      provider_currency: descriptor.providerCurrency,
      reason_code: value.reasonCode,
      reason_detail: value.reasonDetail,
      status: "requested",
      requested_by: profile.id,
      requested_by_name: displayName(profile),
      idempotency_key: operationId,
      request_payload: {
        sourceStatus: descriptor.status,
        originalLedgerAmount: descriptor.originalLedgerAmount,
        refundedLedgerAmount: descriptor.refundedLedgerAmount,
        refundableLedgerAmount: descriptor.refundableLedgerAmount,
        full: quote?.full ?? false,
      },
      requested_at: now,
      updated_at: now,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "이 결제에는 이미 승인 대기 또는 처리 중인 작업이 있습니다." };
      console.error("[payment-operations] request insert failed", error);
      return { ok: false, error: "결제 작업 요청을 저장하지 못했습니다." };
    }
    revalidatePath("/admin/payments");
    return {
      ok: true,
      operationId,
      status: "requested",
      message: value.operationType === "refund" ? "환불 요청을 등록했습니다. 다른 관리자의 승인이 필요합니다." : "취소 요청을 등록했습니다. 다른 관리자의 승인이 필요합니다.",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "결제 정보를 확인하지 못했습니다." };
  }
}

export async function approvePaymentOperationAction(
  input: z.input<typeof operationIdSchema>,
): Promise<PaymentOperationActionResult> {
  const profile = await requireAdmin();
  const parsed = operationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "작업 ID를 확인해 주세요." };
  const client = adminClient();
  const { data: found, error: readError } = await client
    .from("payment_operations")
    .select("*")
    .eq("id", parsed.data.operationId)
    .maybeSingle();
  if (readError || !found) return { ok: false, error: "결제 작업을 찾을 수 없습니다." };
  const current = found as OperationRow;
  if (current.requested_by === profile.id) return { ok: false, error: "요청자는 자신의 결제 작업을 승인할 수 없습니다." };
  if (current.status !== "requested") return { ok: false, error: "이미 승인·거절되었거나 처리 중인 작업입니다." };

  const approvedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await client
    .from("payment_operations")
    .update({
      status: "processing",
      approved_by: profile.id,
      approved_by_name: displayName(profile),
      approved_at: approvedAt,
      processed_at: approvedAt,
      updated_at: approvedAt,
      version: 2,
    })
    .eq("id", current.id)
    .eq("status", "requested")
    .neq("requested_by", profile.id)
    .select("*")
    .maybeSingle();
  if (claimError || !claimed) return { ok: false, error: "다른 관리자가 먼저 처리했거나 상태가 변경되었습니다." };
  const operation = claimed as OperationRow;

  const result = operation.source_system === "grigoent"
    ? await executeGrigoentOperation(operation, profile.id)
    : await executeDeetzPaymentOperation({
        id: operation.id,
        operationType: operation.operation_type,
        source: sourceFromType(operation.source_type),
        paymentId: operation.source_payment_id,
        ledgerAmount: Number(operation.ledger_amount),
        providerAmount: Number(operation.provider_amount),
        reason: operation.reason_detail,
      });
  const completedAt = new Date().toISOString();
  const patch = result.ok
    ? {
        status: executionStatus(result),
        provider_refund_id: result.providerRefundId,
        provider_status: result.providerStatus,
        response_payload: result.response,
        completed_at: result.status === "completed" ? completedAt : null,
        error_code: null,
        error_message: null,
        updated_at: completedAt,
        version: 3,
      }
    : {
        status: "failed",
        response_payload: result.response ?? null,
        error_code: result.code ?? `HTTP_${result.status}`,
        error_message: result.error,
        updated_at: completedAt,
        version: 3,
      };
  const { error: updateError } = await client.from("payment_operations").update(patch).eq("id", operation.id);
  if (updateError) {
    console.error("[payment-operations] operation finalization failed", updateError);
    revalidatePath("/admin/payments");
    return { ok: false, error: "PG 처리는 실행되었지만 통제 원장 갱신에 실패했습니다. 같은 작업을 다시 승인하지 마세요." };
  }
  revalidatePath("/admin/payments");
  if (!result.ok) return { ok: false, error: result.error };
  const message = result.status === "completed"
    ? "결제 작업이 완료되었습니다."
    : result.status === "provider_pending"
      ? "PG가 작업을 접수했으며 완료 확인을 기다리고 있습니다."
      : "PG 결과가 불확실해 대사가 필요합니다. 같은 작업을 다시 실행하지 마세요.";
  return { ok: true, operationId: operation.id, status: result.status, message };
}

export async function rejectPaymentOperationAction(
  input: z.input<typeof operationIdSchema>,
): Promise<PaymentOperationActionResult> {
  const profile = await requireAdmin();
  const parsed = operationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "작업 ID를 확인해 주세요." };
  const client = adminClient();
  const { data: operation } = await client
    .from("payment_operations")
    .select("id, status, requested_by")
    .eq("id", parsed.data.operationId)
    .maybeSingle();
  if (!operation || operation.status !== "requested") return { ok: false, error: "승인 대기 중인 작업이 아닙니다." };
  const nextStatus = operation.requested_by === profile.id ? "cancelled" : "rejected";
  const now = new Date().toISOString();
  const { error } = await client
    .from("payment_operations")
    .update({
      status: nextStatus,
      approved_by: operation.requested_by === profile.id ? null : profile.id,
      approved_by_name: operation.requested_by === profile.id ? null : displayName(profile),
      approved_at: operation.requested_by === profile.id ? null : now,
      completed_at: now,
      updated_at: now,
      version: 2,
    })
    .eq("id", operation.id)
    .eq("status", "requested");
  if (error) return { ok: false, error: "작업 요청 상태를 변경하지 못했습니다." };
  revalidatePath("/admin/payments");
  return {
    ok: true,
    operationId: operation.id as string,
    status: nextStatus,
    message: nextStatus === "cancelled" ? "요청을 취소했습니다." : "요청을 거절했습니다.",
  };
}

export async function reconcilePaymentOperationAction(
  input: z.input<typeof operationIdSchema>,
): Promise<PaymentOperationActionResult> {
  const profile = await requireAdmin();
  const parsed = operationIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "작업 ID를 확인해 주세요." };
  const client = adminClient();
  const { data, error } = await client.from("payment_operations").select("*").eq("id", parsed.data.operationId).maybeSingle();
  if (error || !data) return { ok: false, error: "결제 작업을 찾을 수 없습니다." };
  const operation = data as OperationRow;
  const staleProcessing = operation.status === "processing"
    && Boolean(operation.processed_at)
    && Date.now() - new Date(operation.processed_at as string).getTime() >= 5 * 60 * 1000;
  if (!["provider_pending", "reconciliation_required"].includes(operation.status) && !staleProcessing) {
    return { ok: false, error: "PG 상태 확인이 필요한 작업이 아닙니다." };
  }

  const result = operation.operation_type === "cancel"
    ? operation.source_system === "grigoent"
      ? await executeGrigoentOperation(operation, profile.id, "cancel")
      : await executeDeetzPaymentOperation({
          id: operation.id,
          operationType: "cancel",
          source: sourceFromType(operation.source_type),
          paymentId: operation.source_payment_id,
          ledgerAmount: 0,
          providerAmount: 0,
          reason: operation.reason_detail,
        })
    : operation.source_system === "grigoent"
      ? await executeGrigoentOperation(operation, profile.id, "reconcile")
      : await reconcileDeetzPaymentOperation({
          id: operation.id,
          source: sourceFromType(operation.source_type),
          paymentId: operation.source_payment_id,
        });
  if (!result.ok) return { ok: false, error: result.error };

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await client
    .from("payment_operations")
    .update({
      status: result.status,
      provider_refund_id: result.providerRefundId,
      provider_status: result.providerStatus,
      response_payload: result.response,
      completed_at: result.status === "completed" ? now : null,
      error_code: null,
      error_message: null,
      updated_at: now,
      version: 4,
    })
    .eq("id", operation.id)
    .in("status", ["processing", "provider_pending", "reconciliation_required"])
    .select("id")
    .maybeSingle();
  if (updateError || !updated) return { ok: false, error: "PG 상태는 확인했지만 통제 원장을 갱신하지 못했습니다." };
  revalidatePath("/admin/payments");
  return {
    ok: true,
    operationId: operation.id,
    status: result.status,
    message: result.status === "completed"
      ? operation.operation_type === "refund" ? "PG 환불 완료를 확인했습니다." : "결제 전 취소 완료를 확인했습니다."
      : "아직 PG 완료 확인이 필요합니다.",
  };
}
