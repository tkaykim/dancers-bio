"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPayoutInfoComplete } from "@/lib/payout-validation";
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
