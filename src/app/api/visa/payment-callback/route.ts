import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPaymentCallback } from "@/lib/visa/payment-link";

// grigoent 결제 시스템 → deetz 미러링 webhook.
//
// 결제 정본은 grigoent 쪽 training_orders 다. 여기서는 어드민이 한 화면에서 보게 하려고
// "결제됨/환불됨" 사실만 받아 적는다. 금액 계산이나 정산 판단은 하지 않는다.
//
// 대상 구분: 콜백 본문에는 상품 정보가 없고 id 하나만 온다.
// 그래서 id 로 어느 테이블 행인지 찾는다 —
//   dancer_visa_applications 에 있으면 비자·오디션 결제,
//   village_waitlist 에 있으면 Village 사전예약금.
// (결제 링크를 만들 때 상품별로 다른 테이블의 id 를 ref 에 담기 때문에 성립한다.)
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
    .select("id, email, payment_status, payment_order_no, payment_meta, contract_status")
    .eq("id", applicationId)
    .maybeSingle();

  if (readError) {
    console.error("[visa/payment-callback] read failed", readError);
    return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
  }

  // 비자 케이스가 아니면 Village 사전예약금인지 본다.
  if (!current) {
    return handleVillageDeposit(admin, {
      id: applicationId,
      event,
      orderNo,
      provider,
      amountKrw,
      occurredAt,
      meta,
    });
  }

  // ── 귀속 대상 결정 ──────────────────────────────────────────────────────
  // 링크(ref 토큰)는 "발급받은 사람"을 가리키지만, 링크가 공유되면 다른 사람이 결제할 수 있다.
  // 실제로 2026-08-18 Maia 앞으로 발급된 링크로 치나가 결제해, 돈 낸 사람이 미결제로
  // 남는 사고가 있었다. 그래서 결제자 이메일(meta.customerEmail)을 우선한다:
  //   - 결제자 이메일이 다른 케이스의 이메일과 일치하면 → 그 케이스에 귀속
  //   - 어떤 케이스와도 일치하지 않으면 → 토큰 케이스에 붙이되 불일치를 남겨 확인을 요구
  const payerEmail =
    typeof meta?.customerEmail === "string" && meta.customerEmail.trim()
      ? meta.customerEmail.trim().toLowerCase()
      : null;

  let target = current;
  let payerMismatch = false;

  if (event === "paid" && payerEmail && payerEmail !== (current.email ?? "").toLowerCase()) {
    const { data: byEmail } = await admin
      .from("dancer_visa_applications")
      .select("id, email, payment_status, payment_order_no, payment_meta, contract_status")
      .ilike("email", payerEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byEmail) {
      console.warn("[visa/payment-callback] payer email differs — rerouting", {
        orderNo,
        tokenCase: current.id,
        payerCase: byEmail.id,
      });
      target = byEmail;
    } else {
      payerMismatch = true;
    }
  }

  // 환불은 그 주문을 실제로 들고 있는 케이스를 뒤집어야 한다(귀속 변경 이후에도 정확하게).
  if (event === "refunded") {
    const { data: holder } = await admin
      .from("dancer_visa_applications")
      .select("id, email, payment_status, payment_order_no, payment_meta, contract_status")
      .eq("payment_order_no", orderNo)
      .limit(1)
      .maybeSingle();
    if (holder) target = holder;
  }

  // 같은 주문의 같은 이벤트가 재전송되면 조용히 성공 처리한다 (webhook 재시도 대비).
  if (target.payment_status === event && target.payment_order_no === orderNo) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const enrichedMeta: Record<string, unknown> = {
    ...((target.payment_meta ?? {}) as Record<string, unknown>),
    ...(meta ?? {}),
    ...(payerEmail ? { payer_email: payerEmail } : {}),
    ...(target.id !== current.id ? { rerouted_from_case: current.id } : {}),
    ...(payerMismatch ? { payer_email_mismatch: true } : {}),
  };
  const isProgramPayment = enrichedMeta.issued_product_slug === "training-and-placement";

  const patch =
    event === "paid"
      ? {
          payment_status: "paid",
          payment_order_no: orderNo,
          payment_provider: provider,
          payment_amount_krw: amountKrw,
          paid_at: occurredAt,
          payment_refunded_at: null,
          payment_meta: enrichedMeta,
          ...(isProgramPayment && target.contract_status === "signed"
            ? { case_stage: "visa_documents_basic", status: "documents" }
            : {}),
          next_action: payerMismatch
            ? "결제 완료 — 결제자 이메일이 케이스와 달라 확인 필요"
            : isProgramPayment
              ? "프로그램 등록 결제 완료 — 계약 상태 확인"
              : "오디션 참석비 결제 완료 — 다음 단계 안내",
        }
      : {
          payment_status: "refunded",
          payment_order_no: orderNo,
          payment_provider: provider,
          payment_refunded_at: occurredAt,
          payment_meta: enrichedMeta,
          next_action: "결제 취소·환불됨 — 확인 필요",
        };

  const { error: updateError } = await admin
    .from("dancer_visa_applications")
    .update(patch)
    .eq("id", target.id);

  if (updateError) {
    console.error("[visa/payment-callback] update failed", updateError);
    return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ── Village 사전예약금 ─────────────────────────────────────────────────────
// 비자 케이스와 컬럼만 다르고 규칙은 같다: 사실만 받아 적고, 재전송은 조용히 성공.
async function handleVillageDeposit(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    id: string;
    event: "paid" | "refunded";
    orderNo: string;
    provider: string;
    amountKrw: number;
    occurredAt: string;
    meta?: Record<string, unknown>;
  },
): Promise<NextResponse> {
  const { data: row, error } = await admin
    .from("village_waitlist")
    .select("id, deposit_status, deposit_order_no")
    .eq("id", input.id)
    .maybeSingle();

  if (error) {
    console.error("[visa/payment-callback] village read failed", error);
    return NextResponse.json({ ok: false, error: "lookup failed" }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "subject not found" }, { status: 404 });
  }

  if (row.deposit_status === input.event && row.deposit_order_no === input.orderNo) {
    return NextResponse.json({ ok: true, deduped: true, target: "village" });
  }

  const patch =
    input.event === "paid"
      ? {
          deposit_status: "paid",
          deposit_order_no: input.orderNo,
          deposit_provider: input.provider,
          deposit_amount_krw: input.amountKrw,
          deposit_paid_at: input.occurredAt,
          deposit_refunded_at: null,
          deposit_meta: input.meta ?? {},
          // 결제까지 한 사람은 단순 관심 등록과 구분해서 우선 응대한다.
          status: "contacted",
        }
      : {
          deposit_status: "refunded",
          deposit_order_no: input.orderNo,
          deposit_provider: input.provider,
          deposit_refunded_at: input.occurredAt,
          deposit_meta: input.meta ?? {},
        };

  const { error: updateError } = await admin
    .from("village_waitlist")
    .update(patch)
    .eq("id", input.id);

  if (updateError) {
    console.error("[visa/payment-callback] village update failed", updateError);
    return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, target: "village" });
}
