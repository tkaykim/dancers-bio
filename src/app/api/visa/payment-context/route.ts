import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyVisaPaymentRef } from "@/lib/visa/payment-link";

export const dynamic = "force-dynamic";

function preferredLang(value: unknown): "ko" | "en" | "ja" {
  return value === "ko" || value === "ja" ? value : "en";
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

// 개인 결제 링크의 ref를 검증한 뒤 결제 화면에 필요한 최소 정보만 돌려준다.
// 이메일을 ref payload나 URL query에 넣지 않아 브라우저 주소와 메일 링크에 PII가 노출되지 않는다.
export async function GET(request: NextRequest) {
  const paymentRef = verifyVisaPaymentRef(request.nextUrl.searchParams.get("ref"));
  if (!paymentRef) {
    return noStoreJson({ success: false, reason: "invalid_or_expired" }, 401);
  }

  const admin = createAdminClient();
  const { data: application, error: applicationError } = await admin
    .from("dancer_visa_applications")
    .select("id, dancer_id, email, preferred_lang, payment_status")
    .eq("id", paymentRef.applicationId)
    .maybeSingle();

  if (applicationError) {
    console.error("[visa/payment-context] application lookup failed", applicationError);
    return noStoreJson({ success: false, reason: "unavailable" }, 500);
  }
  if (!application) {
    return noStoreJson({ success: false, reason: "not_found" }, 404);
  }
  if (application.payment_status === "paid") {
    return noStoreJson({ success: false, reason: "already_paid" }, 409);
  }

  const email = String(application.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("[visa/payment-context] application email is invalid", paymentRef.applicationId);
    return noStoreJson({ success: false, reason: "unavailable" }, 500);
  }

  let name = email.split("@")[0] ?? email;
  let phone = "";
  let nationality = "";
  if (application.dancer_id) {
    const [{ data: dancer }, { data: privateInfo }] = await Promise.all([
      admin
        .from("dancers")
        .select("stage_name, korean_name")
        .eq("id", application.dancer_id)
        .maybeSingle(),
      admin
        .from("dancer_private_info")
        .select("phone, nationality")
        .eq("dancer_id", application.dancer_id)
        .maybeSingle(),
    ]);
    name = String(dancer?.stage_name ?? dancer?.korean_name ?? name).trim() || name;
    phone = String(privateInfo?.phone ?? "").trim();
    nationality = String(privateInfo?.nationality ?? "").trim();
  }

  return noStoreJson({
    success: true,
    applicationId: paymentRef.applicationId,
    productSlug: paymentRef.productSlug,
    customer: {
      name,
      email,
      phone,
      nationality,
      preferredLang: preferredLang(application.preferred_lang),
    },
  });
}
