"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  captureWorkshopPaypalOrder,
  createWorkshopPaypalOrder,
} from "@/lib/workshops/payments";
import { buildWorkshopOrderNo } from "@/lib/workshops/shared";
import type { ActionResult } from "./auth";

// deetz Workshop 예약금 체크아웃.
// grigoent /training 의 2단계 패턴: ① 예약 레코드(주문) 생성 → ② Toss 결제창 / PayPal 버튼.
// 예약금 결제는 deetz 계정 필수(인터뷰 결정) — 확정/잔금/양도 커뮤니케이션의 기준점이 된다.

const GENERIC = "오류가 발생했습니다. 다시 시도해 주세요.";

export type WorkshopCheckoutSession = {
  reservationId: string;
  orderNo: string;
  pgOrderId: string;
  amount: number;
  orderName: string;
  artistSlug: string | null;
  customerKey: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
};

const createSchema = z.object({
  artistId: z.string().uuid(),
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(120),
  email: z.string().trim().email("이메일 형식을 확인해 주세요.").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+\-\s]*$/, "연락처 형식을 확인해 주세요.")
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type WorkshopCheckoutInput = z.input<typeof createSchema>;

/** 예약(주문) 생성 — 기존 pending 예약이 있으면 재사용한다. */
export async function createWorkshopReservationAction(
  input: WorkshopCheckoutInput,
): Promise<ActionResult<WorkshopCheckoutSession>> {
  const user = await getUser();
  if (!user) return { ok: false, error: "예약금 결제에는 로그인이 필요합니다." };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }
  const d = parsed.data;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: GENERIC };
  }

  const { data: artist } = await admin
    .from("workshop_artists")
    .select("id, name, slug, status, deposit_amount, max_headcount, recruit_deadline")
    .eq("id", d.artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "워크샵을 찾을 수 없습니다." };
  if (artist.status !== "recruiting") {
    return { ok: false, error: "지금은 예약금 모집 기간이 아닙니다." };
  }
  const amount = artist.deposit_amount as number | null;
  if (!amount || amount <= 0) return { ok: false, error: "예약금이 아직 설정되지 않았습니다." };
  if (artist.recruit_deadline && new Date(artist.recruit_deadline as string).getTime() < Date.now()) {
    return { ok: false, error: "모집이 마감되었습니다." };
  }

  // 정원 체크 (결제 완료 기준)
  if (artist.max_headcount) {
    const { count } = await admin
      .from("workshop_reservations")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", artist.id)
      .in("status", ["paid", "confirmed"]);
    if ((count ?? 0) >= (artist.max_headcount as number)) {
      return { ok: false, error: "정원이 가득 찼습니다." };
    }
  }

  const orderName = `${artist.name} 초청 워크샵 예약금`;
  const customer = {
    customer_name: d.name,
    customer_email: d.email,
    customer_phone: d.phone?.trim() || null,
  };

  // 같은 유저의 기존 활성 예약 확인 — paid면 중복 결제 차단, pending이면 재사용.
  const { data: existing } = await admin
    .from("workshop_reservations")
    .select("id, status, order_no, pg_order_id, amount")
    .eq("artist_id", artist.id)
    .eq("user_id", user.id)
    .in("status", ["pending", "paid", "confirmed"])
    .maybeSingle();

  if (existing && existing.status !== "pending") {
    return { ok: false, error: "이미 예약금 결제를 완료하셨습니다." };
  }

  if (existing) {
    const { error } = await admin
      .from("workshop_reservations")
      .update({ ...customer, amount, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      console.error("[workshopCheckout] pending reuse failed:", error);
      return { ok: false, error: GENERIC };
    }
    return {
      ok: true,
      data: {
        reservationId: existing.id as string,
        orderNo: existing.order_no as string,
        pgOrderId: (existing.pg_order_id as string) ?? (existing.order_no as string),
        amount,
        orderName,
        artistSlug: (artist.slug as string) ?? null,
        customerKey: user.id,
        customerName: d.name,
        customerEmail: d.email,
        customerPhone: d.phone?.trim() || null,
      },
    };
  }

  const orderNo = buildWorkshopOrderNo(new Date(), randomBytes(3).toString("hex"));
  const { data: created, error: createError } = await admin
    .from("workshop_reservations")
    .insert({
      artist_id: artist.id,
      user_id: user.id,
      ...customer,
      amount,
      currency: "KRW",
      status: "pending",
      order_no: orderNo,
      pg_order_id: orderNo,
    })
    .select("id")
    .single();
  if (createError || !created) {
    console.error("[workshopCheckout] insert failed:", createError);
    return { ok: false, error: GENERIC };
  }

  return {
    ok: true,
    data: {
      reservationId: created.id as string,
      orderNo,
      pgOrderId: orderNo,
      amount,
      orderName,
      artistSlug: (artist.slug as string) ?? null,
      customerKey: user.id,
      customerName: d.name,
      customerEmail: d.email,
      customerPhone: d.phone?.trim() || null,
    },
  };
}

// ── PayPal (클라이언트 버튼 콜백에서 호출) ─────────────────────────────────

export async function createWorkshopPaypalOrderAction(input: {
  pgOrderId: string;
  orderName: string;
}): Promise<ActionResult<{ id: string }>> {
  const pgOrderId = String(input?.pgOrderId ?? "").trim();
  if (!pgOrderId) return { ok: false, error: "주문 정보가 누락되었습니다." };
  const result = await createWorkshopPaypalOrder({
    pgOrderId,
    description: String(input?.orderName ?? "deetz workshop deposit"),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { id: result.id } };
}

export async function captureWorkshopPaypalOrderAction(input: {
  paypalOrderId: string;
  pgOrderId: string;
}): Promise<ActionResult<{ orderNo: string; artistSlug: string | null }>> {
  const paypalOrderId = String(input?.paypalOrderId ?? "").trim();
  const pgOrderId = String(input?.pgOrderId ?? "").trim();
  if (!paypalOrderId || !pgOrderId) return { ok: false, error: "결제 정보가 누락되었습니다." };
  const result = await captureWorkshopPaypalOrder({ paypalOrderId, pgOrderId });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { orderNo: result.orderNo, artistSlug: result.artistSlug } };
}
