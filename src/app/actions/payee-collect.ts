"use server";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isResidentNumberValid,
  normalizeBusinessNumber,
  normalizeResidentNumber,
} from "@/lib/payout-validation";
import type { ActionResult } from "./auth";

// 일회성 수취인(계정 없음) PII 수집 — opaque 1회용 토큰 (설계 §3.7·§5.2).
// 기존 /fit HMAC 토큰은 만료·소비 상태가 없는 결정적 토큰이라 재사용하지 않는다.
// 실패 모드는 fail-closed: 토큰을 먼저 소비하고 저장이 실패하면 링크 재발급(관리자).

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type PayeeTokenInfo = {
  dancerId: string;
  name: string;
  taxMode: "withholding" | "invoice";
  hasBrn: boolean;
};

/** 토큰 검증(소비하지 않음) — 수집 페이지 렌더용. */
export async function resolvePayeeToken(
  token: string,
): Promise<PayeeTokenInfo | null> {
  if (!token || token.length < 16 || token.length > 128) return null;
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("payee_collect_tokens")
    .select("dancer_id, expires_at, used_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!t || t.used_at || t.revoked_at) return null;
  if (new Date(t.expires_at as string).getTime() < Date.now()) return null;

  const [{ data: d }, { data: pi }] = await Promise.all([
    admin
      .from("dancers")
      .select("stage_name, korean_name")
      .eq("id", t.dancer_id as string)
      .maybeSingle(),
    admin
      .from("dancer_private_info")
      .select("payee_tax_mode, business_registration_number")
      .eq("dancer_id", t.dancer_id as string)
      .maybeSingle(),
  ]);
  return {
    dancerId: t.dancer_id as string,
    name:
      ((d?.korean_name as string | null)?.trim() ||
        (d?.stage_name as string | null)?.trim()) ??
      "수취인",
    taxMode:
      (pi?.payee_tax_mode as string | null) === "invoice"
        ? "invoice"
        : "withholding",
    hasBrn: !!pi?.business_registration_number,
  };
}

/** 지급정보 제출 — 토큰을 원자적으로 소비한 뒤 저장한다(재사용 차단 우선). */
export async function submitPayeeCollectAction(
  fd: FormData,
): Promise<ActionResult> {
  const token = (fd.get("token") ?? "").toString().trim();
  const bank_name = (fd.get("bank_name") ?? "").toString().trim() || null;
  const bank_code = (fd.get("bank_code") ?? "").toString().trim() || null;
  const bank_account_number =
    (fd.get("bank_account_number") ?? "")
      .toString()
      .replace(/[\s-]/g, "")
      .trim() || null;
  const bank_account_holder =
    (fd.get("bank_account_holder") ?? "").toString().trim() || null;
  const rrn = normalizeResidentNumber(fd.get("resident_registration_number"));
  const brn = normalizeBusinessNumber(fd.get("business_registration_number"));
  if (!token) return { ok: false, error: "잘못된 요청입니다." };
  if (!bank_name || !bank_account_number || !bank_account_holder)
    return { ok: false, error: "은행·계좌번호·예금주를 모두 입력해 주세요." };
  if (!/^[0-9]{8,20}$/.test(bank_account_number))
    return { ok: false, error: "계좌번호는 숫자 8~20자리로 입력해 주세요." };

  const info = await resolvePayeeToken(token);
  if (!info)
    return { ok: false, error: "링크가 만료됐거나 이미 사용됐어요. 담당자에게 재발급을 요청해 주세요." };

  if (info.taxMode === "invoice") {
    if (!brn && !info.hasBrn)
      return { ok: false, error: "사업자등록번호(숫자 10자리)를 입력해 주세요." };
  } else {
    if (!rrn || !isResidentNumberValid(rrn))
      return { ok: false, error: "유효한 주민(외국인)등록번호를 입력해 주세요." };
  }

  const admin = createAdminClient();

  // 1) 토큰 소비 — 미사용 조건부 UPDATE라 이중 제출 경쟁에서도 한 번만 통과한다.
  const { data: consumed } = await admin
    .from("payee_collect_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token_hash", hashToken(token))
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("dancer_id")
    .maybeSingle();
  if (!consumed)
    return { ok: false, error: "링크가 만료됐거나 이미 사용됐어요. 담당자에게 재발급을 요청해 주세요." };
  const dancerId = consumed.dancer_id as string;

  // 2) 지급정보 저장.
  const patch: Record<string, unknown> = {
    bank_name,
    bank_code,
    bank_account_number,
    bank_account_holder,
  };
  if (info.taxMode === "invoice") {
    if (brn) patch.business_registration_number = brn;
  } else {
    patch.resident_registration_number = `${rrn!.slice(0, 6)}-${rrn!.slice(6)}`;
  }
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const { error } = existing
    ? await admin
        .from("dancer_private_info")
        .update(patch)
        .eq("dancer_id", dancerId)
    : await admin
        .from("dancer_private_info")
        .insert({ dancer_id: dancerId, ...patch });
  if (error)
    return {
      ok: false,
      error:
        "저장에 실패했습니다. 링크가 이미 사용 처리됐으니 담당자에게 재발급을 요청해 주세요.",
    };

  return { ok: true };
}
