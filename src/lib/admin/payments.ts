import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { extractPayPalCapture, extractTossCharge } from "@/lib/payments/refund-calculation";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminPaymentSource = "grigoent" | "visa_mirror" | "workshop" | "workshop_event";
export type AdminRefundState = "none" | "partial" | "full" | "pending" | "attention";

export type AdminPaymentRefund = {
  id: string;
  operationId: string | null;
  status: string;
  amount: number;
  currency: string;
  providerAmount: number;
  providerCurrency: string;
  providerRefundId: string | null;
  providerStatus: string | null;
  reason: string;
  requestedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

export type AdminPaymentLine = {
  id: string;
  sequence: number;
  status: string;
  amount: number;
  currency: string;
  provider: string | null;
  providerAmount: number;
  providerCurrency: string;
  refundedAmount: number;
  refundedProviderAmount: number;
  refundableAmount: number;
  refundableProviderAmount: number;
  paidAt: string | null;
  receiptUrl: string | null;
  canRefund: boolean;
  canCancel: boolean;
  refunds: AdminPaymentRefund[];
};

export type AdminPaymentOperation = {
  id: string;
  operationType: "cancel" | "refund";
  executionMode?: "two_person" | "direct";
  sourcePaymentId: string;
  status: string;
  amount: number;
  currency: string;
  providerAmount: number;
  providerCurrency: string;
  reasonCode: string;
  reasonDetail: string;
  requestedBy: string;
  requestedByName: string;
  approvedBy: string | null;
  approvedByName: string | null;
  requestedAt: string;
  approvedAt: string | null;
  processedAt: string | null;
  completedAt: string | null;
  providerRefundId: string | null;
  providerStatus: string | null;
  errorMessage: string | null;
};

export type AdminPaymentRow = {
  id: string;
  source: AdminPaymentSource;
  sourceLabel: string;
  productSlug: string | null;
  productLabel: string;
  planLabel: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  status: string;
  refundState: AdminRefundState;
  totalAmount: number | null;
  paidAmount: number;
  refundedAmount: number;
  refundableAmount: number;
  currency: string;
  provider: string | null;
  orderNo: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
  deetzApplicationId: string | null;
  eventId: string | null;
  memo: string | null;
  paymentCount: number;
  failedPaymentCount: number;
  isTest: boolean;
  needsAttention: boolean;
  attentionReason: string | null;
  paymentLines: AdminPaymentLine[];
  operations: AdminPaymentOperation[];
};

export type AdminPaymentsData = {
  items: AdminPaymentRow[];
  warnings: string[];
  grigoentConfigured: boolean;
  executionConfigured: boolean;
  generatedAt: string;
};

type UnknownRow = Record<string, unknown>;

const PRODUCT_LABELS: Record<string, string> = {
  "training-and-placement": "트레이닝 패키지 · 400만원 상품",
  "audition-fee": "오디션 참석비",
  "monthly-training": "월간 트레이닝 · 140만원",
  "monthly-training-100": "월간 트레이닝 · 100만원",
  "village-deposit": "Village 예약금",
  "payment-test": "결제 테스트 상품",
};

const VISA_PRODUCT_SLUGS = new Set([
  "training-and-placement",
  "audition-fee",
  "monthly-training",
  "monthly-training-100",
]);

function stringValue(row: UnknownRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(row: UnknownRow, key: string): number | null {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function jsonObject(value: unknown): UnknownRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRow) : {};
}

function productLabel(slug: string | null, title?: string | null): string {
  if (title) return title;
  if (slug && PRODUCT_LABELS[slug]) return PRODUCT_LABELS[slug];
  return slug ? `상품 · ${slug}` : "상품 미지정";
}

function providerCharge(payment: UnknownRow, ledgerAmount: number, ledgerCurrency: string) {
  const provider = stringValue(payment, "pg_provider");
  if (provider === "paypal") {
    const capture = extractPayPalCapture(payment.raw);
    return {
      amount: capture.amount ?? ledgerAmount,
      currency: capture.currency ?? ledgerCurrency,
    };
  }
  if (provider === "toss") {
    const charge = extractTossCharge(payment.raw);
    return { amount: charge.amount ?? ledgerAmount, currency: charge.currency };
  }
  return { amount: ledgerAmount, currency: ledgerCurrency };
}

function operationsFrom(rows: UnknownRow[]): AdminPaymentOperation[] {
  return rows.map((row) => ({
    id: stringValue(row, "id") ?? "",
    operationType: stringValue(row, "operation_type") === "cancel" ? "cancel" : "refund",
    executionMode: stringValue(row, "execution_mode") === "direct" ? "direct" : "two_person",
    sourcePaymentId: stringValue(row, "source_payment_id") ?? "",
    status: stringValue(row, "status") ?? "unknown",
    amount: numberValue(row, "ledger_amount") ?? 0,
    currency: stringValue(row, "ledger_currency") ?? "KRW",
    providerAmount: numberValue(row, "provider_amount") ?? 0,
    providerCurrency: stringValue(row, "provider_currency") ?? "KRW",
    reasonCode: stringValue(row, "reason_code") ?? "other",
    reasonDetail: stringValue(row, "reason_detail") ?? "사유 없음",
    requestedBy: stringValue(row, "requested_by") ?? "",
    requestedByName: stringValue(row, "requested_by_name") ?? "관리자",
    approvedBy: stringValue(row, "approved_by"),
    approvedByName: stringValue(row, "approved_by_name"),
    requestedAt: stringValue(row, "requested_at") ?? new Date(0).toISOString(),
    approvedAt: stringValue(row, "approved_at"),
    processedAt: stringValue(row, "processed_at"),
    completedAt: stringValue(row, "completed_at"),
    providerRefundId: stringValue(row, "provider_refund_id"),
    providerStatus: stringValue(row, "provider_status"),
    errorMessage: stringValue(row, "error_message"),
  }));
}

function refundFrom(row: UnknownRow, ledgerKey: string, ledgerCurrency: string): AdminPaymentRefund {
  return {
    id: stringValue(row, "id") ?? "",
    operationId: stringValue(row, "operation_id"),
    status: stringValue(row, "status") ?? "unknown",
    amount: numberValue(row, ledgerKey) ?? 0,
    currency: stringValue(row, "ledger_currency") ?? ledgerCurrency,
    providerAmount: numberValue(row, "provider_amount") ?? 0,
    providerCurrency: stringValue(row, "provider_currency") ?? ledgerCurrency,
    providerRefundId: stringValue(row, "provider_refund_id"),
    providerStatus: stringValue(row, "provider_status"),
    reason: stringValue(row, "reason") ?? "사유 없음",
    requestedAt: stringValue(row, "requested_at") ?? new Date(0).toISOString(),
    completedAt: stringValue(row, "completed_at"),
    errorMessage: stringValue(row, "error_message"),
  };
}

function makePaymentLine(params: {
  payment: UnknownRow;
  sequence: number;
  ledgerAmount: number;
  ledgerCurrency: string;
  refunds: AdminPaymentRefund[];
  capturedStatuses: string[];
}): AdminPaymentLine {
  const status = stringValue(params.payment, "status") ?? "unknown";
  const provider = stringValue(params.payment, "pg_provider");
  const charge = providerCharge(params.payment, params.ledgerAmount, params.ledgerCurrency);
  const completed = params.refunds.filter((refund) => refund.status === "completed");
  const refundedAmount = completed.reduce((sum, refund) => sum + refund.amount, 0);
  const refundedProviderAmount = completed.reduce((sum, refund) => sum + refund.providerAmount, 0);
  const refundableAmount = Math.max(0, params.ledgerAmount - refundedAmount);
  const refundableProviderAmount = Math.max(0, charge.amount - refundedProviderAmount);
  const hasActiveRefund = params.refunds.some((refund) => ["processing", "pending", "reconciliation_required"].includes(refund.status));
  const captured = params.capturedStatuses.includes(status);

  return {
    id: stringValue(params.payment, "id") ?? "",
    sequence: params.sequence,
    status,
    amount: params.ledgerAmount,
    currency: params.ledgerCurrency,
    provider,
    providerAmount: charge.amount,
    providerCurrency: charge.currency,
    refundedAmount,
    refundedProviderAmount,
    refundableAmount,
    refundableProviderAmount,
    paidAt: stringValue(params.payment, "paid_at"),
    receiptUrl: stringValue(params.payment, "receipt_url"),
    canRefund: captured && ["toss", "paypal"].includes(provider ?? "") && Boolean(stringValue(params.payment, "payment_key")) && refundableAmount > 0 && !hasActiveRefund,
    canCancel: ["pending", "failed"].includes(status) && !stringValue(params.payment, "payment_key"),
    refunds: params.refunds.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
  };
}

function attentionFor(input: {
  status: string;
  productSlug: string | null;
  totalAmount: number | null;
  paidAmount: number;
  failedPaymentCount: number;
  deetzApplicationId: string | null;
  isTest: boolean;
  operations: AdminPaymentOperation[];
}): string | null {
  if (input.operations.some((operation) => operation.status === "reconciliation_required")) return "PG 결과 대사가 필요한 환불·취소 작업이 있습니다";
  if (input.operations.some((operation) => operation.status === "provider_pending")) return "PG 처리 완료 확인을 기다리는 작업이 있습니다";
  if (input.isTest) return "내부 결제 테스트 상품";
  if (input.status === "recovery_required") return "결제는 되었지만 수동 복구가 필요합니다";
  if (input.failedPaymentCount > 0 && input.paidAmount === 0) return "결제 실패 이력이 있습니다";
  if (input.totalAmount !== null && input.status === "completed" && input.paidAmount + 0.001 < input.totalAmount) return "완료 상태지만 순납부액이 주문액보다 적습니다";
  if (VISA_PRODUCT_SLUGS.has(input.productSlug ?? "") && !input.deetzApplicationId) return "deetz 비자 케이스와 연결되지 않았습니다";
  return null;
}

function refundState(lines: AdminPaymentLine[], operations: AdminPaymentOperation[]): AdminRefundState {
  if (operations.some((operation) => operation.status === "reconciliation_required")) return "attention";
  if (operations.some((operation) => ["processing", "provider_pending"].includes(operation.status))) return "pending";
  const original = lines.reduce((sum, line) => sum + line.amount, 0);
  const refunded = lines.reduce((sum, line) => sum + line.refundedAmount, 0);
  if (refunded <= 0) return "none";
  return refunded + 0.001 >= original ? "full" : "partial";
}

function finishRow(input: Omit<AdminPaymentRow, "needsAttention" | "attentionReason" | "refundState">): AdminPaymentRow {
  const attentionReason = attentionFor({
    status: input.status,
    productSlug: input.productSlug,
    totalAmount: input.totalAmount,
    paidAmount: input.paidAmount,
    failedPaymentCount: input.failedPaymentCount,
    deetzApplicationId: input.deetzApplicationId,
    isTest: input.isTest,
    operations: input.operations,
  });
  return {
    ...input,
    refundState: refundState(input.paymentLines, input.operations),
    needsAttention: Boolean(attentionReason),
    attentionReason,
  };
}

function grigoentClient(): SupabaseClient | null {
  const url = process.env.GRIGOENT_SUPABASE_URL ?? process.env.NEXT_PUBLIC_GRIGOENT_SUPABASE_URL;
  const key = process.env.GRIGOENT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type GrigoentLoad = {
  items: AdminPaymentRow[];
  byId: Map<string, AdminPaymentRow>;
  byOrderNo: Map<string, AdminPaymentRow>;
  warnings: string[];
  configured: boolean;
};

async function loadGrigoent(operationRows: UnknownRow[]): Promise<GrigoentLoad> {
  const svc = grigoentClient();
  if (!svc) {
    return {
      items: [],
      byId: new Map(),
      byOrderNo: new Map(),
      warnings: ["grigoent 원장 연결 설정이 없어 deetz 내부 결제만 표시됩니다."],
      configured: false,
    };
  }
  const [{ data: orders, error: ordersError }, { data: products }, { data: plans }] = await Promise.all([
    svc.from("training_orders").select("*").order("created_at", { ascending: false }).limit(1000),
    svc.from("training_products").select("*"),
    svc.from("training_price_plans").select("*"),
  ]);
  if (ordersError) {
    return { items: [], byId: new Map(), byOrderNo: new Map(), warnings: ["grigoent 주문 원장을 읽지 못했습니다."], configured: true };
  }
  const orderRows = (orders ?? []) as UnknownRow[];
  const orderIds = orderRows.map((row) => stringValue(row, "id")).filter((id): id is string => Boolean(id));
  const { data: payments, error: paymentError } = orderIds.length
    ? await svc.from("training_order_payments").select("*").in("order_id", orderIds).order("sequence", { ascending: true })
    : { data: [], error: null };
  const paymentRows = (payments ?? []) as UnknownRow[];
  const paymentIds = paymentRows.map((row) => stringValue(row, "id")).filter((id): id is string => Boolean(id));
  const { data: refunds, error: refundError } = paymentIds.length
    ? await svc.from("training_payment_refunds").select("*").in("payment_id", paymentIds)
    : { data: [], error: null };
  const warnings: string[] = [];
  if (paymentError) warnings.push("grigoent 회차별 결제 상세를 읽지 못했습니다.");
  if (refundError) warnings.push("grigoent 환불 원장을 읽지 못했습니다. 환불 마이그레이션 적용 여부를 확인해 주세요.");

  const productsById = new Map((products ?? []).map((row) => [String(row.id), row as UnknownRow]));
  const plansById = new Map((plans ?? []).map((row) => [String(row.id), row as UnknownRow]));
  const paymentsByOrder = new Map<string, UnknownRow[]>();
  for (const payment of paymentRows) {
    const orderId = stringValue(payment, "order_id");
    if (orderId) paymentsByOrder.set(orderId, [...(paymentsByOrder.get(orderId) ?? []), payment]);
  }
  const refundsByPayment = new Map<string, UnknownRow[]>();
  for (const refund of (refunds ?? []) as UnknownRow[]) {
    const paymentId = stringValue(refund, "payment_id");
    if (paymentId) refundsByPayment.set(paymentId, [...(refundsByPayment.get(paymentId) ?? []), refund]);
  }
  const operationsByPayment = new Map<string, UnknownRow[]>();
  for (const operation of operationRows.filter((row) => stringValue(row, "source_system") === "grigoent")) {
    const paymentId = stringValue(operation, "source_payment_id");
    if (paymentId) operationsByPayment.set(paymentId, [...(operationsByPayment.get(paymentId) ?? []), operation]);
  }

  const items: AdminPaymentRow[] = [];
  for (const order of orderRows) {
    const orderId = stringValue(order, "id");
    if (!orderId) continue;
    const product = productsById.get(stringValue(order, "product_id") ?? "") ?? {};
    const plan = plansById.get(stringValue(order, "plan_id") ?? "") ?? {};
    const slug = stringValue(product, "slug") ?? stringValue(order, "product_slug");
    const orderPayments = paymentsByOrder.get(orderId) ?? [];
    const lines = orderPayments.map((payment, index) => {
      const paymentId = stringValue(payment, "id") ?? "";
      const amount = numberValue(payment, "amount") ?? 0;
      const refundRows = refundsByPayment.get(paymentId) ?? [];
      return makePaymentLine({
        payment,
        sequence: numberValue(payment, "sequence") ?? index + 1,
        ledgerAmount: amount,
        ledgerCurrency: "KRW",
        refunds: refundRows.map((row) => refundFrom(row, "ledger_amount_krw", "KRW")),
        capturedStatuses: ["paid", "refunded"],
      });
    });
    const operationRowsForOrder = orderPayments.flatMap((payment) => operationsByPayment.get(stringValue(payment, "id") ?? "") ?? []);
    const operations = operationsFrom(operationRowsForOrder).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const captured = lines.filter((line) => ["paid", "refunded"].includes(line.status));
    const refundedAmount = lines.reduce((sum, line) => sum + line.refundedAmount, 0);
    const gross = captured.reduce((sum, line) => sum + line.amount, 0);
    const paidAmount = Math.max(0, gross - refundedAmount);
    const status = refundedAmount > 0 && paidAmount <= 0 ? "refunded" : stringValue(order, "status") ?? "unknown";
    const failedPaymentCount = lines.filter((line) => line.status === "failed").length;
    const applicationId = stringValue(order, "visa_application_id");
    const orderNo = stringValue(order, "order_no");

    items.push(finishRow({
      id: `grigoent:${orderId}`,
      source: "grigoent",
      sourceLabel: "grigoent 원장",
      productSlug: slug,
      productLabel: productLabel(slug, stringValue(product, "title")),
      planLabel: stringValue(plan, "label"),
      customerName: stringValue(order, "customer_name") ?? "이름 없음",
      customerEmail: stringValue(order, "customer_email") ?? "이메일 없음",
      customerPhone: stringValue(order, "customer_phone"),
      status,
      totalAmount: numberValue(order, "total_amount"),
      paidAmount,
      refundedAmount,
      refundableAmount: lines.reduce((sum, line) => sum + line.refundableAmount, 0),
      currency: "KRW",
      provider: stringValue(order, "pg_provider") ?? lines.find((line) => line.provider)?.provider ?? null,
      orderNo,
      createdAt: stringValue(order, "created_at") ?? new Date(0).toISOString(),
      paidAt: lines.map((line) => line.paidAt).filter((value): value is string => Boolean(value)).sort().pop() ?? null,
      refundedAt: lines.flatMap((line) => line.refunds.map((refund) => refund.completedAt)).filter((value): value is string => Boolean(value)).sort().pop() ?? null,
      deetzApplicationId: applicationId,
      eventId: null,
      memo: stringValue(order, "memo"),
      paymentCount: lines.length,
      failedPaymentCount,
      isTest: slug === "payment-test",
      paymentLines: lines,
      operations,
    }));
  }
  return {
    items,
    byId: new Map(items.map((item) => [item.id.replace("grigoent:", ""), item])),
    byOrderNo: new Map(items.filter((item) => item.orderNo).map((item) => [item.orderNo as string, item])),
    warnings,
    configured: true,
  };
}

async function loadDeetzRows(grigoent: GrigoentLoad, operationRows: UnknownRow[], refundRows: UnknownRow[]) {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const [appsRes, reservationsRes, artistsRes, eventsRes, eventOrdersRes, registrationsRes, sessionsRes] = await Promise.all([
    admin.from("dancer_visa_applications").select("*").order("created_at", { ascending: false }).limit(1000),
    admin.from("workshop_reservations").select("*").order("created_at", { ascending: false }).limit(1000),
    admin.from("workshop_artists").select("id, name, slug"),
    admin.from("workshop_events").select("id, title, slug"),
    admin.from("workshop_event_orders").select("*").order("created_at", { ascending: false }).limit(1000),
    admin.from("workshop_event_registrations").select("order_id, session_id"),
    admin.from("workshop_event_sessions").select("id, title"),
  ]);
  const warnings: string[] = [];
  if (appsRes.error) warnings.push("비자 결제 데이터를 읽지 못했습니다.");
  if (reservationsRes.error) warnings.push("워크샵 예약 결제를 읽지 못했습니다.");
  if (eventOrdersRes.error) warnings.push("워크샵 행사 결제를 읽지 못했습니다.");

  const artistById = new Map((artistsRes.data ?? []).map((row) => [String(row.id), row as UnknownRow]));
  const eventById = new Map((eventsRes.data ?? []).map((row) => [String(row.id), row as UnknownRow]));
  const sessionById = new Map((sessionsRes.data ?? []).map((row) => [String(row.id), String(row.title)]));
  const sessionIdsByOrder = new Map<string, string[]>();
  for (const row of (registrationsRes.data ?? []) as UnknownRow[]) {
    const orderId = stringValue(row, "order_id");
    const sessionId = stringValue(row, "session_id");
    if (orderId && sessionId) sessionIdsByOrder.set(orderId, [...(sessionIdsByOrder.get(orderId) ?? []), sessionId]);
  }
  const deetzRefunds = new Map<string, UnknownRow[]>();
  for (const refund of refundRows) {
    const key = `${stringValue(refund, "source_type")}:${stringValue(refund, "source_id")}`;
    deetzRefunds.set(key, [...(deetzRefunds.get(key) ?? []), refund]);
  }
  const deetzOperations = new Map<string, UnknownRow[]>();
  for (const operation of operationRows.filter((row) => stringValue(row, "source_system") === "deetz")) {
    const key = `${stringValue(operation, "source_type")}:${stringValue(operation, "source_payment_id")}`;
    deetzOperations.set(key, [...(deetzOperations.get(key) ?? []), operation]);
  }

  const items: AdminPaymentRow[] = [];
  for (const app of (appsRes.data ?? []) as UnknownRow[]) {
    const appId = stringValue(app, "id");
    if (!appId) continue;
    const meta = jsonObject(app.payment_meta);
    const slug = stringValue(meta, "issued_product_slug") ?? stringValue(app, "program_product_slug");
    const paymentStatus = stringValue(app, "payment_status") ?? "unpaid";
    const orderNo = stringValue(app, "payment_order_no");
    const externalOrderId = stringValue(app, "external_training_order_id");
    const linkedOrder = (externalOrderId ? grigoent.byId.get(externalOrderId) : null) ?? (orderNo ? grigoent.byOrderNo.get(orderNo) : null);
    if (linkedOrder) {
      linkedOrder.deetzApplicationId = appId;
      if (linkedOrder.attentionReason === "deetz 비자 케이스와 연결되지 않았습니다") {
        linkedOrder.needsAttention = false;
        linkedOrder.attentionReason = null;
      }
      continue;
    }
    if (paymentStatus === "unpaid" && !orderNo && !slug) continue;
    const amount = numberValue(app, "payment_amount_krw") ?? numberValue(app, "quoted_price_krw") ?? numberValue(app, "base_price_krw");
    const paid = ["paid", "refunded"].includes(paymentStatus) ? amount ?? 0 : 0;
    const refunded = paymentStatus === "refunded" ? amount ?? 0 : 0;
    items.push(finishRow({
      id: `visa_mirror:${appId}`,
      source: "visa_mirror",
      sourceLabel: "deetz 비자 미러",
      productSlug: slug,
      productLabel: productLabel(slug),
      planLabel: null,
      customerName: stringValue(app, "name") ?? stringValue(app, "email") ?? "비자 신청자",
      customerEmail: stringValue(app, "email") ?? "이메일 없음",
      customerPhone: stringValue(app, "phone"),
      status: paymentStatus,
      totalAmount: amount,
      paidAmount: Math.max(0, paid - refunded),
      refundedAmount: refunded,
      refundableAmount: 0,
      currency: "KRW",
      provider: stringValue(app, "payment_provider"),
      orderNo,
      createdAt: stringValue(app, "created_at") ?? new Date(0).toISOString(),
      paidAt: stringValue(app, "paid_at"),
      refundedAt: stringValue(app, "payment_refunded_at"),
      deetzApplicationId: appId,
      eventId: null,
      memo: stringValue(app, "memo"),
      paymentCount: orderNo ? 1 : 0,
      failedPaymentCount: 0,
      isTest: slug === "payment-test",
      paymentLines: [],
      operations: [],
    }));
  }

  for (const reservation of (reservationsRes.data ?? []) as UnknownRow[]) {
    const id = stringValue(reservation, "id");
    if (!id) continue;
    const amount = numberValue(reservation, "amount") ?? 0;
    const key = `workshop_reservation:${id}`;
    const refundHistory = (deetzRefunds.get(key) ?? []).map((row) => refundFrom(row, "ledger_amount", "KRW"));
    const line = makePaymentLine({ payment: reservation, sequence: 1, ledgerAmount: amount, ledgerCurrency: "KRW", refunds: refundHistory, capturedStatuses: ["paid", "confirmed", "transferred", "refunded"] });
    const legacyRefunded = stringValue(reservation, "status") === "refunded" && line.refundedAmount === 0 ? amount : 0;
    if (legacyRefunded) {
      line.refundedAmount = amount;
      line.refundableAmount = 0;
      line.canRefund = false;
    }
    const operations = operationsFrom(deetzOperations.get(key) ?? []).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const status = line.refundedAmount >= amount && amount > 0 ? "refunded" : line.status;
    const artist = artistById.get(stringValue(reservation, "artist_id") ?? "") ?? {};
    items.push(finishRow({
      id: `workshop:${id}`,
      source: "workshop",
      sourceLabel: "워크샵 예약",
      productSlug: "workshop-reservation",
      productLabel: `워크샵 예약금 · ${stringValue(artist, "name") ?? "아티스트 미지정"}`,
      planLabel: stringValue(artist, "slug"),
      customerName: stringValue(reservation, "customer_name") ?? "이름 없음",
      customerEmail: stringValue(reservation, "customer_email") ?? "이메일 없음",
      customerPhone: stringValue(reservation, "customer_phone"),
      status,
      totalAmount: amount,
      paidAmount: Math.max(0, amount - line.refundedAmount),
      refundedAmount: line.refundedAmount,
      refundableAmount: line.refundableAmount,
      currency: "KRW",
      provider: line.provider,
      orderNo: stringValue(reservation, "order_no"),
      createdAt: stringValue(reservation, "created_at") ?? new Date(0).toISOString(),
      paidAt: line.paidAt,
      refundedAt: refundHistory.map((refund) => refund.completedAt).filter((value): value is string => Boolean(value)).sort().pop() ?? stringValue(reservation, "refunded_at"),
      deetzApplicationId: null,
      eventId: null,
      memo: stringValue(reservation, "memo"),
      paymentCount: 1,
      failedPaymentCount: line.status === "failed" ? 1 : 0,
      isTest: false,
      paymentLines: [line],
      operations,
    }));
  }

  for (const order of (eventOrdersRes.data ?? []) as UnknownRow[]) {
    const id = stringValue(order, "id");
    if (!id) continue;
    const currency = stringValue(order, "charged_currency") ?? "KRW";
    const amount = numberValue(order, "charged_amount") ?? numberValue(order, "amount_krw") ?? 0;
    const key = `workshop_event:${id}`;
    const refundHistory = (deetzRefunds.get(key) ?? []).map((row) => refundFrom(row, "ledger_amount", currency));
    const line = makePaymentLine({ payment: order, sequence: 1, ledgerAmount: amount, ledgerCurrency: currency, refunds: refundHistory, capturedStatuses: ["paid", "refunded"] });
    const legacyRefunded = stringValue(order, "status") === "refunded" && line.refundedAmount === 0 ? amount : 0;
    if (legacyRefunded) {
      line.refundedAmount = amount;
      line.refundableAmount = 0;
      line.canRefund = false;
    }
    const operations = operationsFrom(deetzOperations.get(key) ?? []).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    const event = eventById.get(stringValue(order, "event_id") ?? "") ?? {};
    const sessions = (sessionIdsByOrder.get(id) ?? []).map((sessionId) => sessionById.get(sessionId)).filter((value): value is string => Boolean(value));
    items.push(finishRow({
      id: `workshop_event:${id}`,
      source: "workshop_event",
      sourceLabel: "워크샵 행사",
      productSlug: "workshop-event",
      productLabel: `워크샵 행사 · ${stringValue(event, "title") ?? "행사 미지정"}`,
      planLabel: sessions.length ? sessions.join(", ") : null,
      customerName: stringValue(order, "customer_name") ?? "이름 없음",
      customerEmail: stringValue(order, "customer_email") ?? "이메일 없음",
      customerPhone: stringValue(order, "customer_phone"),
      status: line.refundedAmount >= amount && amount > 0 ? "refunded" : line.status,
      totalAmount: amount,
      paidAmount: Math.max(0, amount - line.refundedAmount),
      refundedAmount: line.refundedAmount,
      refundableAmount: line.refundableAmount,
      currency,
      provider: line.provider,
      orderNo: stringValue(order, "order_no"),
      createdAt: stringValue(order, "created_at") ?? new Date(0).toISOString(),
      paidAt: line.paidAt,
      refundedAt: refundHistory.map((refund) => refund.completedAt).filter((value): value is string => Boolean(value)).sort().pop() ?? stringValue(order, "refunded_at"),
      deetzApplicationId: null,
      eventId: stringValue(order, "event_id"),
      memo: stringValue(order, "memo"),
      paymentCount: 1,
      failedPaymentCount: line.status === "failed" ? 1 : 0,
      isTest: false,
      paymentLines: [line],
      operations,
    }));
  }
  return { items, warnings };
}

export async function loadAdminPayments(): Promise<AdminPaymentsData> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const [{ data: operationData, error: operationError }, { data: refundData, error: refundError }] = await Promise.all([
    admin.from("payment_operations").select("*").order("requested_at", { ascending: false }).limit(2000),
    admin.from("deetz_payment_refunds").select("*").order("requested_at", { ascending: false }).limit(2000),
  ]);
  const operationRows = (operationData ?? []) as UnknownRow[];
  const refundRows = (refundData ?? []) as UnknownRow[];
  const controlWarnings: string[] = [];
  if (operationError) controlWarnings.push("결제 작업 원장을 읽지 못했습니다. 환불 마이그레이션 적용 여부를 확인해 주세요.");
  if (refundError) controlWarnings.push("deetz 환불 원장을 읽지 못했습니다. 환불 마이그레이션 적용 여부를 확인해 주세요.");

  const grigoent = await loadGrigoent(operationRows);
  const deetz = await loadDeetzRows(grigoent, operationRows, refundRows);
  const items = [...grigoent.items, ...deetz.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items,
    warnings: [...controlWarnings, ...grigoent.warnings, ...deetz.warnings],
    grigoentConfigured: grigoent.configured,
    executionConfigured: Boolean(process.env.PAYMENT_COMMAND_SECRET && process.env.PAYMENT_COMMAND_SECRET.length >= 32),
    generatedAt: new Date().toISOString(),
  };
}
