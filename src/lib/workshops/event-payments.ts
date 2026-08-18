import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEventOrderOpsMail, sendEventOrderReceiptEmail } from "@/lib/notify/workshop-mails";
import { PAYPAL_SUPPORTED_CURRENCIES } from "@/lib/workshops/event-shared";

// 행사 주문 결제 — 예약금(payments.ts)에서 검증한 패턴의 행사판.
//   · 상태 전이는 mark_event_order_paid() 가 원자적으로 1회만 성공 (recorded/already_recorded/recovery_required)
//   · 성공 경로 화이트리스트: paid 확인된 경우만 성공
//   · PayPal 은 THB 우선 → 계정이 거부하면(CURRENCY_NOT_SUPPORTED) USD 1회 폴백
//   · Toss 는 KRW(amount_krw) — 한국 카드·계좌용

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

export type EventConfirmResult =
  | { ok: true; orderNo: string; eventSlug: string | null; amountKrw: number | null; chargedLabel: string | null; idempotent: boolean }
  | { ok: false; recovery: true; orderNo: string | null; error: string }
  | { ok: false; recovery?: false; error: string };

type OrderRow = {
  id: string;
  event_id: string;
  order_no: string;
  status: string;
  currency: string | null;
  amount_local: number | null;
  amount_krw: number | null;
  amount_usd: number | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  lang: string;
};

type EventRow = {
  id: string;
  slug: string;
  title: string;
  venue_name: string | null;
  starts_on: string;
  timezone: string;
};

async function loadOrder(pgOrderId: string): Promise<{ order: OrderRow | null; event: EventRow | null }> {
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("workshop_event_orders")
    .select(
      "id, event_id, order_no, status, currency, amount_local, amount_krw, amount_usd, customer_name, customer_email, customer_phone, lang",
    )
    .eq("pg_order_id", pgOrderId)
    .maybeSingle();
  if (!order) return { order: null, event: null };
  const { data: event } = await admin
    .from("workshop_events")
    .select("id, slug, title, venue_name, starts_on, timezone")
    .eq("id", (order as OrderRow).event_id)
    .maybeSingle();
  return { order: order as OrderRow, event: (event as EventRow) ?? null };
}

function chargedLabel(currency: string | null, amount: number | null): string | null {
  if (!currency || amount === null) return null;
  if (currency === "THB") return `฿${Number(amount).toLocaleString("en-US")}`;
  if (currency === "USD") return `$${Number(amount).toLocaleString("en-US")}`;
  if (currency === "KRW") return `₩${Number(amount).toLocaleString("ko-KR")}`;
  return `${currency} ${amount}`;
}

type FinalizeOutcome = "recorded" | "already_recorded" | "recovery_required";

async function finalizeEventPaid(params: {
  order: OrderRow;
  event: EventRow | null;
  provider: "toss" | "paypal";
  paymentKey: string | null;
  receiptUrl: string | null;
  raw: unknown;
  chargedCurrency: string;
  chargedAmount: number;
}): Promise<FinalizeOutcome> {
  const admin = createAdminClient();
  const { data: outcome, error } = await admin.rpc("mark_event_order_paid", {
    p_order_id: params.order.id,
    p_provider: params.provider,
    p_payment_key: params.paymentKey,
    p_receipt_url: params.receiptUrl,
    p_raw: (params.raw as Record<string, unknown>) ?? null,
    p_charged_currency: params.chargedCurrency,
    p_charged_amount: params.chargedAmount,
  });

  if (error || !outcome) {
    console.error("[event-pay] paid transition FAILED (money received):", {
      orderId: params.order.id,
      orderNo: params.order.order_no,
      paymentKey: params.paymentKey,
      error,
    });
    await alertEventRecovery(params, "DB 기록 실패");
    return "recovery_required";
  }
  if (outcome === "recovery_required") {
    await alertEventRecovery(params, "취소·만료된 주문에 결제 승인 도착");
    return "recovery_required";
  }
  if (outcome !== "recorded") {
    const { data: cur } = await admin
      .from("workshop_event_orders")
      .select("status")
      .eq("id", params.order.id)
      .maybeSingle();
    if (!cur) {
      await alertEventRecovery(params, "중복 승인 후 상태 재조회 실패");
      return "recovery_required";
    }
    if (cur.status === "paid") return "already_recorded";
    await alertEventRecovery(params, `중복 승인 시점 상태가 '${cur.status}'`);
    return "recovery_required";
  }

  // 세션 목록을 붙여 확인 메일 발송(비치명적)
  try {
    const { data: regs } = await admin
      .from("workshop_event_registrations")
      .select("session_id, workshop_event_sessions!inner(title, instructor_name, session_date, start_time, end_time)")
      .eq("order_id", params.order.id);
    const sessions = ((regs ?? []) as unknown as {
      workshop_event_sessions: {
        title: string;
        instructor_name: string;
        session_date: string;
        start_time: string;
        end_time: string;
      };
    }[]).map((r) => r.workshop_event_sessions);

    await sendEventOrderReceiptEmail({
      to: params.order.customer_email,
      lang: params.order.lang === "ko" ? "ko" : "en",
      customerName: params.order.customer_name,
      orderNo: params.order.order_no,
      eventTitle: params.event?.title ?? "deetz Workshop",
      venue: params.event?.venue_name ?? null,
      sessions,
      chargedLabel: chargedLabel(params.chargedCurrency, params.chargedAmount) ?? "",
      receiptUrl: params.receiptUrl,
      detailUrl: params.event ? `${SITE_URL}/workshops/e/${params.event.slug}` : `${SITE_URL}/workshops`,
    });
  } catch (e) {
    console.error("[event-pay] receipt mail failed (non-fatal):", e);
  }
  try {
    await sendEventOrderOpsMail({
      orderNo: params.order.order_no,
      eventTitle: params.event?.title ?? "(행사 미상)",
      customerName: params.order.customer_name,
      customerEmail: params.order.customer_email,
      chargedLabel: chargedLabel(params.chargedCurrency, params.chargedAmount) ?? `${params.chargedAmount}`,
      amountKrw: params.order.amount_krw ?? null,
      provider: params.provider,
    });
  } catch (e) {
    console.error("[event-pay] ops mail failed (non-fatal):", e);
  }
  return "recorded";
}

async function alertEventRecovery(
  params: { order: OrderRow; provider: "toss" | "paypal"; paymentKey: string | null; chargedCurrency: string; chargedAmount: number },
  reason: string,
): Promise<void> {
  console.error("[event-pay] PAYMENT RECOVERY REQUIRED", {
    reason,
    orderNo: params.order.order_no,
    paymentKey: params.paymentKey,
    provider: params.provider,
    charged: `${params.chargedCurrency} ${params.chargedAmount}`,
  });
  try {
    const { sendWorkshopPaymentRecoveryMail } = await import("@/lib/notify/workshop-mails");
    await sendWorkshopPaymentRecoveryMail({
      orderNo: params.order.order_no,
      reason,
      artistName: "(행사 주문)",
      customerName: params.order.customer_name,
      customerEmail: params.order.customer_email,
      amount: params.order.amount_krw ?? 0,
      provider: params.provider,
      paymentKey: params.paymentKey,
    });
  } catch (e) {
    console.error("[event-pay] recovery alert mail failed:", e);
  }
}

// ── Toss (KRW) ─────────────────────────────────────────────────────────────

function getTossSecretKey(): string | null {
  const useLive = process.env.NEXT_PUBLIC_TOSS_USE_LIVE === "true";
  return (
    (useLive
      ? process.env.TOSS_LIVE_SECRET_KEY || process.env.TOSS_SECRET_KEY
      : process.env.TOSS_SECRET_KEY) ?? null
  );
}

export async function confirmEventTossPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<EventConfirmResult> {
  const { paymentKey, orderId, amount } = params;
  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    return { ok: false, error: "결제 정보가 누락되었습니다." };
  }
  const { order, event } = await loadOrder(orderId);
  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };

  if (["recovery_required", "refunded"].includes(order.status)) {
    return { ok: false, recovery: true, orderNo: order.order_no, error: "결제 건을 확인하고 있습니다." };
  }
  if (order.status === "paid") {
    return {
      ok: true,
      orderNo: order.order_no,
      eventSlug: event?.slug ?? null,
      amountKrw: order.amount_krw,
      chargedLabel: order.amount_krw !== null ? `₩${order.amount_krw.toLocaleString("ko-KR")}` : null,
      idempotent: true,
    };
  }
  // KRW 가격이 없는 행사는 Toss 로 결제할 수 없다(UI 에서 숨기지만 방어).
  if (order.amount_krw === null) {
    return { ok: false, error: "이 행사는 원화 결제를 지원하지 않습니다." };
  }
  if (order.amount_krw !== amount) {
    console.error("[event-pay/toss] amount mismatch", { expected: order.amount_krw, received: amount });
    return { ok: false, error: "결제 금액이 일치하지 않습니다." };
  }

  const secretKey = getTossSecretKey();
  if (!secretKey) return { ok: false, error: "결제 설정이 완료되지 않았습니다." };

  const admin = createAdminClient();
  const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId, amount, paymentKey }),
  });
  const tossData = await res.json();
  if (!res.ok) {
    console.error("[event-pay/toss] confirm failed:", tossData);
    await admin
      .from("workshop_event_orders")
      .update({
        failure_reason: tossData?.message ?? "toss confirm failed",
        raw: tossData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .not("status", "in", "(paid,refunded,recovery_required)");
    return { ok: false, error: tossData?.message || "결제 승인에 실패했습니다." };
  }

  const outcome = await finalizeEventPaid({
    order,
    event,
    provider: "toss",
    paymentKey,
    receiptUrl: tossData?.receipt?.url ?? null,
    raw: tossData,
    chargedCurrency: "KRW",
    chargedAmount: order.amount_krw,
  });
  if (outcome === "recovery_required") {
    return { ok: false, recovery: true, orderNo: order.order_no, error: "결제는 완료되었지만 확정 처리가 지연되고 있습니다." };
  }
  return {
    ok: true,
    orderNo: order.order_no,
    eventSlug: event?.slug ?? null,
    amountKrw: order.amount_krw,
    chargedLabel: `₩${order.amount_krw.toLocaleString("ko-KR")}`,
    idempotent: false,
  };
}

// ── PayPal (THB 우선 → USD 폴백) ───────────────────────────────────────────

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const IS_SANDBOX = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX === "true";
const PAYPAL_API_URL = IS_SANDBOX ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";

async function getPaypalAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("PayPal credentials not configured");
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    console.error("[event-pay/paypal] auth failed:", await response.text());
    throw new Error("Failed to authenticate with PayPal");
  }
  const data = await response.json();
  return data.access_token as string;
}

export async function createEventPaypalOrder(params: {
  pgOrderId: string;
  description: string;
}): Promise<{ ok: true; id: string; currency: string; amount: number } | { ok: false; error: string }> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { ok: false, error: "PayPal is not configured yet." };
  }
  const { order, event } = await loadOrder(params.pgOrderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "pending") return { ok: false, error: "This order is already processed." };

  // 청구 통화: 행사 통화(PayPal 지원 시) 우선, 아니면(또는 판매자 계정이 거부하면) USD 폴백.
  const eventCcy = (order.currency ?? "USD").toUpperCase();
  const local =
    order.amount_local !== null && PAYPAL_SUPPORTED_CURRENCIES.has(eventCcy)
      ? Number(order.amount_local)
      : null;
  const usd = order.amount_usd === null ? null : Number(order.amount_usd);
  if (local === null && usd === null) return { ok: false, error: "Pricing is not configured." };

  try {
    const accessToken = await getPaypalAccessToken();
    const createWith = async (currency: string, value: number) => {
      const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "PayPal-Request-Id": `${params.pgOrderId}-${currency}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: params.pgOrderId,
              description: params.description.slice(0, 127),
              amount: { currency_code: currency, value: value.toFixed(2) },
            },
          ],
          application_context: {
            brand_name: "deetz",
            landing_page: "NO_PREFERENCE",
            user_action: "PAY_NOW",
            return_url: `${SITE_URL}/workshops/e/pay/success${event ? `?slug=${event.slug}` : ""}`,
            cancel_url: `${SITE_URL}/workshops/e/pay/fail${event ? `?slug=${event.slug}` : ""}`,
          },
        }),
      });
      return { response, body: await response.json() };
    };

    let currency = local !== null ? eventCcy : "USD";
    let value = local !== null ? local : (usd as number);
    let attempt = await createWith(currency, value);

    // 판매자 계정이 행사 통화를 거부하면 USD 로 1회 폴백한다.
    if (!attempt.response.ok && currency !== "USD" && usd !== null) {
      console.warn(`[event-pay/paypal] ${currency} rejected, retrying in USD:`, attempt.body);
      currency = "USD";
      value = usd;
      attempt = await createWith(currency, value);
    }
    if (!attempt.response.ok) {
      console.error("[event-pay/paypal] create order failed:", attempt.body);
      return { ok: false, error: "Could not create the PayPal order." };
    }
    return { ok: true, id: attempt.body.id as string, currency, amount: value };
  } catch (e) {
    console.error("[event-pay/paypal] create order error:", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function captureEventPaypalOrder(params: {
  paypalOrderId: string;
  pgOrderId: string;
}): Promise<EventConfirmResult> {
  const { order, event } = await loadOrder(params.pgOrderId);
  if (!order) return { ok: false, error: "Order not found." };
  if (["recovery_required", "refunded"].includes(order.status)) {
    return { ok: false, recovery: true, orderNo: order.order_no, error: "This payment is under review." };
  }
  if (order.status === "paid") {
    return {
      ok: true,
      orderNo: order.order_no,
      eventSlug: event?.slug ?? null,
      amountKrw: order.amount_krw,
      chargedLabel: null,
      idempotent: true,
    };
  }

  try {
    const accessToken = await getPaypalAccessToken();
    const captureResponse = await fetch(
      `${PAYPAL_API_URL}/v2/checkout/orders/${params.paypalOrderId}/capture`,
      { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` } },
    );
    const captureData = await captureResponse.json();

    if (!captureResponse.ok || captureData.status !== "COMPLETED") {
      console.error("[event-pay/paypal] capture failed:", captureData);
      const admin = createAdminClient();
      await admin
        .from("workshop_event_orders")
        .update({
          failure_reason: captureData?.message ?? `paypal status ${captureData?.status ?? "unknown"}`,
          raw: captureData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)
        .not("status", "in", "(paid,refunded,recovery_required)");
      return { ok: false, error: "PayPal payment could not be completed." };
    }

    const cap = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    const chargedCurrency = (cap?.amount?.currency_code as string) ?? "USD";
    const chargedAmount = Number(cap?.amount?.value ?? 0);

    const outcome = await finalizeEventPaid({
      order,
      event,
      provider: "paypal",
      paymentKey: cap?.id ?? captureData.id ?? null,
      receiptUrl: null,
      raw: captureData,
      chargedCurrency,
      chargedAmount,
    });
    if (outcome === "recovery_required") {
      return { ok: false, recovery: true, orderNo: order.order_no, error: "Payment received — registration is being verified." };
    }
    return {
      ok: true,
      orderNo: order.order_no,
      eventSlug: event?.slug ?? null,
      amountKrw: order.amount_krw,
      chargedLabel: chargedLabel(chargedCurrency, chargedAmount),
      idempotent: false,
    };
  } catch (e) {
    console.error("[event-pay/paypal] capture error:", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
