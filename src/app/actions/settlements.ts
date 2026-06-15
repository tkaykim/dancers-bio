"use server";

import { revalidatePath } from "next/cache";
import { canManageProject, requireAdmin, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_WITHHOLDING_RATE } from "@/lib/settlement";
import type { ActionResult } from "./auth";

function parseWon(v: FormDataEntryValue | null): number | null {
  const t = (v ?? "").toString().replace(/[,\s원]/g, "").trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}

function strOrNull(fd: FormData, k: string): string | null {
  const v = (fd.get(k) ?? "").toString().trim();
  return v ? v : null;
}

async function isAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}

// 로그인 사용자가 "본인 댄서로서" 다룰 수 있는 dancer_id 집합 (profile_id = uid).
async function myDancerIds(userId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancers")
    .select("id")
    .eq("profile_id", userId);
  return new Set((data ?? []).map((d: { id: string }) => d.id as string));
}

// ── 매니저: 합격 댄서에게 세전 정산금액 등록/수정 ──────────────────────────
export async function setSettlementAmountAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const gross = parseWon(fd.get("gross_amount"));
  const memo = strOrNull(fd, "memo");
  if (!projectId || !dancerId)
    return { ok: false, error: "잘못된 요청입니다." };
  if (gross == null)
    return { ok: false, error: "정산금액(세전, 원)을 숫자로 입력해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("settlements")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .maybeSingle();

  if (existing?.status === "paid")
    return { ok: false, error: "이미 입금완료된 건은 금액을 수정할 수 없습니다." };

  let id: string;
  if (existing) {
    const { data, error } = await supabase
      .from("settlements")
      .update({ gross_amount: gross, memo })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  } else {
    const { data, error } = await supabase
      .from("settlements")
      .insert({
        project_id: projectId,
        dancer_id: dancerId,
        gross_amount: gross,
        withholding_rate: DEFAULT_WITHHOLDING_RATE,
        memo,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }

  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true, data: { id } };
}

// ── 댄서: 입금 계좌 등록/수정 (민감정보 → dancer_private_info) ──────────────
export async function savePayoutAccountAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const bank_name = strOrNull(fd, "bank_name");
  const bank_account_number = strOrNull(fd, "bank_account_number");
  const bank_account_holder = strOrNull(fd, "bank_account_holder");
  if (!dancerId) return { ok: false, error: "잘못된 요청입니다." };
  if (!bank_name || !bank_account_number || !bank_account_holder)
    return { ok: false, error: "은행·계좌번호·예금주를 모두 입력해 주세요." };

  // 본인 댄서 또는 슈퍼관리자(담당자가 사진 보고 대신 입력)만 허용.
  if (!(await isAdmin(user.id))) {
    const mine = await myDancerIds(user.id);
    if (!mine.has(dancerId))
      return { ok: false, error: "본인 댄서 프로필만 계좌를 등록할 수 있습니다." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const patch = { bank_name, bank_account_number, bank_account_holder };
  const { error } = existing
    ? await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)
    : await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch });
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/me/settlements");
  return { ok: true };
}

// ── 댄서: 출금 신청 (pending → requested). 계좌 등록 필수. ──────────────────
export async function requestWithdrawalAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("settlements")
    .select("id, dancer_id, status")
    .eq("id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };

  const mine = await myDancerIds(user.id);
  if (!mine.has(s.dancer_id as string))
    return { ok: false, error: "본인 정산 건만 출금 신청할 수 있습니다." };
  if (s.status === "paid")
    return { ok: false, error: "이미 입금완료된 건입니다." };
  if (s.status === "requested")
    return { ok: false, error: "이미 출금 신청한 건입니다." };
  if (s.status !== "pending")
    return { ok: false, error: "출금 신청할 수 없는 상태입니다." };

  // 계좌 등록 확인
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select("bank_name, bank_account_number, bank_account_holder")
    .eq("dancer_id", s.dancer_id)
    .maybeSingle();
  if (!pi?.bank_name || !pi?.bank_account_number || !pi?.bank_account_holder)
    return { ok: false, error: "먼저 입금 계좌를 등록해 주세요." };

  const { error } = await admin
    .from("settlements")
    .update({ status: "requested", requested_at: new Date().toISOString() })
    .eq("id", settlementId);
  if (error) return { ok: false, error: "신청에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}

// ── 관리자(담당자): 실제 통장 이체 후 '이체 완료 처리' (requested → paid) ────
// 앱은 금전을 직접 이체하지 않는다. 담당자가 통장에서 이체한 사실을 기록만 한다.
export async function markSettlementPaidAction(
  fd: FormData,
): Promise<ActionResult> {
  const admin_profile = await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("settlements")
    .select("id, status")
    .eq("id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };
  if (s.status === "paid")
    return { ok: false, error: "이미 입금완료 처리된 건입니다." };

  const { error } = await admin
    .from("settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: admin_profile.id,
    })
    .eq("id", settlementId);
  if (error) return { ok: false, error: "처리에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true };
}
