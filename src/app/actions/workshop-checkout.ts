"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  captureWorkshopPaypalOrder,
  confirmWorkshopTossPayment,
  createWorkshopPaypalOrder,
} from "@/lib/workshops/payments";
import { buildWorkshopOrderNo, SEAT_HOLD_MINUTES, WORKSHOP_POLICY_VERSION } from "@/lib/workshops/shared";
import type { ActionResult } from "./auth";

// deetz Workshop 예약금 체크아웃.
// grigoent /training 의 2단계 패턴: ① 예약 레코드(주문) 생성 → ② Toss 결제창 / PayPal 버튼.
// 예약금 결제는 deetz 계정 필수(인터뷰 결정) — 확정/잔금/양도 커뮤니케이션의 기준점이 된다.

const GENERIC = "오류가 발생했습니다. 다시 시도해 주세요.";

/** `reserve_workshop_seat()` 가 돌려주는 사유 코드 → 사용자 문구. */
const SEAT_ERRORS: Record<string, string> = {
  NOT_FOUND: "워크샵을 찾을 수 없습니다.",
  NOT_RECRUITING: "지금은 예약금 모집 기간이 아닙니다.",
  NO_DEPOSIT: "예약금이 아직 설정되지 않았습니다.",
  DEADLINE: "모집이 마감되었습니다.",
  FULL: "정원이 가득 찼습니다. 취소 자리가 생기면 다시 열립니다.",
  ALREADY_PAID: "이미 예약금 결제를 완료하셨습니다.",
  // 돈은 받았는데 확정 처리가 안 된 건이 있는 상태 — 중복 결제를 막고 운영자 처리를 기다린다.
  RECOVERY_PENDING:
    "이전 결제 건을 확인하고 있습니다. 중복 결제를 막기 위해 확인이 끝난 뒤 다시 시도해 주세요. 문의는 contact@deetz.kr 로 부탁드립니다.",
};

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
    .select("id, name, slug, status")
    .eq("id", d.artistId)
    .maybeSingle();
  if (!artist) return { ok: false, error: "워크샵을 찾을 수 없습니다." };

  // 상태·마감·정원·기존 예약·만료 홀드 정리를 DB 함수 한 번에서 원자적으로 처리한다.
  // (count 후 insert 방식은 동시 요청에서 정원을 초과시킬 수 있어 교체했다.)
  const { data: result, error: rpcError } = await admin.rpc("reserve_workshop_seat", {
    p_artist_id: artist.id,
    p_user_id: user.id,
    p_name: d.name,
    p_email: d.email,
    p_phone: d.phone?.trim() || null,
    p_new_order_no: buildWorkshopOrderNo(new Date(), randomBytes(3).toString("hex")),
    p_terms_version: WORKSHOP_POLICY_VERSION,
    p_hold_minutes: SEAT_HOLD_MINUTES,
  });

  if (rpcError) {
    console.error("[workshopCheckout] reserve rpc failed:", rpcError);
    return { ok: false, error: GENERIC };
  }

  const seat = result as {
    ok: boolean;
    error?: string;
    reservation_id?: string;
    order_no?: string;
    pg_order_id?: string;
    amount?: number;
  } | null;

  if (!seat?.ok) {
    return { ok: false, error: SEAT_ERRORS[seat?.error ?? ""] ?? GENERIC };
  }

  return {
    ok: true,
    data: {
      reservationId: seat.reservation_id!,
      orderNo: seat.order_no!,
      pgOrderId: seat.pg_order_id!,
      amount: seat.amount!,
      orderName: `${artist.name} 초청 워크샵 예약금`,
      artistSlug: (artist.slug as string) ?? null,
      customerKey: user.id,
      customerName: d.name,
      customerEmail: d.email,
      customerPhone: d.phone?.trim() || null,
    },
  };
}

// ── Toss 승인 (성공 페이지에서 1회 호출) ───────────────────────────────────

/**
 * 토스 결제 승인.
 *
 * GET 렌더(서버 컴포넌트)에서 부작용을 일으키지 않도록 성공 페이지가 마운트 후 이 액션을 호출한다.
 * 상태 전이가 DB에서 원자적이라 중복 호출·새로고침에도 영수증 메일은 한 번만 나간다.
 */
export type ConfirmActionResult =
  | { ok: true; data: { orderNo: string; amount: number; artistSlug: string | null } }
  /** 돈은 받았으나 예약 확정 실패 — 성공으로도 실패로도 표시하면 안 되는 상태. */
  | { ok: false; recovery: true; orderNo: string | null; error: string }
  | { ok: false; recovery?: false; error: string };

export async function confirmWorkshopTossPaymentAction(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<ConfirmActionResult> {
  const paymentKey = String(input?.paymentKey ?? "").trim();
  const orderId = String(input?.orderId ?? "").trim();
  const amount = Number(input?.amount);
  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    return { ok: false, error: "결제 정보가 누락되었습니다." };
  }
  const result = await confirmWorkshopTossPayment({ paymentKey, orderId, amount });
  if (!result.ok) {
    if (result.recovery) {
      return { ok: false, recovery: true, orderNo: result.orderNo, error: result.error };
    }
    return { ok: false, error: result.error };
  }
  revalidatePath("/me/workshops");
  return {
    ok: true,
    data: { orderNo: result.orderNo, amount: result.amount, artistSlug: result.artistSlug },
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

export type PaypalCaptureActionResult =
  | { ok: true; data: { orderNo: string; artistSlug: string | null } }
  /** Toss 와 동일하게, 돈은 받았으나 확정 실패한 경우를 실패로 표시하지 않는다. */
  | { ok: false; recovery: true; orderNo: string | null; error: string }
  | { ok: false; recovery?: false; error: string };

export async function captureWorkshopPaypalOrderAction(input: {
  paypalOrderId: string;
  pgOrderId: string;
}): Promise<PaypalCaptureActionResult> {
  const paypalOrderId = String(input?.paypalOrderId ?? "").trim();
  const pgOrderId = String(input?.pgOrderId ?? "").trim();
  if (!paypalOrderId || !pgOrderId) return { ok: false, error: "결제 정보가 누락되었습니다." };
  const result = await captureWorkshopPaypalOrder({ paypalOrderId, pgOrderId });
  if (!result.ok) {
    if (result.recovery) {
      return { ok: false, recovery: true, orderNo: result.orderNo, error: result.error };
    }
    return { ok: false, error: result.error };
  }
  revalidatePath("/me/workshops");
  return { ok: true, data: { orderNo: result.orderNo, artistSlug: result.artistSlug } };
}
