"use server";

import * as XLSX from "xlsx";
import { matchBank } from "@/lib/banks";
import { revalidatePath } from "next/cache";
import { canManageProject, requireAdmin, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_WITHHOLDING_RATE,
  calcPayout,
  calcSettlement,
  formatMoney,
  formatWon,
  type SettlementRole,
} from "@/lib/settlement";
import { sendGmailEmail } from "@/lib/gmail";
import { buildWithdrawalRequestEmail } from "@/lib/notify/settlement-mail";
import { projectLocale } from "@/lib/i18n/project-locale";
import { notify } from "@/lib/notify";
import {
  isPayoutInfoComplete,
  isResidentNumberValid,
  normalizeResidentNumber,
} from "@/lib/payout-validation";
import {
  sendSettlementConfirmedAlimtalk,
  sendSettlementPaidAlimtalk,
  sendSettlementInfoRequiredAlimtalk,
} from "@/lib/alimtalk/dancer-events";
import { z } from "zod";
import type { ActionResult } from "./auth";

const SITE = "https://deetz.kr";

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

// 보내는분 통장표시 메모: 우리 통장에 찍힐 식별 문구(댄서+프로젝트).
// 통장표시는 길이 제한이 있어, 댄서명을 먼저 보존하고 프로젝트명은 남는 길이만큼만.
function transferMemo(dancer: string, project: string): string {
  const MAX = 14;
  const d = (dancer ?? "").replace(/\s/g, "");
  const p = (project ?? "").replace(/\s/g, "");
  const room = Math.max(0, MAX - d.length);
  return (d.slice(0, MAX) + p.slice(0, room)).slice(0, MAX);
}

// 파일명 타임스탬프 (KST yyyyMMdd_HHmm).
function kstStamp(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}${g("month")}${g("day")}_${g("hour")}${g("minute")}`;
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

// 정산행의 실제 이체 금액(현금 기준). withholding=세전−3.3% / invoice=세전+부가세.
function transferAmountOf(s: {
  gross_amount: number | null;
  withholding_rate: number | string;
  tax_mode?: string | null;
  vat_amount?: number | null;
}): number {
  return calcPayout({
    gross: (s.gross_amount as number) ?? 0,
    rate: Number(s.withholding_rate),
    taxMode: (s.tax_mode as string | null) ?? "withholding",
    vatAmount: (s.vat_amount as number | null) ?? 0,
  }).transfer;
}

// fd의 role 값 검증 — 알 수 없는 값은 기본 'dancer'로 취급하지 않고 거부한다.
const SETTLEMENT_ROLES: readonly SettlementRole[] = [
  "dancer",
  "travel",
  "staff",
  "referral",
  "other",
];
function parseRole(v: FormDataEntryValue | null): SettlementRole | null {
  const t = (v ?? "").toString().trim();
  if (!t) return "dancer";
  return (SETTLEMENT_ROLES as readonly string[]).includes(t)
    ? (t as SettlementRole)
    : null;
}

// (구) notifyAdminsWithdrawalRequested — 정산 건별 출금신청과 함께 제거.
// 잔액 출금의 관리자 알림은 actions/withdrawals.ts가 보낸다.

// 댄서에게 정산완료/입금완료 알림 (인앱 + 웹푸시 + 알림톡). 비치명적.
// 정산 정보(계좌 3종 + 주민/외국인등록번호) 완비 여부.
async function settlementInfoComplete(
  admin: ReturnType<typeof createAdminClient>,
  dancerId: string,
): Promise<boolean> {
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select(
      "bank_name, bank_account_number, bank_account_holder, resident_registration_number",
    )
    .eq("dancer_id", dancerId)
    .maybeSingle();
  return isPayoutInfoComplete(pi);
}

async function notifyDancerSettlement(
  settlementId: string,
  kind: "confirmed" | "paid" | "info_required",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: s } = await admin
      .from("settlements")
      .select("dancer_id, project_id, gross_amount, withholding_rate, tax_mode, vat_amount")
      .eq("id", settlementId)
      .maybeSingle();
    if (!s) return;
    const dancerId = s.dancer_id as string;

    const [{ data: d }, { data: p }] = await Promise.all([
      admin
        .from("dancers")
        .select("stage_name, profile_id")
        .eq("id", dancerId)
        .maybeSingle(),
      admin.from("projects").select("title").eq("id", s.project_id).maybeSingle(),
    ]);
    const title = (p?.title as string) ?? "프로젝트";
    const net = transferAmountOf(s);
    const netText = formatWon(net);
    const url = "/me/settlements";

    // 정산완료인데 정산정보(계좌·주민번호) 미비 → '정보 입력 요청'으로 전환.
    let effective = kind;
    if (kind === "confirmed" && !(await settlementInfoComplete(admin, dancerId))) {
      effective = "info_required";
    }

    // 인앱/푸시 수신자 = 댄서 계정(지원 계정 우선 → 클레임 계정).
    const { data: app } = await admin
      .from("applications")
      .select("applicant_id")
      .eq("project_id", s.project_id)
      .eq("dancer_id", dancerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const accountId =
      (app?.applicant_id as string | null) ?? (d?.profile_id as string | null);

    const notif =
      effective === "paid"
        ? {
            type: "settlement_paid" as const,
            push: {
              title: "입금 완료",
              body: `'${title}' 정산금 ${netText}이 입금 완료됐어요.`,
              url,
            },
          }
        : effective === "info_required"
          ? {
              type: "settlement_info_required" as const,
              push: {
                title: "정산정보 입력 요청",
                body: `'${title}' 정산을 받으려면 계좌·정산정보를 입력해 주세요.`,
                url,
              },
            }
          : {
              type: "settlement_confirmed" as const,
              push: {
                title: "정산 금액 확정",
                body: `'${title}' 정산금 ${netText}이 확정됐어요. 출금 신청분은 매주 금요일에 입금돼요.`,
                url,
              },
            };

    if (accountId) {
      await notify({
        recipientId: accountId,
        type: notif.type,
        payload: {
          kind: effective,
          settlement_id: settlementId,
          project_title: title,
          net_amount: net,
          url,
        },
        push: notif.push,
      });
    }

    if (effective === "paid") {
      await sendSettlementPaidAlimtalk({
        dancerId,
        settlementId,
        projectTitle: title,
        netText,
      });
    } else if (effective === "info_required") {
      await sendSettlementInfoRequiredAlimtalk({
        dancerId,
        settlementId,
        projectTitle: title,
      });
    } else {
      await sendSettlementConfirmedAlimtalk({
        dancerId,
        settlementId,
        projectTitle: title,
        netText,
      });
    }
  } catch (err) {
    console.error("[notifyDancerSettlement] failed (non-fatal):", err);
  }
}

// ── 매니저: 합격 댄서에게 세전 정산금액 등록/수정 ──────────────────────────
export async function setSettlementAmountAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  // 겸직(한 사람이 출연료+스태프비) 도입 후 (project, dancer)만으로는 행이 특정되지 않는다.
  // 기존 행 수정은 settlement_id로, 신규 생성은 (project, dancer, role)로 특정한다.
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  const role = parseRole(fd.get("role"));
  const gross = parseWon(fd.get("gross_amount"));
  const memo = strOrNull(fd, "memo");
  if (!projectId || (!dancerId && !settlementId) || !role)
    return { ok: false, error: "잘못된 요청입니다." };
  if (gross == null)
    return { ok: false, error: "정산금액(세전, 원)을 숫자로 입력해 주세요." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  const supabase = await createClient();
  let existingQuery = supabase
    .from("settlements")
    .select("id, status, gross_amount, role")
    .eq("project_id", projectId);
  existingQuery = settlementId
    ? existingQuery.eq("id", settlementId)
    : existingQuery.eq("dancer_id", dancerId).eq("role", role);
  const { data: existing } = await existingQuery.maybeSingle();
  if (settlementId && !existing)
    return { ok: false, error: "정산 내역을 찾을 수 없습니다." };

  // 매니저 경로는 직접비 role만 — 스태프·소개비 금액은 관리자 전용(설계 §4.3).
  const effectiveRole = (existing?.role as string | undefined) ?? role;
  if (effectiveRole !== "dancer" && effectiveRole !== "travel") {
    if (!(await isAdmin(user.id)))
      return { ok: false, error: "스태프·소개비 금액은 관리자만 입력할 수 있습니다." };
  }

  // 금액 잠금: 입금완료뿐 아니라 출금신청·취소 건도 여기서 바꿀 수 없다.
  // 댄서가 신청 시점에 본 금액과 실제 이체 금액이 달라지는 것을 막는다.
  // 변경이 필요하면 관리자가 정산 취소 후 다시 등록한다.
  if (existing?.status === "paid")
    return { ok: false, error: "이미 입금완료된 건은 금액을 수정할 수 없습니다." };
  if (existing?.status === "requested")
    return {
      ok: false,
      error:
        "댄서가 이미 출금 신청한 건이라 금액을 수정할 수 없습니다. 정산을 취소한 뒤 다시 등록해 주세요.",
    };
  if (existing?.status === "cancelled")
    return {
      ok: false,
      error: "취소된 정산 건입니다. 새로 등록해 주세요.",
    };

  // 금액이 처음 정해졌거나 달라졌을 때만 댄서에게 알린다(같은 값 재저장은 조용히).
  const shouldNotify =
    !existing || (existing.gross_amount as number | null) !== gross;
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
        role,
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

  // 금액이 확정되면 댄서가 바로 알 수 있게 알림을 보낸다.
  // 이게 없으면 댄서는 자기 금액이 정해진 걸 모르고 출금 신청을 하지 않는다.
  // (알림 실패는 비치명적 — 금액 저장 자체는 성공으로 돌려준다)
  if (shouldNotify) await notifyDancerSettlement(id, "confirmed");
  // 금액이 확정되면 그 순간부터 댄서의 잔액이다(세후 기준, 멱등).

  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath(`/projects/${projectId}/settlements`);
  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true, data: { id } };
}

/**
 * 여러 댄서의 정산 금액을 한 번에 저장한다.
 *
 * 단건 저장은 매번 화면을 새로 그려서, 7명짜리 프로젝트에서 나머지 입력칸이 비워지는
 * 마찰이 있었다(실제 E2E에서 재차 입력 발생). 입력을 모아 한 번에 보내고 새로고침도
 * 한 번만 하도록 한다.
 *
 * 상태 가드는 단건과 동일하게 행마다 적용하고, 일부가 막혀도 나머지는 저장한 뒤
 * 실패 건만 돌려준다(전부 롤백하면 오히려 다시 입력해야 한다).
 */
// 행 특정은 settlement id 기준 — 겸직 도입 후 (project, dancer)는 유일키가 아니다.
const bulkEntriesSchema = z
  .array(
    z.object({
      settlementId: z.string().uuid(),
      amount: z.string().max(20),
    }),
  )
  .min(1)
  .max(200);

export async function setSettlementAmountsBulkAction(
  fd: FormData,
): Promise<
  ActionResult<{
    saved: number;
    failures: Array<{ settlementId: string; error: string }>;
  }>
> {
  await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const raw = (fd.get("entries") ?? "").toString();
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };
  // 요청 본문 크기 상한 — 200건 × 넉넉한 여유.
  if (raw.length > 20_000) return { ok: false, error: "요청이 너무 큽니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const check = bulkEntriesSchema.safeParse(parsed);
  if (!check.success) return { ok: false, error: "잘못된 요청입니다." };
  const entries = check.data;

  // 같은 행이 두 번 들어오면 어느 금액이 맞는지 알 수 없으므로 요청 자체를 거부한다.
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.settlementId))
      return { ok: false, error: "같은 정산 건이 중복으로 들어왔습니다." };
    seen.add(e.settlementId);
  }

  const supabase = await createClient();
  const failures: Array<{ settlementId: string; error: string }> = [];
  const notifyIds: string[] = [];
  let saved = 0;

  // 콘솔 목록의 기존 행만 대상으로 한다 — id 특정이라 겸직(복수 role)에서도 오행 수정이 없다.
  const { data: rowsData, error: readErr } = await supabase
    .from("settlements")
    .select("id, status, gross_amount")
    .eq("project_id", projectId)
    .in("id", entries.map((e) => e.settlementId));
  if (readErr) return { ok: false, error: "조회에 실패했습니다." };
  const rowById = new Map(
    ((rowsData ?? []) as Array<{ id: string; status: string; gross_amount: number | null }>).map(
      (r) => [r.id, r],
    ),
  );

  for (const e of entries) {
    const settlementId = e.settlementId;
    const gross = parseWon(e.amount);
    if (gross == null || gross <= 0) {
      failures.push({ settlementId, error: "금액을 1원 이상으로 입력해 주세요." });
      continue;
    }

    const existing = rowById.get(settlementId);
    if (!existing) {
      failures.push({ settlementId, error: "정산 내역을 찾을 수 없습니다." });
      continue;
    }

    // 단건 저장과 같은 잠금 규칙 — 댄서가 본 금액이 뒤에서 바뀌지 않게.
    if (existing.status === "paid") {
      failures.push({ settlementId, error: "이미 입금완료된 건입니다." });
      continue;
    }
    if (existing.status === "requested") {
      failures.push({ settlementId, error: "이미 출금 신청한 건입니다." });
      continue;
    }
    if (existing.status === "cancelled") {
      failures.push({ settlementId, error: "취소된 정산 건입니다." });
      continue;
    }

    const changed = (existing.gross_amount as number | null) !== gross;
    // status 조건을 UPDATE에 함께 걸어, 조회와 저장 사이에 댄서가 출금 신청해도
    // 그 건을 덮어쓰지 않게 한다(0행 반환 → 실패로 처리).
    const { data: updated, error } = await supabase
      .from("settlements")
      .update({ gross_amount: gross })
      .eq("id", settlementId)
      .eq("status", "pending")
      .select("id");
    if (error) {
      failures.push({ settlementId, error: error.message });
      continue;
    }
    if (!updated || updated.length === 0) {
      failures.push({
        settlementId,
        error: "저장 중 상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.",
      });
      continue;
    }
    if (changed) notifyIds.push(settlementId);
    saved += 1;
  }

  // 금액이 실제로 바뀐 건만 알린다(같은 값 재저장은 조용히).
  // 알림은 저장과 분리해 실패해도 저장 결과를 되돌리지 않는다. 다만 200건을 한꺼번에
  // 밀지 않도록 소규모 동시 실행으로 끊어 보낸다.
  const CONCURRENCY = 4;
  for (let i = 0; i < notifyIds.length; i += CONCURRENCY) {
    const chunk = notifyIds.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((id) => notifyDancerSettlement(id, "confirmed")));
  }

  revalidatePath(`/projects/${projectId}/settlements`);
  revalidatePath(`/projects/${projectId}/applicants`);
  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true, data: { saved, failures } };
}

/**
 * 안무가가 정산 대상 댄서를 직접 명단에 올린다.
 *
 * 이미 구두·SNS로 섭외를 끝내고 프로젝트도 끝난 뒤 "정산만 기입"하는 경우를 위한 경로다.
 * 캐스팅 제안→수락 루프를 거치지 않고 바로 정산 대상이 된다.
 * 금액은 여기서 받지 않는다 — 수집링크로 들어온 건과 같은 "금액 미입력" 상태로 명단에
 * 올려두고, 안무가가 같은 화면에서 금액을 채우게 해 입력 지점을 하나로 유지한다.
 * 계좌·주민번호는 법적으로 본인만 넣을 수 있으므로 댄서에게 등록 요청 알림을 보낸다.
 */
export async function addSettlementDancerAction(
  fd: FormData,
): Promise<ActionResult<{ id: string; created: boolean }>> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const role = parseRole(fd.get("role"));
  if (!projectId || !dancerId || !role)
    return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };
  // 매니저 경로는 직접비 role만 다룬다 — staff/referral 등록은 admin 풀 화면 전용(§4.3).
  if (role !== "dancer" && role !== "travel") {
    const { data: me } = await createAdminClient()
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (me?.is_admin !== true)
      return { ok: false, error: "스태프·소개비 등록은 관리자만 할 수 있습니다." };
  }

  const admin = createAdminClient();
  const { data: dancer } = await admin
    .from("dancers")
    .select("id")
    .eq("id", dancerId)
    .maybeSingle();
  if (!dancer) return { ok: false, error: "댄서를 찾을 수 없습니다." };

  // 이미 같은 role로 명단에 있으면 중복 생성하지 않는다(취소된 건은 되살린다).
  const { data: existing } = await admin
    .from("settlements")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .eq("role", role)
    .maybeSingle();

  if (existing) {
    if (existing.status !== "cancelled")
      return { ok: true, data: { id: existing.id as string, created: false } };
    const { error } = await admin
      .from("settlements")
      .update({ status: "pending" })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/projects/${projectId}/settlements`);
    return { ok: true, data: { id: existing.id as string, created: false } };
  }

  const { data, error } = await admin
    .from("settlements")
    .insert({
      project_id: projectId,
      dancer_id: dancerId,
      role,
      gross_amount: null,
      withholding_rate: DEFAULT_WITHHOLDING_RATE,
      origin: "manager",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  const id = data.id as string;

  // 계좌·주민번호는 본인만 등록할 수 있으므로 바로 요청 알림을 보낸다.
  // (계정이 없는 댄서면 알림 대상이 없어 조용히 지나간다 — 이 경우 안무가가 수집링크를 직접 전달)
  await notifyDancerSettlement(id, "info_required");

  revalidatePath(`/projects/${projectId}/settlements`);
  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true, data: { id, created: true } };
}

// ── 댄서: 입금 계좌 등록/수정 (민감정보 → dancer_private_info) ──────────────
export async function savePayoutAccountAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const bank_name = strOrNull(fd, "bank_name");
  const bank_code = strOrNull(fd, "bank_code");
  // 계좌번호는 하이픈·공백 제거(대량이체 파일은 숫자만).
  const bank_account_number = (fd.get("bank_account_number") ?? "")
    .toString()
    .replace(/[\s-]/g, "")
    .trim() || null;
  const bank_account_holder = strOrNull(fd, "bank_account_holder");
  if (!dancerId) return { ok: false, error: "잘못된 요청입니다." };
  if (!bank_name || !bank_account_number || !bank_account_holder)
    return { ok: false, error: "은행·계좌번호·예금주를 모두 입력해 주세요." };
  if (!/^[0-9]{8,20}$/.test(bank_account_number))
    return { ok: false, error: "계좌번호는 숫자 8~20자리로 입력해 주세요." };

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
  const patch = { bank_name, bank_code, bank_account_number, bank_account_holder };
  const { error } = existing
    ? await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)
    : await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch });
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}

// ── 관리자: 출금신청 안내 메일 발송 (정산완료 → 댄서에게 신청 요청) ─────────
export async function sendWithdrawalRequestEmailAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: s } = await admin
    .from("settlements")
    .select(
      "id, project_id, dancer_id, gross_amount, withholding_rate, tax_mode, status, project:projects!settlements_project_id_fkey ( title )",
    )
    .eq("id", settlementId)
    .maybeSingle();
  if (!s) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };
  if (s.status !== "pending")
    return { ok: false, error: "정산 확정(출금신청 전) 건만 안내를 보낼 수 있어요." };
  // 사업자(invoice) 건은 3.3% 안내 메일 문안이 맞지 않는다 — 별도 커뮤니케이션으로.
  if ((s.tax_mode as string) === "invoice")
    return { ok: false, error: "사업자(세금계산서) 건은 이 안내 메일 대상이 아닙니다." };

  const proj = Array.isArray(s.project) ? s.project[0] ?? null : s.project;
  const projectTitle = (proj?.title as string) ?? "프로젝트";

  // 댄서 정보 + 수신 이메일 (지원 계정 우선 → private_info → 클레임 계정)
  const { data: d } = await admin
    .from("dancers")
    .select("stage_name, profile_id")
    .eq("id", s.dancer_id)
    .maybeSingle();
  const name = (d?.stage_name as string) ?? "댄서";

  let email: string | null = null;
  const { data: app } = await admin
    .from("applications")
    .select("applicant_id")
    .eq("project_id", s.project_id)
    .eq("dancer_id", s.dancer_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const acctId = (app?.applicant_id as string | null) ?? (d?.profile_id as string | null);
  if (acctId) {
    const { data: u } = await admin.auth.admin.getUserById(acctId);
    email = u?.user?.email ?? null;
  }
  if (!email) {
    const { data: pi } = await admin
      .from("dancer_private_info")
      .select("email")
      .eq("dancer_id", s.dancer_id)
      .maybeSingle();
    email = (pi?.email as string | null) ?? null;
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email) || /\.con$/i.test(email))
    return { ok: false, error: "댄서의 이메일을 찾을 수 없어요. 계정/연락처를 확인해 주세요." };

  const calc = calcSettlement(
    s.gross_amount as number,
    Number(s.withholding_rate),
  );
  // 영문 공고면 정산 대상도 외국인이다 — 안내와 금액 표기를 공고 언어로 맞춘다.
  const mailLocale = await projectLocale(s.project_id as string);
  const mail = buildWithdrawalRequestEmail({
    name,
    projectTitle,
    grossText: formatMoney(calc.gross, mailLocale),
    taxText: formatMoney(calc.tax, mailLocale),
    netText: formatMoney(calc.net, mailLocale),
    url: `${SITE}/me/settlements`,
    locale: mailLocale,
  });
  const r = await sendGmailEmail({ to: email, ...mail });
  if (!r.ok) return { ok: false, error: "메일 발송에 실패했습니다." };

  // 정산완료(금액확정) 알림 — 인앱 + 웹푸시 + 알림톡(게이트).
  await notifyDancerSettlement(settlementId, "confirmed");
  return { ok: true };
}

// ── 주민등록번호(외국인등록번호) 저장 (슈퍼관리자 또는 본인) ───────────────
export async function saveResidentNumberAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const rrn = normalizeResidentNumber(fd.get("resident_registration_number"));
  if (!dancerId) return { ok: false, error: "잘못된 요청입니다." };
  if (!rrn || !isResidentNumberValid(rrn))
    return { ok: false, error: "유효한 주민(외국인)등록번호를 입력해 주세요." };

  if (!(await isAdmin(user.id))) {
    const mine = await myDancerIds(user.id);
    if (!mine.has(dancerId))
      return { ok: false, error: "권한이 없습니다." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("dancer_private_info")
    .select("dancer_id")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const patch = {
    resident_registration_number: `${rrn.slice(0, 6)}-${rrn.slice(6)}`,
  };
  const { error } = existing
    ? await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)
    : await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch });
  if (error) return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true };
}

// ⛔ 정산 건별 출금(requestWithdrawalAction)은 잔액 출금으로 일원화되며 제거됨.
// 두 경로를 함께 열면 같은 돈이 두 번 지급될 수 있고, DB도 신규 requested
// 진입을 봉인한다(LEGACY_WITHDRAWAL_CLOSED). 부활 금지 — 출금은
// requestPartialWithdrawalAction(잔액) 단일 경로다.

// ── 관리자: 미지급 정산 취소 (pending/requested → cancelled) ──────────────
// 테스트 제출·중복·지급 대상 아님을 확인한 건을 대기열에서 제외한다.
// 입금완료 건은 장부 정합성을 위해 이 액션으로 취소할 수 없다.
export async function cancelSettlementAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: settlement } = await admin
    .from("settlements")
    .select("id, project_id, status")
    .eq("id", settlementId)
    .maybeSingle();
  if (!settlement) return { ok: false, error: "정산 내역을 찾을 수 없습니다." };
  if (settlement.status === "paid")
    return { ok: false, error: "입금완료된 건은 취소할 수 없습니다." };
  if (settlement.status === "cancelled")
    return { ok: false, error: "이미 취소된 정산입니다." };

  const { data: updated, error } = await admin
    .from("settlements")
    .update({ status: "cancelled" })
    .eq("id", settlementId)
    .eq("status", settlement.status)
    .select("id")
    .maybeSingle();
  if (error)
    return { ok: false, error: "취소 처리에 실패했습니다. 다시 시도해 주세요." };
  if (!updated)
    return { ok: false, error: "상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요." };

  // 취소된 정산은 잔액에서도 빠져야 한다.

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  revalidatePath(`/projects/${settlement.project_id}/settlements`);
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
  if (s.status !== "requested")
    return { ok: false, error: "출금신청이 완료된 건만 입금완료 처리할 수 있습니다." };

  const { data: updated, error } = await admin
    .from("settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: admin_profile.id,
    })
    .eq("id", settlementId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "처리에 실패했습니다. 다시 시도해 주세요." };
  if (!updated)
    return { ok: false, error: "상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요." };

  // 입금완료 알림 — 인앱 + 웹푸시 + 알림톡(게이트).
  await notifyDancerSettlement(settlementId, "paid");

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true };
}

// ── 관리자: 여러 건 일괄 입금완료 처리 ─────────────────────────────────────
export async function markSettlementsPaidAction(
  fd: FormData,
): Promise<ActionResult<{ updated: number }>> {
  const admin_profile = await requireAdmin();
  let ids: string[] = [];
  try {
    const p = JSON.parse((fd.get("ids") ?? "[]").toString());
    if (Array.isArray(p)) ids = p.filter((x) => typeof x === "string");
  } catch {
    ids = [];
  }
  if (ids.length === 0) return { ok: false, error: "선택된 건이 없습니다." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: admin_profile.id,
    })
    .in("id", ids)
    .eq("status", "requested")
    .select("id");
  if (error) return { ok: false, error: "처리에 실패했습니다. 다시 시도해 주세요." };

  // 입금완료 알림 — 실제로 paid 전환된 건만 (인앱 + 웹푸시 + 알림톡 게이트).
  for (const row of (data ?? []) as Array<{ id: string }>) {
    await notifyDancerSettlement(row.id as string, "paid");
  }

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true, data: { updated: (data ?? []).length } };
}

// ── 관리자: 정산정보(계좌·주민번호) 미기입 댄서에게 입력 요청 알림 발송 ────────
// 정산금은 확정됐으나 정산정보가 없어 지급 불가한 댄서에게 "정보 입력" 독려.
export async function requestSettlementInfoAction(
  fd: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const settlementId = (fd.get("settlement_id") ?? "").toString().trim();
  if (!settlementId) return { ok: false, error: "잘못된 요청입니다." };
  await notifyDancerSettlement(settlementId, "info_required");
  return { ok: true };
}

// ── 관리자: 선택한 정산 건 → 우리은행 '다계좌이체' 업로드 파일(.xls) 생성 ─────
// [GRIGO] 다계좌이체양식.xls 와 동일한 6열 구조(헤더 없음):
//   A 입금은행 / B 입금계좌번호 / C 이체금액(실수령) / D 보내는분 통장표시 / E 받는분 통장표시 / F 집금(CMS)번호
// 실제 이체는 사람이 우리WON비즈에 업로드 → OTP 승인. 이 액션은 파일만 만든다(돈 안 나감).
export async function buildTransferFileAction(
  fd: FormData,
): Promise<
  ActionResult<{
    filename: string;
    base64: string;
    included: number;
    skipped: number;
  }>
> {
  await requireAdmin();
  let ids: string[] = [];
  try {
    const p = JSON.parse((fd.get("ids") ?? "[]").toString());
    if (Array.isArray(p)) ids = p.filter((x) => typeof x === "string");
  } catch {
    ids = [];
  }
  if (ids.length === 0) return { ok: false, error: "선택된 건이 없습니다." };

  const admin = createAdminClient();
  const { data: sRows } = await admin
    .from("settlements")
    .select(
      "id, dancer_id, gross_amount, withholding_rate, tax_mode, vat_amount, tax_invoice_received_at, status, project:projects!settlements_project_id_fkey ( title )",
    )
    .in("id", ids);
  if (!sRows || sRows.length === 0)
    return { ok: false, error: "정산 내역을 찾을 수 없습니다." };

  const dancerIds = [...new Set(sRows.map((r) => r.dancer_id as string))];
  const [{ data: dRows }, { data: piRows }] = await Promise.all([
    admin
      .from("dancers")
      .select("id, stage_name, korean_name")
      .in("id", dancerIds),
    admin
      .from("dancer_private_info")
      .select(
        "dancer_id, bank_name, bank_account_number, bank_account_holder, resident_registration_number",
      )
      .in("dancer_id", dancerIds),
  ]);
  const nameById = new Map(
    (dRows ?? []).map((d) => [
      d.id as string,
      (d.korean_name as string | null)?.trim() ||
        (d.stage_name as string | null)?.trim() ||
        "",
    ]),
  );
  const acctById = new Map(
    (piRows ?? []).map((p) => [p.dancer_id as string, p]),
  );

  const rowById = new Map((sRows ?? []).map((row) => [row.id as string, row]));
  const rows: (string | number)[][] = [];
  let skipped = 0;
  for (const id of ids) {
    const s = rowById.get(id);
    if (!s) {
      skipped++;
      continue;
    }
    if (s.status !== "requested") {
      skipped++;
      continue;
    }
    // 셀프 수집 직후 등 금액 미입력(null/0) 건은 이체 대상에서 제외.
    if (s.gross_amount == null || (s.gross_amount as number) <= 0) {
      skipped++;
      continue;
    }
    // 사업자(invoice) 건은 세금계산서를 받은 뒤에만 이체한다(부가세 포함 전달).
    if (
      (s.tax_mode as string) === "invoice" &&
      !s.tax_invoice_received_at
    ) {
      skipped++;
      continue;
    }
    const acct = acctById.get(s.dancer_id as string);
    const accountNumber = (acct?.bank_account_number ?? "")
      .toString()
      .replace(/[\s-]/g, "");
    if (!acct || !isPayoutInfoComplete(acct)) {
      skipped++;
      continue;
    }
    const net = transferAmountOf(s);
    const proj = Array.isArray(s.project) ? s.project[0] ?? null : s.project;
    const projectTitle = (proj?.title as string) ?? "";
    const dancerName = nameById.get(s.dancer_id as string) ?? "";
    // 앱 표시명("농협은행")을 그대로 넣으면 은행에서 반려된다 — 업로드 양식 표기("농협")로 정규화.
    const bank =
      matchBank(acct.bank_name as string)?.transfer ?? (acct.bank_name as string);
    rows.push([
      bank, // A 입금은행
      accountNumber, // B 입금계좌번호 (숫자만, 문자열 — 앞 0 보존)
      net, // C 이체금액 = 실수령액(세전−3.3%)
      transferMemo(dancerName, projectTitle), // D 보내는분 통장표시
      "", // E 받는분 통장표시
      "", // F 집금(CMS)번호
    ]);
  }
  if (rows.length === 0)
    return {
      ok: false,
      error: "이체할 수 있는 건이 없어요(출금신청·계좌·주민번호 상태를 확인해 주세요).",
    };

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const base64 = XLSX.write(wb, { type: "base64", bookType: "biff8" });

  return {
    ok: true,
    data: {
      filename: `deetz_다계좌이체_${kstStamp()}.xls`,
      base64,
      included: rows.length,
      skipped,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
//  구글폼 흡수 = 댄서 지급정보 셀프 수집 (멀티테넌트 정산 MVP)
//  - 소유자(안무가/팀)가 프로젝트에 "정산 수집 링크" 발급 → /settle/<code>
//  - 댄서가 로그인해 본인 계좌·주민번호 셀프 제출 → settlements 행 보장(금액 미정)
//  - 소유자가 콘솔에서 댄서별 금액(gross) 입력 = 기존 setSettlementAmountAction 재사용
// ════════════════════════════════════════════════════════════════════════

// ── 소유자: 정산 수집 링크 발급/마감 (canManageProject) ─────────────────────
export async function setSettlementCollectionAction(
  fd: FormData,
): Promise<ActionResult<{ code: string; open: boolean }>> {
  await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const open = (fd.get("open") ?? "").toString() === "true";
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };
  if (!(await canManageProject(projectId)))
    return { ok: false, error: "권한이 없습니다." };

  // 수집 코드는 공개 projects 컬럼이 아니라 비공개 테이블에 둔다(열거 차단, 설계 §3.6).
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("project_settlement_collections")
    .select("collect_code")
    .eq("project_id", projectId)
    .maybeSingle();
  let code = (existing?.collect_code as string | null) ?? null;
  if (!code) {
    const { data: gen } = await admin.rpc(
      "gen_project_settlement_collect_code",
    );
    code = (gen as string | null) ?? null;
    if (!code) return { ok: false, error: "코드 생성에 실패했습니다." };
  }
  const { error } = await admin
    .from("project_settlement_collections")
    .upsert(
      { project_id: projectId, collect_code: code, collection_open: open },
      { onConflict: "project_id" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/settlements`);
  return { ok: true, data: { code, open } };
}

// ── 재무(수주액·실비) 저장 — 프로젝트 owner 또는 admin만 (공동관리자 제외, §4.3) ──
// 값은 공개 projects 컬럼이 아니라 project_finances(RLS owner/admin)에 저장한다.
// service-role이 아닌 사용자 클라이언트로 써서 RLS가 2차 방어선이 되게 한다.
export async function setProjectFinanceAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const projectId = (fd.get("project_id") ?? "").toString().trim();
  const revenue = parseWon(fd.get("client_revenue"));
  const expense = parseWon(fd.get("expense_amount"));
  if (!projectId) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: proj } = await admin
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj) return { ok: false, error: "프로젝트를 찾을 수 없습니다." };
  if ((proj.owner_id as string) !== user.id && !(await isAdmin(user.id)))
    return { ok: false, error: "수주액·실비는 프로젝트 소유자 또는 관리자만 수정할 수 있습니다." };

  const supabase = await createClient();
  const { error } = await supabase.from("project_finances").upsert(
    {
      project_id: projectId,
      client_revenue: revenue,
      expense_amount: expense ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/projects/${projectId}/settlements`);
  revalidatePath(`/admin/projects/${projectId}/pool`);
  return { ok: true };
}

// ── 댄서: 수집 링크로 지급정보 셀프 제출 (계좌+주민번호 → settlements 행 보장) ──
// 금액은 댄서가 정하지 않는다 — 소유자(안무가)가 콘솔에서 후기입.
export async function submitSettlementCollectionAction(
  fd: FormData,
): Promise<ActionResult<{ dancerId: string }>> {
  const user = await requireUser();
  const code = (fd.get("code") ?? "").toString().trim();
  let dancerId = (fd.get("dancer_id") ?? "").toString().trim();
  const bank_name = strOrNull(fd, "bank_name");
  const bank_code = strOrNull(fd, "bank_code");
  const bank_account_number =
    (fd.get("bank_account_number") ?? "")
      .toString()
      .replace(/[\s-]/g, "")
      .trim() || null;
  const bank_account_holder = strOrNull(fd, "bank_account_holder");
  const rrn = normalizeResidentNumber(fd.get("resident_registration_number"));
  if (!code) return { ok: false, error: "잘못된 요청입니다." };
  if (!bank_name || !bank_account_number || !bank_account_holder)
    return { ok: false, error: "은행·계좌번호·예금주를 모두 입력해 주세요." };
  if (!/^[0-9]{8,20}$/.test(bank_account_number))
    return { ok: false, error: "계좌번호는 숫자 8~20자리로 입력해 주세요." };

  const admin = createAdminClient();
  const { data: coll } = await admin
    .from("project_settlement_collections")
    .select("project_id, collection_open")
    .eq("collect_code", code)
    .maybeSingle();
  if (!coll) return { ok: false, error: "유효하지 않은 수집 링크예요." };
  if (coll.collection_open !== true)
    return { ok: false, error: "정산 정보 수집이 마감되었어요." };
  const { data: proj } = await admin
    .from("projects")
    .select("id")
    .eq("id", coll.project_id as string)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proj) return { ok: false, error: "유효하지 않은 수집 링크예요." };
  const projectId = proj.id as string;

  // 본인 댄서 식별 (로그인 세션 = 신원). 여러 프로필이면 선택 필요.
  const mine = await myDancerIds(user.id);
  if (dancerId) {
    if (!mine.has(dancerId))
      return { ok: false, error: "본인 댄서 프로필만 제출할 수 있어요." };
  } else if (mine.size === 1) {
    dancerId = [...mine][0];
  } else if (mine.size === 0) {
    return {
      ok: false,
      error: "댄서 프로필이 필요해요. 포트폴리오를 먼저 만들어 주세요.",
    };
  } else {
    return { ok: false, error: "제출할 댄서 프로필을 선택해 주세요." };
  }

  // 지급정보 upsert (민감정보 → dancer_private_info)
  const { data: existingPi } = await admin
    .from("dancer_private_info")
    .select("dancer_id, resident_registration_number")
    .eq("dancer_id", dancerId)
    .maybeSingle();
  const residentToSave =
    rrn ?? normalizeResidentNumber(existingPi?.resident_registration_number);
  if (!residentToSave || !isResidentNumberValid(residentToSave))
    return {
      ok: false,
      error: "정산정보 제출에는 유효한 주민(외국인)등록번호가 필요합니다.",
    };
  const patch: Record<string, unknown> = {
    bank_name,
    bank_code,
    bank_account_number,
    bank_account_holder,
  };
  patch.resident_registration_number = `${residentToSave.slice(0, 6)}-${residentToSave.slice(6)}`;
  const piErr = existingPi
    ? (await admin.from("dancer_private_info").update(patch).eq("dancer_id", dancerId)).error
    : (await admin.from("dancer_private_info").insert({ dancer_id: dancerId, ...patch })).error;
  if (piErr)
    return { ok: false, error: "저장에 실패했습니다. 다시 시도해 주세요." };

  // settlements 행 보장 — 없으면 origin=self_collected, 금액 미정으로 생성.
  // 이미 있으면 금액(gross)·상태는 건드리지 않음(소유자 입력 보존, 멱등).
  // 수집 링크 제출은 항상 출연료(dancer) 행 — 스태프·소개비는 admin 풀 화면 전용.
  const { data: existingS } = await admin
    .from("settlements")
    .select("id")
    .eq("project_id", projectId)
    .eq("dancer_id", dancerId)
    .eq("role", "dancer")
    .maybeSingle();
  if (!existingS) {
    const { error: sErr } = await admin.from("settlements").insert({
      project_id: projectId,
      dancer_id: dancerId,
      role: "dancer",
      gross_amount: null,
      withholding_rate: DEFAULT_WITHHOLDING_RATE,
      status: "pending",
      origin: "self_collected",
      created_by: user.id,
    });
    if (sErr) return { ok: false, error: sErr.message };
  }

  revalidatePath(`/projects/${projectId}/settlements`);
  revalidatePath("/me/settlements");
  return { ok: true, data: { dancerId } };
}
