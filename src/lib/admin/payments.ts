import "server-only";

import { createClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

export type AdminPaymentSource = "grigoent" | "visa_mirror" | "workshop" | "workshop_event";

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
  totalAmount: number | null;
  paidAmount: number;
  refundedAmount: number;
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
};

export type AdminPaymentsData = {
  items: AdminPaymentRow[];
  warnings: string[];
  grigoentConfigured: boolean;
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

function attentionFor(
  status: string,
  productSlug: string | null,
  totalAmount: number | null,
  paidAmount: number,
  failedPaymentCount: number,
  deetzApplicationId: string | null,
  isTest: boolean,
): string | null {
  if (isTest) return "내부 결제 테스트 상품";
  if (status === "recovery_required") return "결제는 되었지만 수동 복구가 필요합니다";
  if (failedPaymentCount > 0 && paidAmount === 0) return "결제 실패 이력이 있습니다";
  if (totalAmount !== null && status === "completed" && paidAmount < totalAmount) {
    return "완료 상태지만 납부액이 주문액보다 적습니다";
  }
  if (VISA_PRODUCT_SLUGS.has(productSlug ?? "") && !deetzApplicationId) {
    return "deetz 비자 케이스와 연결되지 않았습니다";
  }
  return null;
}

function makeRow(input: Omit<AdminPaymentRow, "needsAttention" | "attentionReason">): AdminPaymentRow {
  const attentionReason = attentionFor(
    input.status,
    input.productSlug,
    input.totalAmount,
    input.paidAmount,
    input.failedPaymentCount,
    input.deetzApplicationId,
    input.isTest,
  );
  return {
    ...input,
    needsAttention: Boolean(attentionReason),
    attentionReason,
  };
}

function grigoentClient() {
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

async function loadGrigoent(): Promise<GrigoentLoad> {
  const svc = grigoentClient();
  if (!svc) {
    return {
      items: [],
      byId: new Map(),
      byOrderNo: new Map(),
      warnings: ["grigoent 원장 연결 설정이 없습니다. GRIGOENT_SUPABASE_URL과 GRIGOENT_SUPABASE_SERVICE_ROLE_KEY를 배포 환경에 등록해야 합니다."],
      configured: false,
    };
  }

  const [{ data: orders, error: ordersError }, { data: products, error: productsError }, { data: plans, error: plansError }] =
    await Promise.all([
      svc
        .from("training_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000),
      svc.from("training_products").select("*"),
      svc.from("training_price_plans").select("*"),
    ]);

  if (ordersError) {
    console.error("[admin/payments] grigoent orders failed", ordersError);
    return {
      items: [],
      byId: new Map(),
      byOrderNo: new Map(),
      warnings: ["grigoent 주문 원장을 읽지 못했습니다. 연결 설정과 원장 권한을 확인해 주세요."],
      configured: true,
    };
  }

  const warnings: string[] = [];
  if (productsError) warnings.push("grigoent 상품 정보를 읽지 못해 일부 상품명이 상품 코드로 표시됩니다.");
  if (plansError) warnings.push("grigoent 요금제 정보를 읽지 못해 일부 플랜명이 표시되지 않습니다.");

  const productsById = new Map<string, UnknownRow>();
  for (const row of (products ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(row, "id");
    if (id) productsById.set(id, row);
  }
  const plansById = new Map<string, UnknownRow>();
  for (const row of (plans ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(row, "id");
    if (id) plansById.set(id, row);
  }

  const orderRows = (orders ?? []) as unknown as UnknownRow[];
  const orderIds = orderRows.map((row) => stringValue(row, "id")).filter((id): id is string => Boolean(id));
  const { data: payments, error: paymentsError } = orderIds.length
    ? await svc.from("training_order_payments").select("*").in("order_id", orderIds).order("sequence", { ascending: true })
    : { data: [], error: null };
  if (paymentsError) warnings.push("grigoent 주문의 회차별 결제 상세를 읽지 못했습니다.");

  const paymentsByOrder = new Map<string, UnknownRow[]>();
  for (const payment of (payments ?? []) as unknown as UnknownRow[]) {
    const orderId = stringValue(payment, "order_id");
    if (!orderId) continue;
    paymentsByOrder.set(orderId, [...(paymentsByOrder.get(orderId) ?? []), payment]);
  }

  const items: AdminPaymentRow[] = [];
  for (const order of orderRows) {
    const id = stringValue(order, "id");
    const orderNo = stringValue(order, "order_no");
    if (!id) continue;
    const product = productsById.get(stringValue(order, "product_id") ?? "");
    const plan = plansById.get(stringValue(order, "plan_id") ?? "");
    const slug = stringValue(product ?? {}, "slug") ?? stringValue(order, "product_slug");
    const orderPayments = paymentsByOrder.get(id) ?? [];
    const capturedPayments = orderPayments.filter((payment) => ["paid", "refunded"].includes(stringValue(payment, "status") ?? ""));
    const paidAmount = capturedPayments.reduce((sum, payment) => sum + (numberValue(payment, "amount") ?? 0), 0) || numberValue(order, "paid_amount") || 0;
    const refundedAmount = orderPayments
      .filter((payment) => stringValue(payment, "status") === "refunded")
      .reduce((sum, payment) => sum + (numberValue(payment, "amount") ?? 0), 0);
    const failedPaymentCount = orderPayments.filter((payment) => stringValue(payment, "status") === "failed").length;
    const applicationId = stringValue(order, "visa_application_id");
    const status = stringValue(order, "status") ?? "unknown";
    const isTest = slug === "payment-test";

    items.push(
      makeRow({
        id: `grigoent:${id}`,
        source: "grigoent",
        sourceLabel: "grigoent 원장",
        productSlug: slug,
        productLabel: productLabel(slug, stringValue(product ?? {}, "title")),
        planLabel: stringValue(plan ?? {}, "label"),
        customerName: stringValue(order, "customer_name") ?? "이름 없음",
        customerEmail: stringValue(order, "customer_email") ?? "이메일 없음",
        customerPhone: stringValue(order, "customer_phone"),
        status,
        totalAmount: numberValue(order, "total_amount"),
        paidAmount,
        refundedAmount,
        currency: stringValue(order, "currency") ?? stringValue(plan ?? {}, "currency") ?? "KRW",
        provider: stringValue(order, "pg_provider"),
        orderNo,
        createdAt: stringValue(order, "created_at") ?? new Date(0).toISOString(),
        paidAt: capturedPayments.map((payment) => stringValue(payment, "paid_at")).filter(Boolean).sort().pop() ?? null,
        refundedAt: orderPayments.map((payment) => stringValue(payment, "refunded_at")).filter(Boolean).sort().pop() ?? null,
        deetzApplicationId: applicationId,
        eventId: null,
        memo: stringValue(order, "memo"),
        paymentCount: orderPayments.length,
        failedPaymentCount,
        isTest,
      }),
    );
  }

  return {
    items,
    byId: new Map(items.map((item) => [item.id.replace("grigoent:", ""), item])),
    byOrderNo: new Map(items.filter((item) => item.orderNo).map((item) => [item.orderNo as string, item])),
    warnings,
    configured: true,
  };
}

async function loadDeetzRows(grigoent: GrigoentLoad): Promise<{ items: AdminPaymentRow[]; warnings: string[] }> {
  const admin = createAdminClient();
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
  for (const [label, result] of [
    ["비자 결제", appsRes],
    ["워크샵 예약 결제", reservationsRes],
    ["워크샵 행사 결제", eventOrdersRes],
  ] as const) {
    if (result.error) warnings.push(`${label} 데이터를 읽지 못했습니다.`);
  }

  const artistById = new Map<string, UnknownRow>();
  for (const row of (artistsRes.data ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(row, "id");
    if (id) artistById.set(id, row);
  }
  const eventById = new Map<string, UnknownRow>();
  for (const row of (eventsRes.data ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(row, "id");
    if (id) eventById.set(id, row);
  }
  const sessionById = new Map<string, string>();
  for (const row of (sessionsRes.data ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(row, "id");
    const title = stringValue(row, "title");
    if (id && title) sessionById.set(id, title);
  }
  const sessionIdsByOrder = new Map<string, string[]>();
  for (const row of (registrationsRes.data ?? []) as unknown as UnknownRow[]) {
    const orderId = stringValue(row, "order_id");
    const sessionId = stringValue(row, "session_id");
    if (orderId && sessionId) sessionIdsByOrder.set(orderId, [...(sessionIdsByOrder.get(orderId) ?? []), sessionId]);
  }

  const items: AdminPaymentRow[] = [];
  for (const app of (appsRes.data ?? []) as unknown as UnknownRow[]) {
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
    const hasIssuedPayment = paymentStatus !== "unpaid" || Boolean(orderNo) || Boolean(slug);
    if (!hasIssuedPayment) continue;
    const amount = numberValue(app, "payment_amount_krw") ?? numberValue(app, "quoted_price_krw") ?? numberValue(app, "base_price_krw");
    const isTest = slug === "payment-test";
    items.push(
      makeRow({
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
        paidAmount: ["paid", "refunded"].includes(paymentStatus) ? amount ?? 0 : 0,
        refundedAmount: paymentStatus === "refunded" ? amount ?? 0 : 0,
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
        isTest,
      }),
    );
  }

  for (const reservation of (reservationsRes.data ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(reservation, "id");
    if (!id) continue;
    const artist = artistById.get(stringValue(reservation, "artist_id") ?? "");
    const status = stringValue(reservation, "status") ?? "unknown";
    const amount = numberValue(reservation, "amount");
    const captured = ["paid", "confirmed", "transferred", "refunded"].includes(status) ? amount ?? 0 : 0;
    items.push(
      makeRow({
        id: `workshop:${id}`,
        source: "workshop",
        sourceLabel: "워크샵 예약",
        productSlug: "workshop-reservation",
        productLabel: `워크샵 예약금 · ${stringValue(artist ?? {}, "name") ?? "아티스트 미지정"}`,
        planLabel: stringValue(artist ?? {}, "slug"),
        customerName: stringValue(reservation, "customer_name") ?? "이름 없음",
        customerEmail: stringValue(reservation, "customer_email") ?? "이메일 없음",
        customerPhone: stringValue(reservation, "customer_phone"),
        status,
        totalAmount: amount,
        paidAmount: captured,
        refundedAmount: status === "refunded" ? amount ?? 0 : 0,
        currency: "KRW",
        provider: stringValue(reservation, "pg_provider"),
        orderNo: stringValue(reservation, "order_no"),
        createdAt: stringValue(reservation, "created_at") ?? new Date(0).toISOString(),
        paidAt: stringValue(reservation, "paid_at"),
        refundedAt: stringValue(reservation, "refunded_at"),
        deetzApplicationId: null,
        eventId: null,
        memo: stringValue(reservation, "memo"),
        paymentCount: 1,
        failedPaymentCount: 0,
        isTest: false,
      }),
    );
  }

  for (const order of (eventOrdersRes.data ?? []) as unknown as UnknownRow[]) {
    const id = stringValue(order, "id");
    if (!id) continue;
    const event = eventById.get(stringValue(order, "event_id") ?? "");
    const status = stringValue(order, "status") ?? "unknown";
    const amount = numberValue(order, "charged_amount") ?? numberValue(order, "amount_krw");
    const sessions = (sessionIdsByOrder.get(id) ?? []).map((sessionId) => sessionById.get(sessionId)).filter(Boolean);
    const eventTitle = stringValue(event ?? {}, "title") ?? "행사 미지정";
    items.push(
      makeRow({
        id: `workshop_event:${id}`,
        source: "workshop_event",
        sourceLabel: "워크샵 행사",
        productSlug: "workshop-event",
        productLabel: `워크샵 행사 · ${eventTitle}`,
        planLabel: sessions.length ? sessions.join(", ") : null,
        customerName: stringValue(order, "customer_name") ?? "이름 없음",
        customerEmail: stringValue(order, "customer_email") ?? "이메일 없음",
        customerPhone: stringValue(order, "customer_phone"),
        status,
        totalAmount: amount,
        paidAmount: ["paid", "refunded"].includes(status) ? amount ?? 0 : 0,
        refundedAmount: status === "refunded" ? amount ?? 0 : 0,
        currency: stringValue(order, "charged_currency") ?? "KRW",
        provider: stringValue(order, "pg_provider"),
        orderNo: stringValue(order, "order_no"),
        createdAt: stringValue(order, "created_at") ?? new Date(0).toISOString(),
        paidAt: stringValue(order, "paid_at"),
        refundedAt: stringValue(order, "refunded_at"),
        deetzApplicationId: null,
        eventId: stringValue(order, "event_id"),
        memo: stringValue(order, "memo"),
        paymentCount: 1,
        failedPaymentCount: 0,
        isTest: false,
      }),
    );
  }

  return { items, warnings };
}

export async function loadAdminPayments(): Promise<AdminPaymentsData> {
  const grigoent = await loadGrigoent();
  const deetz = await loadDeetzRows(grigoent);
  const generatedAt = new Date().toISOString();
  const items = [...grigoent.items, ...deetz.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items,
    warnings: [...grigoent.warnings, ...deetz.warnings],
    grigoentConfigured: grigoent.configured,
    generatedAt,
  };
}
