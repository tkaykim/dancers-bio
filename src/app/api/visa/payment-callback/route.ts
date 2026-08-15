import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentCallback } from "@/lib/visa/payment-link";

// grigoent 결제 시스템 → deetz 케이스 미러링 webhook.
//
// 결제 정본은 grigoent 쪽 training_orders 다. 여기서는 어드민이 한 화면에서 보게 하려고
// "결제됨/환불됨" 사실만 받아 적는다. 금액 계산이나 정산 판단은 하지 않는다.
//
// 인증: 본문 전체를 VISA_PAYMENT_LINK_SECRET 으로 HMAC 서명한 값을 x-visa-signature 로 받는다.
// (서버 액션이 아니라 라우트 핸들러인 이유 = 외부 webhook. CLAUDE.md 규칙상 허용 경로.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  applicationId: z.string().uuid(),
  event: z.enum(["paid", "refunded"]),
  orderNo: z.string().trim().min(3).max(64),
  provider: z.enum(["toss", "paypal"]),
  amountKrw: z.number().int().positive().max(100_000_000),
  occurredAt: z.string().datetime(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  // 서명 검증은 파싱 전 원문으로 해야 한다 (JSON 재직렬화하면 바이트가 달라진다).
  const raw = await request.text();
  if (!verifyPaymentCallback(raw, request.headers.get("x-visa-signature"))) {
    return NextResponse.json({ ok: false, error: "signature mismatch" }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "invalid payload" },
      { status: 400 },
    );
  }

  const { applicationId, event, orderNo, provider, amountKrw, occurredAt, meta } = parsed.data;
  const admin = createAdminClient();

  const { data: current, error: readError } = await admin
    .from("dancer_visa_applications")
    .select("id, payment_status, payment_order_no")
    .eq("id", applicationId)
    .maybeSingle();

  if (readError) {
    console.error("[visa/payment-callback] read failed", readError);
    return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ ok: false, error: "application not found" }, { status: 404 });
  }

  // 같은 주문의 같은 이벤트가 재전송되면 조용히 성공 처리한다 (webhook 재시도 대비).
  if (current.payment_status === event && current.payment_order_no === orderNo) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const patch =
    event === "paid"
      ? {
          payment_status: "paid",
          payment_order_no: orderNo,
          payment_provider: provider,
          payment_amount_krw: amountKrw,
          paid_at: occurredAt,
          payment_refunded_at: null,
          payment_meta: meta ?? {},
          next_action: "결제 완료 — 다음 단계 안내",
        }
      : {
          payment_status: "refunded",
          payment_order_no: orderNo,
          payment_provider: provider,
          payment_refunded_at: occurredAt,
          payment_meta: meta ?? {},
          next_action: "결제 취소·환불됨 — 확인 필요",
        };

  const { error: updateError } = await admin
    .from("dancer_visa_applications")
    .update(patch)
    .eq("id", applicationId);

  if (updateError) {
    console.error("[visa/payment-callback] update failed", updateError);
    return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
