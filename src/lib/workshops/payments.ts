import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { foreignQuote, PAYPAL_FOREIGN_CURRENCY } from "@/lib/paypal-fx";
import {
  sendWorkshopDepositOpsMail,
  sendWorkshopDepositReceiptEmail,
} from "@/lib/notify/workshop-mails";

// deetz Workshop 예약금 결제 서버 로직 (grigoent /training 연동 이식).
// 금액은 절대 클라이언트 값을 신뢰하지 않고 workshop_reservations 레코드와 대조한다.
// 승인은 pg_order_id 기준 멱등 — 성공 페이지 새로고침/중복 호출에 안전하다.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://deetz.kr";

export type ConfirmResult =
  | { ok: true; orderNo: string; artistName: string; artistSlug: string | null; amount: number; idempotent: boolean }
  | { ok: false; error: string };

function getTossSecretKey(): string | null {
  const useLive = process.env.NEXT_PUBLIC_TOSS_USE_LIVE === "true";
  return (
    (useLive
      ? process.env.TOSS_LIVE_SECRET_KEY || process.env.TOSS_SECRET_KEY
      : process.env.TOSS_SECRET_KEY) ?? null
  );
}

type ReservationRow = {
  id: string;
  artist_id: string;
  amount: number;
  status: string;
  order_no: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
};

type ArtistRow = {
  id: string;
  name: string;
  slug: string | null;
  total_price: number | null;
  min_headcount: number | null;
  expected_period: string | null;
};

async function loadByPgOrderId(pgOrderId: string): Promise<{
  reservation: ReservationRow | null;
  artist: ArtistRow | null;
}> {
  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("workshop_reservations")
    .select("id, artist_id, amount, status, order_no, customer_name, customer_email, customer_phone")
    .eq("pg_order_id", pgOrderId)
    .maybeSingle();
  if (!reservation) return { reservation: null, artist: null };
  const { data: artist } = await admin
    .from("workshop_artists")
    .select("id, name, slug, total_price, min_headcount, expected_period")
    .eq("id", reservation.artist_id)
    .maybeSingle();
  return { reservation: reservation as ReservationRow, artist: (artist as ArtistRow) ?? null };
}

/** 결제 완료 처리 공통부 — 레코드 확정 + 안내/운영 메일(비치명적). */
async function finalizePaid(params: {
  reservation: ReservationRow;
  artist: ArtistRow | null;
  provider: "toss" | "paypal";
  paymentKey: string | null;
  receiptUrl: string | null;
  raw: unknown;
}): Promise<void> {
  const admin = createAdminClient();
  const paidAt = new Date().toISOString();

  await admin
    .from("workshop_reservations")
    .update({
      status: "paid",
      pg_provider: params.provider,
      payment_key: params.paymentKey,
      paid_at: paidAt,
      receipt_url: params.receiptUrl,
      raw: params.raw ?? null,
      updated_at: paidAt,
    })
    .eq("id", params.reservation.id);

  const artistName = params.artist?.name ?? "deetz";
  const detailUrl = params.artist?.slug
    ? `${SITE_URL}/workshops/${params.artist.slug}`
    : `${SITE_URL}/workshops`;

  let paidCount = 0;
  try {
    const { count } = await admin
      .from("workshop_reservations")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", params.reservation.artist_id)
      .in("status", ["paid", "confirmed"]);
    paidCount = count ?? 0;
  } catch {
    /* 집계 실패는 메일 문구에만 영향 */
  }

  try {
    await sendWorkshopDepositReceiptEmail({
      to: params.reservation.customer_email,
      customerName: params.reservation.customer_name,
      artistName,
      orderNo: params.reservation.order_no,
      amount: params.reservation.amount,
      totalPrice: params.artist?.total_price ?? null,
      minHeadcount: params.artist?.min_headcount ?? null,
      expectedPeriod: params.artist?.expected_period ?? null,
      provider: params.provider,
      paidAt,
      receiptUrl: params.receiptUrl,
      detailUrl,
    });
  } catch (e) {
    console.error("[workshop] receipt mail failed (non-fatal):", e);
  }

  try {
    await sendWorkshopDepositOpsMail({
      customerName: params.reservation.customer_name,
      customerEmail: params.reservation.customer_email,
      customerPhone: params.reservation.customer_phone,
      artistName,
      orderNo: params.reservation.order_no,
      amount: params.reservation.amount,
      provider: params.provider,
      paidCount,
      minHeadcount: params.artist?.min_headcount ?? null,
    });
  } catch (e) {
    console.error("[workshop] ops mail failed (non-fatal):", e);
  }
}

/** 토스 결제 승인 — 성공 페이지(서버 컴포넌트)에서 호출한다. */
export async function confirmWorkshopTossPayment(params: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<ConfirmResult> {
  const { paymentKey, orderId, amount } = params;
  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    return { ok: false, error: "결제 정보가 누락되었습니다." };
  }

  const { reservation, artist } = await loadByPgOrderId(orderId);
  if (!reservation) return { ok: false, error: "주문을 찾을 수 없습니다." };

  // 멱등: 이미 승인된 건이면 그대로 성공.
  if (reservation.status === "paid" || reservation.status === "confirmed") {
    return {
      ok: true,
      orderNo: reservation.order_no,
      artistName: artist?.name ?? "deetz",
      artistSlug: artist?.slug ?? null,
      amount: reservation.amount,
      idempotent: true,
    };
  }

  if (reservation.amount !== amount) {
    console.error("[workshop/confirm] amount mismatch", { expected: reservation.amount, received: amount });
    return { ok: false, error: "결제 금액이 일치하지 않습니다." };
  }

  const secretKey = getTossSecretKey();
  if (!secretKey) return { ok: false, error: "결제 설정이 완료되지 않았습니다." };

  const admin = createAdminClient();
  const tossResponse = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId, amount, paymentKey }),
  });
  const tossData = await tossResponse.json();

  if (!tossResponse.ok) {
    console.error("[workshop/confirm] toss confirm failed:", tossData);
    await admin
      .from("workshop_reservations")
      .update({
        failure_reason: tossData?.message ?? "toss confirm failed",
        raw: tossData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reservation.id);
    return { ok: false, error: tossData?.message || "결제 승인에 실패했습니다." };
  }

  await finalizePaid({
    reservation,
    artist,
    provider: "toss",
    paymentKey,
    receiptUrl: tossData?.receipt?.url ?? null,
    raw: tossData,
  });

  return {
    ok: true,
    orderNo: reservation.order_no,
    artistName: artist?.name ?? "deetz",
    artistSlug: artist?.slug ?? null,
    amount: reservation.amount,
    idempotent: false,
  };
}

// ── PayPal (Client Credentials → Orders v2) ────────────────────────────────

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const IS_SANDBOX = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX === "true";
const PAYPAL_API_URL = IS_SANDBOX ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
const FORCE_FOREIGN = process.env.PAYPAL_FORCE_USD === "true";

async function getPaypalAccessToken(): Promise<string> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("PayPal credentials not configured");
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    console.error("[workshop/paypal] auth failed:", await response.text());
    throw new Error("Failed to authenticate with PayPal");
  }
  const data = await response.json();
  return data.access_token as string;
}

export async function createWorkshopPaypalOrder(params: {
  pgOrderId: string;
  description: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    return { ok: false, error: "PayPal 설정이 완료되지 않았습니다." };
  }
  const { reservation } = await loadByPgOrderId(params.pgOrderId);
  if (!reservation) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (reservation.status === "paid" || reservation.status === "confirmed") {
    return { ok: false, error: "이미 결제가 완료된 건입니다." };
  }

  const krwAmount = reservation.amount;
  const quote = foreignQuote(krwAmount);
  if (!quote) return { ok: false, error: "환율 설정을 확인해 주세요." };

  try {
    const accessToken = await getPaypalAccessToken();
    const createWith = async (currency: string) => {
      const value = currency === "KRW" ? String(Math.round(krwAmount)) : quote.amount.toFixed(2);
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
              amount: { currency_code: currency, value },
            },
          ],
          application_context: {
            brand_name: "deetz",
            landing_page: "NO_PREFERENCE",
            user_action: "PAY_NOW",
            return_url: `${SITE_URL}/workshops/pay/success`,
            cancel_url: `${SITE_URL}/workshops/pay/fail`,
          },
        }),
      });
      return { response, body: await response.json() };
    };

    let currency = FORCE_FOREIGN ? PAYPAL_FOREIGN_CURRENCY : "KRW";
    let attempt = await createWith(currency);
    // PayPal이 원화를 거절하면(CURRENCY_NOT_SUPPORTED) 외화 환산으로 한 번만 재시도한다.
    if (!attempt.response.ok && currency === "KRW") {
      console.warn("[workshop/paypal] KRW rejected, retrying in foreign currency:", attempt.body);
      currency = PAYPAL_FOREIGN_CURRENCY;
      attempt = await createWith(currency);
    }
    if (!attempt.response.ok) {
      console.error("[workshop/paypal] create order failed:", attempt.body);
      return { ok: false, error: "PayPal 주문 생성에 실패했습니다." };
    }

    const admin = createAdminClient();
    await admin
      .from("workshop_reservations")
      .update({ pg_provider: "paypal", updated_at: new Date().toISOString() })
      .eq("id", reservation.id);

    return { ok: true, id: attempt.body.id as string };
  } catch (e) {
    console.error("[workshop/paypal] create order error:", e);
    return { ok: false, error: "요청 처리 중 오류가 발생했습니다." };
  }
}

export async function captureWorkshopPaypalOrder(params: {
  paypalOrderId: string;
  pgOrderId: string;
}): Promise<ConfirmResult> {
  const { reservation, artist } = await loadByPgOrderId(params.pgOrderId);
  if (!reservation) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (reservation.status === "paid" || reservation.status === "confirmed") {
    return {
      ok: true,
      orderNo: reservation.order_no,
      artistName: artist?.name ?? "deetz",
      artistSlug: artist?.slug ?? null,
      amount: reservation.amount,
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
      console.error("[workshop/paypal] capture failed:", captureData);
      const admin = createAdminClient();
      await admin
        .from("workshop_reservations")
        .update({
          failure_reason: captureData?.message ?? `paypal status ${captureData?.status ?? "unknown"}`,
          raw: captureData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reservation.id);
      return { ok: false, error: "PayPal 결제 승인에 실패했습니다." };
    }

    const captureDetails = captureData.purchase_units?.[0]?.payments?.captures?.[0];
    await finalizePaid({
      reservation,
      artist,
      provider: "paypal",
      paymentKey: captureDetails?.id ?? captureData.id ?? null,
      receiptUrl: null,
      raw: captureData,
    });

    return {
      ok: true,
      orderNo: reservation.order_no,
      artistName: artist?.name ?? "deetz",
      artistSlug: artist?.slug ?? null,
      amount: reservation.amount,
      idempotent: false,
    };
  } catch (e) {
    console.error("[workshop/paypal] capture error:", e);
    return { ok: false, error: "결제 처리 중 오류가 발생했습니다." };
  }
}
