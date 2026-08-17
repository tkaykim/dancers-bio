"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPayoutInfoComplete,
  normalizeAccountNumber,
} from "@/lib/payout-validation";
import { matchBank } from "@/lib/banks";
import { formatWon } from "@/lib/settlement";
import { notify } from "@/lib/notify";
import type { ActionResult } from "./auth";

// 부분 출금 — 잔액에서 원하는 금액만 신청한다.
//
// 기존 출금은 "정산 1건 = 전액"이라 쪼갤 수 없었다. 잔액 원장이 생겼으므로
// 출금을 정산에서 떼어내 독립 신청으로 만든다.
// 실제 이체는 여전히 사람이 통장에서 하고, 앱은 상태만 기록한다.

/** 로그인 사용자가 본인으로서 다룰 수 있는 dancer_id 집합. */
async function myDancerIds(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancers")
    .select("id")
    .eq("profile_id", userId);
  return (data ?? []).map((d) => d.id as string);
}

export type BalanceSummary = {
  dancerId: string;
  balance: number;
  /** 지금 신청 가능한 금액 = 잔액 − 신청중 합계 */
  available: number;
  pendingRequested: number;
};

/** 본인 잔액·가용잔액 조회. */
export async function myBalanceAction(): Promise<
  ActionResult<{ balances: BalanceSummary[] }>
> {
  const user = await requireUser();
  const ids = await myDancerIds(user.id);
  if (ids.length === 0) return { ok: true, data: { balances: [] } };

  const admin = createAdminClient();
  const [{ data: ledger }, { data: reqs }] = await Promise.all([
    admin.from("dancer_ledger_entries").select("dancer_id, amount").in("dancer_id", ids),
    admin
      .from("withdrawal_requests")
      .select("dancer_id, amount")
      .in("dancer_id", ids)
      .eq("status", "requested"),
  ]);

  const balances: BalanceSummary[] = ids.map((id) => {
    const balance = (ledger ?? [])
      .filter((r) => (r as { dancer_id: string }).dancer_id === id)
      .reduce((s, r) => s + Number((r as { amount: number }).amount), 0);
    const pendingRequested = (reqs ?? [])
      .filter((r) => (r as { dancer_id: string }).dancer_id === id)
      .reduce((s, r) => s + Number((r as { amount: number }).amount), 0);
    return {
      dancerId: id,
      balance,
      pendingRequested,
      available: balance - pendingRequested,
    };
  });
  return { ok: true, data: { balances } };
}

const requestSchema = z.object({
  dancerId: z.string().uuid(),
  amount: z.number().int().positive().max(1_000_000_000),
});

/**
 * 부분 출금 신청.
 *
 * 금액 검증과 삽입은 DB 함수(request_withdrawal)가 한 트랜잭션에서 처리한다 —
 * 두 번 눌러 잔액을 초과 신청하는 경쟁 상태를 앱에서 막을 수 없기 때문.
 */
export async function requestPartialWithdrawalAction(
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = requestSchema.safeParse({
    dancerId: (fd.get("dancer_id") ?? "").toString().trim(),
    amount: Number(
      (fd.get("amount") ?? "").toString().replace(/[,\s원]/g, "").trim(),
    ),
  });
  if (!parsed.success)
    return { ok: false, error: "출금 금액을 숫자로 입력해 주세요." };
  const { dancerId, amount } = parsed.data;

  // 본인 것만.
  const mine = await myDancerIds(user.id);
  if (!mine.includes(dancerId))
    return { ok: false, error: "본인 잔액만 출금 신청할 수 있습니다." };

  const admin = createAdminClient();

  // 지급정보(계좌·주민번호)가 없으면 이체가 불가능하므로 신청 자체를 막는다.
  const { data: pi } = await admin
    .from("dancer_private_info")
    .select(
      "bank_name, bank_account_number, bank_account_holder, resident_registration_number",
    )
    .eq("dancer_id", dancerId)
    .maybeSingle();
  if (!isPayoutInfoComplete(pi))
    return {
      ok: false,
      error:
        "출금 신청 전에 유효한 입금 계좌와 주민(외국인)등록번호를 모두 등록해 주세요.",
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
        error: `출금 가능 금액을 초과했어요${avail ? ` (가능: ${formatWon(Number(avail))})` : ""}.`,
      };
    }
    if (msg.includes("PAYOUT_INFO_INCOMPLETE"))
      return {
        ok: false,
        error: "입금 계좌 정보가 완전하지 않습니다. 계좌를 다시 등록해 주세요.",
      };
    if (msg.includes("INVALID_AMOUNT"))
      return { ok: false, error: "출금 금액을 확인해 주세요." };
    return { ok: false, error: "출금 신청에 실패했습니다. 다시 시도해 주세요." };
  }

  await notifyAdminsPartialWithdrawal(data as string);

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true, data: { id: data as string } };
}

/** 담당자에게 출금 신청 알림 (비치명적). */
async function notifyAdminsPartialWithdrawal(requestId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: r } = await admin
      .from("withdrawal_requests")
      .select("dancer_id, amount")
      .eq("id", requestId)
      .maybeSingle();
    if (!r) return;
    const [{ data: d }, { data: admins }] = await Promise.all([
      admin.from("dancers").select("stage_name").eq("id", r.dancer_id).maybeSingle(),
      admin.from("profiles").select("id").eq("is_admin", true),
    ]);
    const name = (d?.stage_name as string) ?? "댄서";
    const url = "/admin/settlements";
    await Promise.all(
      ((admins ?? []) as Array<{ id: string }>).map((a) =>
        notify({
          recipientId: a.id,
          type: "settlement_withdrawal_requested",
          payload: {
            kind: "withdrawal_requested",
            withdrawal_request_id: requestId,
            dancer_name: name,
            net_amount: Number(r.amount),
            url,
          },
          push: {
            title: "출금 신청 접수",
            body: `${name}님이 ${formatWon(Number(r.amount))} 출금을 신청했어요.`,
            url,
          },
        }),
      ),
    );
  } catch (err) {
    console.error("[notifyAdminsPartialWithdrawal] failed (non-fatal):", err);
  }
}

/** 댄서 본인 출금 신청 취소 (이체 전에만). */
export async function cancelMyWithdrawalAction(
  fd: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  const id = (fd.get("request_id") ?? "").toString().trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  const { data: r } = await admin
    .from("withdrawal_requests")
    .select("id, dancer_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!r) return { ok: false, error: "신청 내역을 찾을 수 없습니다." };

  const mine = await myDancerIds(user.id);
  if (!mine.includes(r.dancer_id as string))
    return { ok: false, error: "본인 신청만 취소할 수 있습니다." };

  // 신청·이체완료와 같은 advisory lock 안에서 처리한다(경쟁 상태 방지).
  const { error } = await admin.rpc("cancel_withdrawal_request", {
    p_request_id: id,
    p_dancer_id: r.dancer_id as string,
  });
  if (error) {
    if ((error.message ?? "").includes("NOT_REQUESTED"))
      return {
        ok: false,
        error: "이미 처리된 신청입니다. 새로고침 후 확인해 주세요.",
      };
    return { ok: false, error: "취소에 실패했습니다." };
  }

  revalidatePath("/me/settlements");
  revalidatePath("/admin/settlements");
  return { ok: true };
}

/**
 * 관리자: 실제 이체 후 '입금완료' 기록.
 * 이 시점에 비로소 잔액에서 빠진다(원장 withdraw).
 */
export async function markWithdrawalPaidAction(
  fd: FormData,
): Promise<ActionResult> {
  const adminProfile = await requireAdmin();
  const id = (fd.get("request_id") ?? "").toString().trim();
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const admin = createAdminClient();
  // 상태 전환과 잔액 차감을 한 트랜잭션에서 처리한다.
  // 앱에서 나눠 하면 원장 기록이 실패했을 때 "지급했는데 잔액은 그대로"가 되어
  // 같은 돈을 다시 출금할 수 있다.
  const { error } = await admin.rpc("mark_withdrawal_paid", {
    p_request_id: id,
    p_admin_id: adminProfile.id,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("NOT_REQUESTED"))
      return { ok: false, error: "이미 처리되었거나 취소된 신청입니다." };
    if (msg.includes("NOT_FOUND"))
      return { ok: false, error: "신청 내역을 찾을 수 없습니다." };
    return { ok: false, error: "처리에 실패했습니다." };
  }

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true };
}


// ════════════════════════════════════════════════════════════════════════
//  다계좌이체 파일 (잔액 출금분)
//
//  담당자가 신청 건을 골라 .xls를 받아 우리WON비즈에 업로드하고 OTP 승인 →
//  실제 이체가 끝나면 '일괄 입금완료'로 기록한다.
//  ⚠ 파일 생성은 기록을 바꾸지 않는다. 잔액 차감은 입금완료 시점에만 일어난다 —
//    파일만 뽑고 실제 이체를 안 했을 때 잔액이 사라지면 안 되기 때문.
// ════════════════════════════════════════════════════════════════════════

/** 우리WON비즈 '보내는분 통장표시'(최대 14자). */
function transferMemo(dancer: string): string {
  const MAX = 14;
  const d = (dancer ?? "").replace(/\s/g, "").slice(0, MAX - 2);
  return (d + "정산").slice(0, MAX);
}

/** 파일명 타임스탬프 (KST yyyyMMdd_HHmm). */
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

export async function buildBalanceTransferFileAction(
  fd: FormData,
): Promise<
  ActionResult<{
    filename: string;
    base64: string;
    included: number;
    skipped: number;
    total: number;
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
  if (ids.length > 500)
    return { ok: false, error: "한 번에 최대 500건까지 받을 수 있어요." };

  const admin = createAdminClient();
  const { data: reqRows } = await admin
    .from("withdrawal_requests")
    .select(
      "id, dancer_id, amount, status, bank_name, bank_account_number, bank_account_holder",
    )
    .in("id", ids);
  if (!reqRows || reqRows.length === 0)
    return { ok: false, error: "출금 신청 내역을 찾을 수 없습니다." };

  const dancerIds = [...new Set(reqRows.map((r) => r.dancer_id as string))];
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
  const piById = new Map((piRows ?? []).map((p) => [p.dancer_id as string, p]));

  const rowById = new Map((reqRows ?? []).map((r) => [r.id as string, r]));
  const rows: (string | number)[][] = [];
  let skipped = 0;
  let total = 0;

  for (const id of ids) {
    const r = rowById.get(id);
    // 이미 이체했거나 취소된 건이 파일에 섞이면 그대로 중복 송금이 된다.
    if (!r || r.status !== "requested") {
      skipped++;
      continue;
    }
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped++;
      continue;
    }

    // 계좌는 신청 시점 스냅샷이 우선 — 신청 후 계좌를 바꿔도 승인한 곳으로 보낸다.
    // 스냅샷이 비어 있는 옛 건만 현재 등록 정보로 보완한다.
    const pi = piById.get(r.dancer_id as string);
    const acct = {
      bank_name: (r.bank_name as string | null) ?? pi?.bank_name ?? null,
      bank_account_number:
        (r.bank_account_number as string | null) ??
        pi?.bank_account_number ??
        null,
      bank_account_holder:
        (r.bank_account_holder as string | null) ??
        pi?.bank_account_holder ??
        null,
      // 주민번호는 스냅샷에 없다(원천징수 신고용). 지급 자격은 현재 등록분으로 본다.
      resident_registration_number: pi?.resident_registration_number ?? null,
    };
    if (!isPayoutInfoComplete(acct)) {
      skipped++;
      continue;
    }

    // 업로드 양식의 '입금은행' 표기로 정규화 — 앱 표시명("농협은행")을 그대로 넣으면
    // 은행에서 반려된다("농협"이어야 함).
    const bank =
      matchBank(acct.bank_name)?.transfer ?? (acct.bank_name as string);

    rows.push([
      bank, // A 입금은행
      normalizeAccountNumber(acct.bank_account_number), // B 입금계좌번호(숫자만)
      amount, // C 이체금액 = 잔액에서 신청한 세후 금액
      transferMemo(nameById.get(r.dancer_id as string) ?? ""), // D 보내는분 통장표시
      "", // E 받는분 통장표시
      "", // F 집금(CMS)번호
    ]);
    total += amount;
  }

  if (rows.length === 0)
    return {
      ok: false,
      error:
        "이체할 수 있는 건이 없어요(신청 상태·계좌·주민(외국인)등록번호를 확인해 주세요).",
    };

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const base64 = XLSX.write(wb, { type: "base64", bookType: "biff8" });

  return {
    ok: true,
    data: {
      filename: `deetz_잔액출금_다계좌이체_${kstStamp()}.xls`,
      base64,
      included: rows.length,
      skipped,
      total,
    },
  };
}

/** 실제 이체를 마친 뒤 여러 건을 한 번에 입금완료로 기록. */
export async function markWithdrawalsPaidBulkAction(
  fd: FormData,
): Promise<ActionResult<{ done: number; failed: number }>> {
  const adminProfile = await requireAdmin();
  let ids: string[] = [];
  try {
    const p = JSON.parse((fd.get("ids") ?? "[]").toString());
    if (Array.isArray(p)) ids = p.filter((x) => typeof x === "string");
  } catch {
    ids = [];
  }
  if (ids.length === 0) return { ok: false, error: "선택된 건이 없습니다." };

  const admin = createAdminClient();
  let done = 0;
  let failed = 0;
  // 건별 RPC — 상태 전환과 원장 차감을 건마다 한 트랜잭션에서 처리한다.
  // 일부가 실패해도 나머지는 기록돼야 하므로 전체 롤백하지 않는다.
  for (const id of ids) {
    const { error } = await admin.rpc("mark_withdrawal_paid", {
      p_request_id: id,
      p_admin_id: adminProfile.id,
    });
    if (error) failed++;
    else done++;
  }

  revalidatePath("/admin/settlements");
  revalidatePath("/me/settlements");
  return { ok: true, data: { done, failed } };
}
