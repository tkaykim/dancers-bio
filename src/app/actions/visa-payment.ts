"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeVisaPaymentRef } from "@/lib/visa/payment-link";
import type { ActionResult } from "./auth";

// 오디션까지 마친 지원자에게 보낼 결제 링크를 발급한다.
//
// 링크는 grigoent 결제 페이지를 가리키고, ref 토큰이 "이 결제 = 이 케이스"를 증명한다.
// 결제가 승인되면 grigoent 가 /api/visa/payment-callback 으로 결과를 돌려주고,
// 그때 payment_status 가 paid 로 바뀐다. 여기서는 link_sent 까지만 기록한다.

const PAY_SITE_URL = (process.env.NEXT_PUBLIC_GRIGOENT_URL || "https://grigoent.co.kr").replace(
  /\/$/,
  "",
);

// 상품 slug ↔ 결제 페이지 경로. grigoent 쪽 라우트와 1:1로 맞춰야 한다.
const PAYMENT_PAGES = {
  "audition-fee": "/audition-fee",
  "training-and-placement": "/training",
} as const;

export type VisaPaymentProduct = keyof typeof PAYMENT_PAGES;

const issueSchema = z.object({
  applicationId: z.string().uuid(),
  productSlug: z.enum(["audition-fee", "training-and-placement"]),
});

export async function issueVisaPaymentLinkAction(
  input: z.input<typeof issueSchema>,
): Promise<ActionResult<{ url: string }>> {
  // 권한 없으면 내부에서 redirect 한다.
  await requireAdmin();

  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  }

  const { applicationId, productSlug } = parsed.data;
  const supabase = createAdminClient();

  const { data: application } = await supabase
    .from("dancer_visa_applications")
    .select("id, payment_status")
    .eq("id", applicationId)
    .maybeSingle();

  if (!application) return { ok: false, error: "지원자를 찾을 수 없습니다." };
  if (application.payment_status === "paid") {
    return { ok: false, error: "이미 결제가 완료된 건입니다." };
  }

  let ref: string;
  try {
    ref = makeVisaPaymentRef(applicationId, productSlug);
  } catch (error) {
    console.error("[visa-payment] ref 생성 실패", error);
    return { ok: false, error: "결제 링크 설정이 완료되지 않았습니다. (VISA_PAYMENT_LINK_SECRET)" };
  }

  const url = `${PAY_SITE_URL}${PAYMENT_PAGES[productSlug]}?ref=${ref}`;

  const { error } = await supabase
    .from("dancer_visa_applications")
    .update({
      payment_status: "link_sent",
      payment_link_sent_at: new Date().toISOString(),
      next_action: "결제 링크 발송 — 입금 대기",
    })
    .eq("id", applicationId);

  if (error) {
    console.error("[visa-payment] 상태 갱신 실패", error);
    return { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/admin/visa");
  return { ok: true, data: { url } };
}
