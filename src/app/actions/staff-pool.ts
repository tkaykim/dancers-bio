"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_WITHHOLDING_RATE, formatWon } from "@/lib/settlement";
import { canManagePool } from "@/lib/settlement-pool";
import {
  isPayeePayoutReady,
  normalizeBusinessNumber,
} from "@/lib/payout-validation";
import type { ActionResult } from "./auth";

// 스태프 정산 풀 전용 액션 — 설계 정본 docs/design-staff-settlement-pool.md §5~§6.
// 풀(수주액·유보)과 staff/referral 분배는 owner/admin 전용 영역이다(대표 결정 5·6).

const SITE = "https://deetz.kr";

const STAFF_ROLES = ["staff", "referral", "other"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

function parseWon(v: FormDataEntryValue | null): number | null {
  const t = (v ?? "").toString().replace(/[,\s원]/g, "").trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : null;
}

// ── 스태프·소개비 금액 등록/수정 (세무 스냅샷 포함) ─────────────────────────
export async function setStaffSettlementAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const role = (fd.get("role") ?? "").toString().trim() as StaffRole;
  const gross = parseWon(fd.get("gross_amount"));
  const vatInput = parseWon(fd.get("vat_amount"));
  const memo = (fd.get("memo") ?? "").toString().trim() || null;
  if (!projectId || !dancerId || !STAFF_ROLES.includes(role))
    return { ok: false, error: "잘못된 요청입니다." };
  if (gross == null || gross <= 0)
    return { ok: false, error: "금액(세전, 원)을 입력해 주세요." };
  if (!(await canManagePool(projectId, user.id)))
    return { ok: false, error: "풀 관리 권한이 없습니다." };

  const admin = createAdminClient();

  // 세무 스냅샷 = 수취인 프로필(§3.3). 프로필 없음 = withholding.
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select("payee_tax_mode")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const taxMode =
    (pi?.payee_tax_mode as string | null) === "invoice"
      ? "invoice"
      : "withholding";
  // 사업자: 부가세 포함 전달(대표 확정 2026-08-25). 기본 10%, 면세 업체는 0으로 수정 가능.
  const vat = taxMode === "invoice" ? (vatInput ?? Math.round(gross * 0.1)) : 0;
  const taxFields =
    taxMode === "invoice"
      ? { tax_mode: "invoice", withholding_rate: 0, vat_amount: vat }
      : {
          tax_mode: "withholding",
          withholding_rate: DEFAULT_WITHHOLDING_RATE,
          vat_amount: 0,
        };

  const { data: existing } = await admin
    .from("settlements")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .eq("role", role)
    .maybeSingle();

  if (existing && existing.status === "paid")
    return { ok: false, error: "이미 입금완료된 건은 수정할 수 없습니다." };
  if (existing && existing.status === "requested")
    return { ok: false, error: "출금 신청된 건은 수정할 수 없습니다." };

  let id: string;
  if (existing) {
    // 취소 건은 되살리며 값을 새로 확정한다(같은 role 재등록 정책, §3.2).
    const { data, error } = await admin
      .from("settlements")
      .update({ gross_amount: gross, memo, status: "pending", ...taxFields })
      .eq("id", existing.id)
      .in("status", ["pending", "cancelled"])
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data)
      return { ok: false, error: "상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요." };
    id = data.id as string;
  } else {
    const { data, error } = await admin
      .from("settlements")
      .insert({
        project_id: projectId,
        dancer_id: dancerId,
        role,
        gross_amount: gross,
        memo,
        origin: "manager",
        status: "pending",
        created_by: user.id,
        ...taxFields,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    id = data.id as string;
  }

  revalidatePath(`/admin/projects/${projectId}/pool`);
  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true, data: { id } };
}

// ── 일회성 수취인 생성 (엄태웅형 — 비활성·비공개, 이원영 전례 표준화 §3.9) ────
export async function createOneOffPayeeAction(
  fd: FormData,
): Promise<ActionResult<{ dancerId: string }>> {
  const adminProfile = await requireAdmin();
  const name = (fd.get("name") ?? "").toString().trim();
  const taxMode =
    (fd.get("tax_mode") ?? "").toString() === "invoice"
      ? "invoice"
      : "withholding";
  const brn = normalizeBusinessNumber(fd.get("business_registration_number"));
  if (!name) return { ok: false, error: "수취인 이름을 입력해 주세요." };
  if (taxMode === "invoice" && !brn)
    return { ok: false, error: "사업자 수취인은 사업자등록번호(숫자 10자리)가 필요합니다." };

  // dancers 행 생성은 로그인 관리자 클라이언트로 — dancers_guard_admin_fields 트리거가
  // auth.uid() 기준이라 service-role(auth.uid()=null)로 쓰면 관리 필드가 되돌려진다.
  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("dancers")
    .insert({ stage_name: name, is_active: false })
    .select("id")
    .single();
  if (error || !created)
    return { ok: false, error: "수취인 생성에 실패했습니다." };
  const dancerId = created.id as string;

  const admin = createAdminClient();
  const { error: piErr } = await admin.from("dancer_private_info").insert({
    dancer_id: dancerId,
    payee_tax_mode: taxMode,
    business_registration_number: brn,
  });
  if (piErr)
    return { ok: false, error: "수취인 세무정보 저장에 실패했습니다." };

  console.info(
    `[staff-pool] one-off payee created by ${adminProfile.id}: ${dancerId} (${taxMode})`,
  );
  return { ok: true, data: { dancerId } };
}

// ── 일회성 PII 수집 토큰 발급 (opaque·1회용·7일 만료, §3.7) ──────────────────
export async function issuePayeeCollectTokenAction(
  fd: FormData,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const adminProfile = await requireAdmin();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  if (!dancerId) return { ok: false, error: "잘못된 요청입니다." };

  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const admin = createAdminClient();
  // 기존 미사용 토큰은 회수 — 링크는 항상 최신 1개만 유효하다.
  await admin
    .from("payee_collect_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("dancer_id", dancerId)
    .is("used_at", null)
    .is("revoked_at", null);
  const { error } = await admin.from("payee_collect_tokens").insert({
    dancer_id: dancerId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: adminProfile.id,
  });
  if (error) return { ok: false, error: "토큰 발급에 실패했습니다." };

  return {
    ok: true,
    data: { url: `${SITE}/payee/${token}`, expiresAt },
  };
}

// ── 관리자 대리 출금 신청 (계정 없는 일회성 수취인용, §5.2) ──────────────────
// request_withdrawal RPC는 caller 검증이 없는 service-role 전용 함수(실측)라
// requireAdmin 게이트 서버액션에서 재사용한다. advisory lock·가용잔액 검증 동일.
export async function adminRequestWithdrawalAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const adminProfile = await requireAdmin();
  const parsed = z
    .object({
      dancerId: z.string().uuid(),
      amount: z.number().int().positive().max(1_000_000_000),
      reason: z.string().min(1).max(200),
    })
    .safeParse({
      dancerId: (fd.get("dancer_id") ?? "").toString().trim(),
      amount: Number(
        (fd.get("amount") ?? "").toString().replace(/[,\s원]/g, "").trim(),
      ),
      reason: (fd.get("reason") ?? "").toString().trim(),
    });
  if (!parsed.success)
    return { ok: false, error: "금액과 대리 사유를 확인해 주세요." };
  const { dancerId, amount, reason } = parsed.data;

  const admin = createAdminClient();
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select(
      "bank_name, bank_account_number, bank_account_holder, resident_registration_number, payee_tax_mode, business_registration_number",
    )
    .eq("dancer_id", dancerId)
    .maybeSingle();
  if (!isPayeePayoutReady(pi))
    return {
      ok: false,
      error:
        "지급정보가 완비되지 않았습니다(계좌 + 주민번호, 사업자는 사업자등록번호). 수집 링크로 먼저 받아 주세요.",
    };

  const { data, error } = await admin.rpc("request_withdrawal", {
    p_dancer_id: dancerId,
    p_amount: amount,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("INSUFFICIENT_BALANCE")) {
      const avail = msg.split("INSUFFICIENT_BALANCE:")[1]?.trim();
      return {
        ok: false,
        error: `출금 가능 금액을 초과했어요${avail ? ` (가능: ${formatWon(Number(avail))})` : ""}. 사업자 건은 세금계산서 수취 전까지 보류됩니다.`,
      };
    }
    return { ok: false, error: "대리 출금 신청에 실패했습니다." };
  }
  const requestId = data as string;

  // 대리 사유는 신청 직후 memo로 감사 기록(교차검증 합의 — 별도 RPC 신설 대신).
  await admin
    .from("withdrawal_requests")
    .update({ memo: `대리 신청(관리자 ${adminProfile.id}): ${reason}` })
    .eq("id", requestId);

  revalidatePath("/admin/settlements");
  return { ok: true, data: { id: requestId } };
}

// ── 사업자 건 세금계산서 수취 기록 (수취 전 = 출금가능잔액 보류, §5.3) ────────
export async function setTaxInvoiceReceivedAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  const received = (fd.get("received") ?? "").toString() === "true";
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settlements")
    .update({
      tax_invoice_received_at: received ? new Date().toISOString() : null,
    })
    .eq("id", settlementId)
    .eq("tax_mode", "invoice")
    .eq("status", "pending")
    .select("id, project_id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data)
    return { ok: false, error: "미지급 사업자 건에서만 기록할 수 있습니다." };

  revalidatePath(`/admin/projects/${data.project_id}/pool`);
  return { ok: true };
}

// ── Phase 1 게이트: 오너에게 풀 화면 개방 여부 (admin 전용 토글, §4.3) ────────
export async function setStaffPoolEnabledAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const enabled = (fd.get("enabled") ?? "").toString() === "true";
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { error } = await admin.from("project_finances").upsert(
    {
      project_id: projectId,
      staff_pool_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/projects/${projectId}/pool`);
  return { ok: true };
}

// ── 수취인 검색 (풀 화면 전용 — 비활성·미승인 포함) ─────────────────────────
export async function searchPayeesAction(
  projectId: string,
  q: string,
): Promise<
  ActionResult<{
    payees: Array<{
      id: string;
      name: string;
      taxMode: string;
      payoutReady: boolean;
      hasAccount: boolean;
    }>;
  }>
> {
  const user = await requireUser();
  if (!(await canManagePool(projectId, user.id)))
    return { ok: false, error: "풀 관리 권한이 없습니다." };
  const query = q.trim();
  if (query.length < 1) return { ok: true, data: { payees: [] } };

  const admin = createAdminClient();
  const { data: dRows } = await admin
    .from("dancers")
    .select("id, stage_name, korean_name, profile_id")
    .or(`stage_name.ilike.%${query}%,korean_name.ilike.%${query}%`)
    .limit(12);
  const ids = (dRows ?? []).map((d) => d.id as string);
  const { data: piRows } = ids.length
    ? await admin
        .from("dancer_private_info")
        .select(
          "dancer_id, bank_name, bank_account_number, bank_account_holder, resident_registration_number, payee_tax_mode, business_registration_number",
        )
        .in("dancer_id", ids)
    : { data: [] };
  const piById = new Map(
    ((piRows ?? []) as Array<{ dancer_id: string }>).map((p) => [
      p.dancer_id,
      p,
    ]),
  );

  return {
    ok: true,
    data: {
      payees: (dRows ?? []).map((d) => {
        const pi = piById.get(d.id as string) as
          | (Parameters<typeof isPayeePayoutReady>[0] & {
              payee_tax_mode?: string | null;
            })
          | undefined;
        return {
          id: d.id as string,
          name:
            ((d.korean_name as string | null)?.trim() ||
              (d.stage_name as string | null)?.trim()) ??
            "수취인",
          taxMode: (pi?.payee_tax_mode as string | null) ?? "withholding",
          payoutReady: isPayeePayoutReady(pi ?? null),
          hasAccount: !!d.profile_id,
        };
      }),
    },
  };
}
