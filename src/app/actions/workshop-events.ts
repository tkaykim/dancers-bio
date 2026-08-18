"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser, requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  captureEventPaypalOrder,
  confirmEventTossPayment,
  createEventPaypalOrder,
} from "@/lib/workshops/event-payments";
import { buildEventOrderNo, EVENT_TERMS_VERSION } from "@/lib/workshops/event-shared";
import type { ActionResult } from "./auth";

// 행사(Event) 신청·결제 액션.
// 신청은 비로그인 허용(수강생은 deetz 계정이 없는 일반인·외국인일 수 있다) —
// 이름+이메일이 식별자이고, 로그인돼 있으면 user_id 를 함께 기록한다.

const GENERIC_EN = "Something went wrong. Please try again.";

export type EventCheckoutSession = {
  orderId: string;
  orderNo: string;
  pgOrderId: string;
  amountKrw: number;
  amountThb: number | null;
  amountUsd: number | null;
  sessionCount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  customerKey: string | null;
};

const createSchema = z.object({
  eventId: z.string().uuid(),
  sessionIds: z.array(z.string().uuid()).min(1).max(12),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+\-\s]*$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  lang: z.enum(["en", "ko"]).default("en"),
});

export type EventCheckoutInput = z.input<typeof createSchema>;

/** 좌석 확보(원자) + 주문 생성. 사유 코드는 클라이언트가 언어별 문구로 변환한다. */
export async function createEventOrderAction(
  input: EventCheckoutInput,
): Promise<ActionResult<EventCheckoutSession> | { ok: false; code: string; session?: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? GENERIC_EN };
  }
  const d = parsed.data;
  const user = await getUser();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: GENERIC_EN };
  }

  const { data: result, error } = await admin.rpc("reserve_event_seats", {
    p_event_id: d.eventId,
    p_session_ids: d.sessionIds,
    p_user_id: user?.id ?? null,
    p_name: d.name,
    p_email: d.email,
    p_phone: d.phone?.trim() || null,
    p_order_no: buildEventOrderNo(new Date(), randomBytes(3).toString("hex")),
    p_terms_version: EVENT_TERMS_VERSION,
    p_lang: d.lang,
    p_hold_minutes: 15,
  });

  if (error) {
    console.error("[eventCheckout] reserve rpc failed:", error);
    return { ok: false, error: GENERIC_EN };
  }

  const seat = result as {
    ok: boolean;
    error?: string;
    session?: string;
    order_id?: string;
    order_no?: string;
    amount_krw?: number;
    amount_thb?: number | null;
    amount_usd?: number | null;
    session_count?: number;
  } | null;

  if (!seat?.ok) {
    // 사유 코드를 그대로 넘겨 클라이언트에서 EN/KO 문구로 변환
    return { ok: false, code: seat?.error ?? "GENERIC", session: seat?.session };
  }

  return {
    ok: true,
    data: {
      orderId: seat.order_id!,
      orderNo: seat.order_no!,
      pgOrderId: seat.order_no!,
      amountKrw: seat.amount_krw!,
      amountThb: seat.amount_thb ?? null,
      amountUsd: seat.amount_usd ?? null,
      sessionCount: seat.session_count ?? d.sessionIds.length,
      customerName: d.name,
      customerEmail: d.email,
      customerPhone: d.phone?.trim() || null,
      customerKey: user?.id ?? null,
    },
  };
}

// ── 결제 승인 ───────────────────────────────────────────────────────────────

export type EventConfirmActionResult =
  | { ok: true; data: { orderNo: string; chargedLabel: string | null; eventSlug: string | null } }
  | { ok: false; recovery: true; orderNo: string | null; error: string }
  | { ok: false; recovery?: false; error: string };

export async function confirmEventTossPaymentAction(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<EventConfirmActionResult> {
  const paymentKey = String(input?.paymentKey ?? "").trim();
  const orderId = String(input?.orderId ?? "").trim();
  const amount = Number(input?.amount);
  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    return { ok: false, error: "결제 정보가 누락되었습니다." };
  }
  const result = await confirmEventTossPayment({ paymentKey, orderId, amount });
  if (!result.ok) {
    if (result.recovery) return { ok: false, recovery: true, orderNo: result.orderNo, error: result.error };
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    data: { orderNo: result.orderNo, chargedLabel: result.chargedLabel, eventSlug: result.eventSlug },
  };
}

export async function createEventPaypalOrderAction(input: {
  pgOrderId: string;
  description: string;
}): Promise<ActionResult<{ id: string; currency: string; amount: number }>> {
  const pgOrderId = String(input?.pgOrderId ?? "").trim();
  if (!pgOrderId) return { ok: false, error: GENERIC_EN };
  const result = await createEventPaypalOrder({
    pgOrderId,
    description: String(input?.description ?? "deetz workshop"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { id: result.id, currency: result.currency, amount: result.amount } };
}

export async function captureEventPaypalOrderAction(input: {
  paypalOrderId: string;
  pgOrderId: string;
}): Promise<EventConfirmActionResult> {
  const paypalOrderId = String(input?.paypalOrderId ?? "").trim();
  const pgOrderId = String(input?.pgOrderId ?? "").trim();
  if (!paypalOrderId || !pgOrderId) return { ok: false, error: GENERIC_EN };
  const result = await captureEventPaypalOrder({ paypalOrderId, pgOrderId });
  if (!result.ok) {
    if (result.recovery) return { ok: false, recovery: true, orderNo: result.orderNo, error: result.error };
    return { ok: false, error: result.error };
  }
  return {
    ok: true,
    data: { orderNo: result.orderNo, chargedLabel: result.chargedLabel, eventSlug: result.eventSlug },
  };
}

// ── 어드민: 주문 상태 기록 ──────────────────────────────────────────────────

const orderStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["paid", "cancelled", "refunded"]),
});

export async function adminSetEventOrderStatusAction(
  input: z.input<typeof orderStatusSchema>,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = orderStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const admin = createAdminClient();
  const patch: Record<string, unknown> = { status: parsed.data.status, updated_at: new Date().toISOString() };
  if (parsed.data.status === "refunded") patch.refunded_at = new Date().toISOString();
  const { error } = await admin.from("workshop_event_orders").update(patch).eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/workshops/events");
  return { ok: true };
}
