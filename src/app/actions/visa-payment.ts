"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeVisaPaymentUrl } from "@/lib/visa/payment-link";
import {
  PROGRAM_AMOUNT_MAX_KRW,
  PROGRAM_AMOUNT_MIN_KRW,
  defaultProgramAmount,
} from "@/lib/visa/program-amount";
import type { ActionResult } from "./auth";

// 오디션까지 마친 지원자에게 보낼 결제 링크를 발급한다.
//
// 링크는 grigoent 결제 페이지를 가리키고, ref 토큰이 "이 결제 = 이 케이스"를 증명한다.
// 결제가 승인되면 grigoent 가 /api/visa/payment-callback 으로 결과를 돌려주고,
// 그때 payment_status 가 paid 로 바뀐다. 여기서는 link_sent 까지만 기록한다.

const issueSchema = z.object({
  applicationId: z.string().uuid(),
  productSlug: z.enum(["audition-fee", "training-and-placement"]),
  // 프로그램 결제 금액(원). 생략하면 기본값(오디션비 결제자 3,900,000 / 그 외 4,000,000).
  amountKrw: z
    .number()
    .int("금액은 원 단위 정수로 입력해 주세요.")
    .min(PROGRAM_AMOUNT_MIN_KRW, "결제 금액은 10,000원 이상이어야 합니다.")
    .max(PROGRAM_AMOUNT_MAX_KRW, "결제 금액은 20,000,000원 이하여야 합니다.")
    .optional(),
});

export async function issueVisaPaymentLinkAction(
  input: z.input<typeof issueSchema>,
): Promise<ActionResult<{ url: string; amountKrw: number | null }>> {
  // 권한 없으면 내부에서 redirect 한다.
  await requireAdmin();

  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const { applicationId, productSlug, amountKrw } = parsed.data;
  const supabase = createAdminClient();

  const { data: application } = await supabase
    .from("dancer_visa_applications")
    .select("id, payment_status, payment_meta, payment_order_no, payment_provider, payment_amount_krw, paid_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  const prevMeta = (application.payment_meta ?? {}) as Record<string, unknown>;
  const previousProduct = typeof prevMeta.issued_product_slug === "string"
    ? prevMeta.issued_product_slug
    : "audition-fee";
  const movingFromPaidAuditionToProgram =
    application.payment_status === "paid" &&
    previousProduct === "audition-fee" &&
    productSlug === "training-and-placement";
  if (application.payment_status === "paid" && !movingFromPaidAuditionToProgram) {
    return { ok: false, error: "이미 결제가 완료된 건입니다." };
  }
  if (application.payment_status === "link_sent" && previousProduct !== productSlug) {
    return { ok: false, error: "기존 결제 링크가 아직 대기 중입니다. 기존 결제 상태를 먼저 확인해 주세요." };
  }

  // 프로그램 링크는 금액을 함께 기록한다. 같은 상품 링크를 다시 발급하면 금액만 바뀐다.
  const programAmount = productSlug === "training-and-placement"
    ? amountKrw ?? defaultProgramAmount(application)
    : null;

  let url: string;
  try {
    url = makeVisaPaymentUrl(applicationId, productSlug);
  } catch (error) {
    console.error("[visa-payment] ref 생성 실패", error);
    return { ok: false, error: "결제 링크 설정이 완료되지 않았습니다. (VISA_PAYMENT_LINK_SECRET)" };
  }

  // 어떤 상품의 링크를 발급했는지 남긴다 — 케이스 포털이 이 값으로
  // "오디션 참가비 카드"와 "프로그램 결제 카드"를 구분해 그린다.
  const completedPayments = Array.isArray(prevMeta.completed_payments)
    ? prevMeta.completed_payments
    : [];
  const archivedPayments = movingFromPaidAuditionToProgram
    ? [
        ...completedPayments,
        {
          product_slug: previousProduct,
          status: "paid",
          order_no: application.payment_order_no,
          provider: application.payment_provider,
          amount_krw: application.payment_amount_krw,
          paid_at: application.paid_at,
        },
      ]
    : completedPayments;
  const { error } = await supabase
    .from("dancer_visa_applications")
    .update({
      payment_status: "link_sent",
      payment_link_sent_at: new Date().toISOString(),
      payment_order_no: movingFromPaidAuditionToProgram ? null : application.payment_order_no,
      payment_provider: movingFromPaidAuditionToProgram ? null : application.payment_provider,
      payment_amount_krw: movingFromPaidAuditionToProgram ? null : application.payment_amount_krw,
      paid_at: movingFromPaidAuditionToProgram ? null : application.paid_at,
      payment_refunded_at: null,
      payment_meta: {
        ...Object.fromEntries(Object.entries(prevMeta).filter(([key]) => key !== "issued_amount_krw")),
        issued_product_slug: productSlug,
        ...(programAmount !== null ? { issued_amount_krw: programAmount } : {}),
        ...(archivedPayments.length > 0 ? { completed_payments: archivedPayments } : {}),
      },
      ...(productSlug === "training-and-placement"
        ? { case_stage: "contract_and_payment", status: "reviewing" }
        : {}),
      next_action: "결제 링크 발송 — 입금 대기",
    })
    .eq("id", applicationId);

  if (error) {
    console.error("[visa-payment] 상태 갱신 실패", error);
    return { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { url, amountKrw: programAmount } };
}
