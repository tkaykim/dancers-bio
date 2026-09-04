import { createHmac, timingSafeEqual } from "node:crypto";
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

// 링크로 결제하는 사람 확인용 정보를 돌려준다.
//
// 링크(ref)에는 유효기간이 없다. 대신 **링크만 가진 요청에게는 가려진 값만** 준다 —
// 링크가 메일 전달·화면 공유로 새더라도 그것만으로 지원자의 실제 연락처를 알 수 없다.
// 실제 이름·이메일·전화·국적은 공유 시크릿(VISA_PAYMENT_LINK_SECRET)으로 ref 를 서명한
// 서버 대 서버 요청(grigoent 결제 서버)에만 준다.
function isSignedRequest(request: NextRequest, ref: string): boolean {
  const signature = request.headers.get("x-visa-signature");
  const key = process.env.VISA_PAYMENT_LINK_SECRET;
  if (!signature || !key) return false;
  try {
    const expected = createHmac("sha256", key).update(ref).digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 이름: 첫 글자만 남긴다. "김주성" → "김••" / "Alicia" → "A•••••" */
function maskName(value: string): string {
  const name = value.trim();
  if (!name) return "";
  return `${name.slice(0, 1)}${"•".repeat(Math.max(name.length - 1, 2))}`;
}

/** 이메일: 로컬파트 앞 2자 + 도메인. "hwanheeyang404@gmail.com" → "hw•••@gmail.com" */
function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}•••@${domain}`;
}

export async function GET(request: NextRequest) {
  const rawRef = request.nextUrl.searchParams.get("ref");
  const paymentRef = verifyVisaPaymentRef(rawRef);
  if (!paymentRef || !rawRef) {
    return noStoreJson({ success: false, reason: "invalid_or_expired" }, 401);
  }
  const full = isSignedRequest(request, rawRef);

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
    masked: !full,
    applicationId: paymentRef.applicationId,
    productSlug: paymentRef.productSlug,
    customer: full
      ? {
          name,
          email,
          phone,
          nationality,
          preferredLang: preferredLang(application.preferred_lang),
        }
      : {
          // 링크만 가진 요청 — 본인 확인에 필요한 만큼만 가려서 준다.
          name: maskName(name),
          email: maskEmail(email),
          phone: "",
          nationality: "",
          preferredLang: preferredLang(application.preferred_lang),
        },
  });
}
