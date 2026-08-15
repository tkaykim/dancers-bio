import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPaymentCallback } from "@/lib/visa/payment-link";
import {
  sendPaymentInternalNotice,
  sendPaymentReceiptEmail,
} from "@/lib/notify/payment-receipt-mail";

// grigoent 결제 승인 → 결제 완료 메일 2통 발송.
//   1) 구매자에게 영수증 (결제 언어로)
//   2) contact@deetz.kr 에게 내부 알림
//
// 결제는 grigoent 에서 일어나지만 발신은 contact@deetz.kr 로 통일한다(대표 지시).
// 그래서 SMTP 자격증명을 grigoent 에 복제하지 않고, 여기로 넘겨받아 보낸다.
//
// 인증: 본문 전체를 VISA_PAYMENT_LINK_SECRET 으로 HMAC 서명 (x-visa-signature).
// 비자 케이스 콜백과 같은 비밀·같은 방식이다.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.string().email(),
  customerName: z.string().trim().min(1).max(120),
  lang: z.string().trim().max(8).nullable().optional(),
  orderNo: z.string().trim().min(3).max(64),
  productTitle: z.string().trim().min(1).max(200),
  paidAmount: z.number().int().positive().max(100_000_000),
  originalAmount: z.number().int().positive().max(100_000_000),
  discountCode: z.string().trim().max(64).nullable().optional(),
  discountAmount: z.number().int().min(0).max(100_000_000),
  provider: z.enum(["toss", "paypal"]),
  foreignCharge: z
    .object({ currency: z.string().trim().min(3).max(8), amount: z.number().positive() })
    .nullable()
    .optional(),
  paidAt: z.string().datetime(),
  receiptUrl: z.string().url().nullable().optional(),
  visaCaseUrl: z.string().url().nullable().optional(),
});

export async function POST(request: NextRequest) {
  // 서명 검증은 파싱 전 원문으로 한다 (JSON 재직렬화하면 바이트가 달라진다).
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

  const input = {
    ...parsed.data,
    lang: parsed.data.lang ?? null,
    discountCode: parsed.data.discountCode ?? null,
    foreignCharge: parsed.data.foreignCharge ?? null,
    receiptUrl: parsed.data.receiptUrl ?? null,
  };

  // 두 통은 서로 독립이다. 하나가 실패해도 나머지는 보낸다.
  const [buyer, internal] = await Promise.all([
    sendPaymentReceiptEmail(input).catch((error) => ({
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    })),
    sendPaymentInternalNotice({ ...input, visaCaseUrl: parsed.data.visaCaseUrl ?? null }).catch(
      (error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
    ),
  ]);

  if (!buyer.ok || !internal.ok) {
    console.error("[payments/receipt] send failed", {
      orderNo: parsed.data.orderNo,
      buyer: buyer.ok ? "ok" : buyer.error,
      internal: internal.ok ? "ok" : internal.error,
    });
  }

  return NextResponse.json({
    ok: true,
    buyerSent: buyer.ok,
    internalSent: internal.ok,
    buyerError: buyer.ok ? undefined : buyer.error,
    internalError: internal.ok ? undefined : internal.error,
  });
}
