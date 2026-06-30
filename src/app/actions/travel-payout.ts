"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayoutToken } from "@/lib/quick-token";
import type { ActionResult } from "./auth";

function clean(v: FormDataEntryValue | null, max = 120): string {
  return (v ?? "").toString().trim().slice(0, max);
}

// 교통비 계좌정보 제출 — 토큰 매직링크로 로그인 없이 본인 행에 저장.
export async function submitTravelPayoutAction(
  formData: FormData,
): Promise<ActionResult> {
  const token = clean(formData.get("token"), 400);
  const payoutId = verifyPayoutToken(token);
  if (!payoutId)
    return { ok: false, error: "링크가 유효하지 않거나 만료되었습니다." };

  const account_holder = clean(formData.get("account_holder"), 60);
  const bank_name = clean(formData.get("bank_name"), 40);
  const account_number = clean(formData.get("account_number"), 60);
  const contact = clean(formData.get("contact"), 40);

  if (!account_holder) return { ok: false, error: "예금주를 입력해 주세요." };
  if (!bank_name) return { ok: false, error: "은행을 선택해 주세요." };
  // 계좌번호: 숫자/하이픈만 남기고 최소 길이 체크
  const acctDigits = account_number.replace(/[^0-9]/g, "");
  if (acctDigits.length < 8)
    return { ok: false, error: "계좌번호를 정확히 입력해 주세요." };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("travel_payouts")
    .select("id, status")
    .eq("id", payoutId)
    .maybeSingle();
  if (!row) return { ok: false, error: "지급 대상 정보를 찾을 수 없습니다." };

  const { error } = await admin
    .from("travel_payouts")
    .update({
      account_holder,
      bank_name,
      account_number,
      contact: contact || null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payoutId);

  if (error)
    return { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  return { ok: true };
}
