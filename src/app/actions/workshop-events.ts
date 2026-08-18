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
  /** 행사 통화와 그 통화 기준 합계(정본 표시 금액). */
  currency: string;
  amountLocal: number | null;
  amountKrw: number | null;
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
    currency?: string;
    amount_local?: number | null;
    amount_krw?: number | null;
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
      currency: seat.currency ?? "KRW",
      amountLocal: seat.amount_local ?? null,
      amountKrw: seat.amount_krw ?? null,
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

// ── 어드민: 행사 생성·수정 ──────────────────────────────────────────────────

const eventUpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  slug: z
    .string()
    .trim()
    .max(60)
    .regex(/^[a-z0-9-]*$/, "slug는 영문 소문자·숫자·하이픈만 가능합니다.")
    .optional()
    .nullable()
    .or(z.literal("")),
  title: z.string().trim().min(1, "행사 제목을 입력해 주세요.").max(160),
  subtitle: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  posterUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  countryCode: z.string().trim().length(2),
  city: z.string().trim().max(120).optional().nullable(),
  currency: z.string().trim().toUpperCase().length(3),
  venueName: z.string().trim().max(200).optional().nullable(),
  venueAddress: z.string().trim().max(300).optional().nullable(),
  venueMapUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  timezone: z.string().trim().max(60),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "시작일 형식을 확인해 주세요."),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "종료일 형식을 확인해 주세요."),
  applyDeadline: z.string().trim().optional().nullable().or(z.literal("")),
  status: z.enum(["draft", "open", "closed", "completed", "cancelled"]),
  defaultLang: z.enum(["ko", "en", "ja"]),
});

export type EventUpsertInput = z.input<typeof eventUpsertSchema>;

function eventSlugFrom(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function adminUpsertEventAction(
  input: EventUpsertInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  await requireAdmin();
  const parsed = eventUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;
  if (d.endsOn < d.startsOn) return { ok: false, error: "종료일이 시작일보다 빠릅니다." };

  const slug = d.slug?.trim() || eventSlugFrom(d.title);
  if (!slug) return { ok: false, error: "slug를 입력해 주세요. (영문 소문자·숫자·하이픈)" };

  const admin = createAdminClient();
  const patch = {
    slug,
    title: d.title,
    subtitle: d.subtitle?.trim() || null,
    description: d.description?.trim() || null,
    poster_url: d.posterUrl?.trim() || null,
    country_code: d.countryCode.toUpperCase(),
    city: d.city?.trim() || null,
    currency: d.currency,
    venue_name: d.venueName?.trim() || null,
    venue_address: d.venueAddress?.trim() || null,
    venue_map_url: d.venueMapUrl?.trim() || null,
    timezone: d.timezone,
    starts_on: d.startsOn,
    ends_on: d.endsOn,
    apply_deadline: d.applyDeadline?.trim() ? new Date(d.applyDeadline).toISOString() : null,
    status: d.status,
    default_lang: d.defaultLang,
    updated_at: new Date().toISOString(),
  };

  const query = d.id
    ? admin.from("workshop_events").update(patch).eq("id", d.id).select("id, slug").single()
    : admin.from("workshop_events").insert(patch).select("id, slug").single();
  const { data: row, error } = await query;
  if (error || !row) {
    if (error?.code === "23505") return { ok: false, error: "같은 slug의 행사가 이미 있습니다." };
    console.error("[adminUpsertEvent] failed:", error);
    return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };
  }

  revalidatePath("/workshops");
  revalidatePath(`/workshops/e/${row.slug}`);
  revalidatePath("/admin/workshops/events");
  return { ok: true, data: { id: row.id as string, slug: row.slug as string } };
}

// ── 어드민: 세션 생성·수정·삭제 ─────────────────────────────────────────────

const sessionUpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  eventId: z.string().uuid(),
  sort: z.number().int().min(0).default(0),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "시작 시각 형식(HH:MM)을 확인해 주세요."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "종료 시각 형식(HH:MM)을 확인해 주세요."),
  title: z.string().trim().min(1, "클래스명을 입력해 주세요.").max(160),
  instructorName: z.string().trim().min(1, "강사명을 입력해 주세요.").max(120),
  instructorInstagram: z.string().trim().max(120).optional().nullable(),
  instructorImageUrl: z.string().trim().url().max(2000).optional().nullable().or(z.literal("")),
  level: z.string().trim().max(60).optional().nullable(),
  capacity: z.number().int().positive("정원은 1 이상이어야 합니다."),
  priceLocal: z.number().nonnegative().optional().nullable(),
  priceKrw: z.number().int().nonnegative().optional().nullable(),
  priceUsd: z.number().nonnegative().optional().nullable(),
  status: z.enum(["open", "closed", "hidden"]).default("open"),
});

export type SessionUpsertInput = z.input<typeof sessionUpsertSchema>;

export async function adminUpsertEventSessionAction(
  input: SessionUpsertInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = sessionUpsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;
  if (d.endTime <= d.startTime) return { ok: false, error: "종료 시각이 시작 시각보다 빨라야 합니다." };
  if (d.priceLocal == null && d.priceKrw == null) {
    return { ok: false, error: "행사 통화 가격 또는 원화 가격 중 하나는 필요합니다." };
  }

  const admin = createAdminClient();

  // 행사 통화가 KRW 면 행사통화 가격이 곧 원화 — Toss 가 자동으로 켜지도록 복사한다.
  let priceKrw = d.priceKrw ?? null;
  if (priceKrw === null && d.priceLocal != null) {
    const { data: ev } = await admin
      .from("workshop_events")
      .select("currency")
      .eq("id", d.eventId)
      .maybeSingle();
    if (ev?.currency === "KRW") priceKrw = Math.round(d.priceLocal);
  }
  const patch = {
    event_id: d.eventId,
    sort: d.sort,
    session_date: d.sessionDate,
    start_time: d.startTime,
    end_time: d.endTime,
    title: d.title,
    instructor_name: d.instructorName,
    instructor_instagram: d.instructorInstagram?.trim() || null,
    instructor_image_url: d.instructorImageUrl?.trim() || null,
    level: d.level?.trim() || null,
    capacity: d.capacity,
    price_local: d.priceLocal ?? null,
    price_krw: priceKrw,
    price_usd: d.priceUsd ?? null,
    status: d.status,
    updated_at: new Date().toISOString(),
  };

  const query = d.id
    ? admin.from("workshop_event_sessions").update(patch).eq("id", d.id).select("id").single()
    : admin.from("workshop_event_sessions").insert(patch).select("id").single();
  const { data: row, error } = await query;
  if (error || !row) {
    console.error("[adminUpsertEventSession] failed:", error);
    return { ok: false, error: "세션 저장에 실패했습니다." };
  }
  revalidatePath("/admin/workshops/events");
  revalidatePath("/workshops");
  return { ok: true, data: { id: row.id as string } };
}

export async function adminDeleteEventSessionAction(input: {
  id: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const id = String(input?.id ?? "").trim();
  if (!id) return { ok: false, error: "세션을 찾을 수 없습니다." };
  const admin = createAdminClient();

  // 신청이 붙은 세션은 지우지 않는다 — 마감(closed)으로 내리라고 안내.
  const { count } = await admin
    .from("workshop_event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "신청이 있는 세션은 삭제할 수 없습니다. 상태를 '마감'으로 바꿔주세요." };
  }
  const { error } = await admin.from("workshop_event_sessions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/workshops/events");
  return { ok: true };
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
