import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// deetz 케이스 ↔ grigoent 결제를 잇는 서명 토큰.
//
// deetz 어드민이 링크를 발급하고(makeVisaPaymentRef), 지원자가 그 링크로 결제하면
// grigoent 가 토큰을 검증해 주문에 visa_application_id 를 박는다.
// 결제가 승인되면 grigoent 가 여기 /api/visa/payment-callback 으로 결과를 돌려준다.
//
// 두 앱은 Supabase 프로젝트가 서로 다르므로 각자의 service role key 를 쓸 수 없다.
// 전용 공유 비밀 VISA_PAYMENT_LINK_SECRET 을 양쪽 Vercel 에 동일하게 넣는다.
//
// 토큰은 URL 에 노출되므로 만료를 둔다. 만료돼도 결제 자체는 막지 않고
// "케이스 연결"만 끊기게 설계했다 — 돈은 받았는데 결제가 실패하는 상황을 만들지 않기 위함.

export const VISA_PAYMENT_REF_TTL_DAYS = 30;

// 상품 slug ↔ grigoent 결제 페이지 경로. grigoent 쪽 라우트와 1:1로 맞춰야 한다.
// 어드민 발급(visa-payment.ts)과 케이스 포털 노출(case page)이 같은 정의를 쓴다.
export const VISA_PAYMENT_PAGES = {
  "audition-fee": "/audition-fee",
  "training-and-placement": "/training",
  // Village 사전예약금 — ref 의 id 는 비자 케이스가 아니라 village_waitlist 행을 가리킨다.
  "village-deposit": "/village-deposit",
} as const;

export type VisaPaymentProductSlug = keyof typeof VISA_PAYMENT_PAGES;

const PAY_SITE_URL = (process.env.NEXT_PUBLIC_GRIGOENT_URL || "https://grigoent.co.kr").replace(/\/$/, "");

/**
 * 결제 페이지 전체 URL. 토큰은 호출 시점에 새로 서명한다(만료 걱정 없음).
 * subjectId 는 상품에 따라 대상이 다르다 — village-deposit 은 village_waitlist 행 id,
 * 나머지는 dancer_visa_applications 행 id 다. 콜백이 이 id 로 대상 테이블을 찾는다.
 */
export function makeVisaPaymentUrl(subjectId: string, productSlug: VisaPaymentProductSlug): string {
  return `${PAY_SITE_URL}${VISA_PAYMENT_PAGES[productSlug]}?ref=${makeVisaPaymentRef(subjectId, productSlug)}`;
}

/** Village 사전예약금 정본 금액. 정본은 grigoent training_price_plans — 변경 시 함께 갱신. */
export const VILLAGE_DEPOSIT_KRW = 200_000;

export type VisaPaymentRef = {
  applicationId: string;
  /** 결제 대상 상품 slug (grigoent training_products.slug) */
  productSlug: string;
  expiresAt: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]{2,64}$/;

export function paymentLinkSecret(): string {
  const key = process.env.VISA_PAYMENT_LINK_SECRET;
  if (!key || key.length < 32) {
    throw new Error("VISA_PAYMENT_LINK_SECRET 미설정 (32자 이상 필요)");
  }
  return key;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function makeVisaPaymentRef(
  applicationId: string,
  productSlug: string,
  ttlDays = VISA_PAYMENT_REF_TTL_DAYS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60;
  const payload = `vp:${applicationId}:${productSlug}:${expiresAt}`;
  return `${Buffer.from(payload, "utf8").toString("base64url")}.${sign(payload, paymentLinkSecret())}`;
}

export function verifyVisaPaymentRef(token: string | null | undefined): VisaPaymentRef | null {
  try {
    if (!token) return null;
    const key = process.env.VISA_PAYMENT_LINK_SECRET;
    if (!key) return null;
    const dot = token.lastIndexOf(".");
    if (dot < 1) return null;
    const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
    if (!safeEqual(token.slice(dot + 1), sign(payload, key))) return null;

    const [prefix, applicationId, productSlug, expiresRaw] = payload.split(":");
    if (prefix !== "vp") return null;
    if (!UUID_RE.test(applicationId ?? "")) return null;
    if (!SLUG_RE.test(productSlug ?? "")) return null;

    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

    return { applicationId, productSlug, expiresAt };
  } catch {
    return null;
  }
}

// 결제 결과 콜백 서명. 링크 토큰과 같은 비밀을 쓰되 본문 전체를 서명한다.
export function signPaymentCallback(rawBody: string): string {
  return sign(rawBody, paymentLinkSecret());
}

export function verifyPaymentCallback(rawBody: string, signature: string | null): boolean {
  try {
    if (!signature) return false;
    return safeEqual(signature, sign(rawBody, paymentLinkSecret()));
  } catch {
    return false;
  }
}
