import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { calcSettlement } from "@/lib/settlement";

// 댄서 잔액 원장.
//
// 잔액 = sum(amount). 금액은 **항상 세후(실수령)** 기준으로만 쌓는다.
// 세전으로 쌓으면 "잔액을 썼는데 세금은 언제 떼나"가 영원히 남는다.
//
// ── 1단계(현재)의 성격 ────────────────────────────────────────────────
// 지금 원장은 settlements를 **파생 미러링**한다. 진실의 원천은 여전히
// settlements이고, 원장은 그 상태와 항상 일치해야 한다. 그래서 금액 수정·취소가
// 생기면 해당 줄을 **동기화**한다(추가만 하지 않는다).
//
// ⚠ 자사 서비스 결제(spend)를 도입하는 단계부터는 원장이 잔액의 진실이 되므로
//   earn 줄을 고정하고 append-only(조정은 adjust 줄 추가)로 전환해야 한다.
//   그때 원천징수 시점도 함께 재검토한다.

export type LedgerEntryType =
  | "earn"
  | "withdraw"
  | "spend"
  | "refund"
  | "adjust";

/**
 * 원장 한 줄 기록(추가 전용). 같은 출처·같은 종류는 DB 유니크 인덱스가 막는다.
 * 잔액 기록 실패가 정산 처리 자체를 되돌리면 안 되므로 비치명적으로 처리한다.
 */
export async function recordLedgerEntry(input: {
  dancerId: string;
  type: LedgerEntryType;
  /** 부호 없는 금액(원). 부호는 종류에 따라 자동으로 붙는다. */
  amount: number;
  refType?: string;
  refId?: string;
  memo?: string;
  createdBy?: string;
}): Promise<void> {
  const abs = Math.abs(Math.round(input.amount || 0));
  if (abs <= 0) return;
  const signed =
    input.type === "withdraw" || input.type === "spend" ? -abs : abs;

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("dancer_ledger_entries").insert({
      dancer_id: input.dancerId,
      entry_type: input.type,
      amount: signed,
      ref_type: input.refType ?? null,
      ref_id: input.refId ?? null,
      memo: input.memo ?? null,
      created_by: input.createdBy ?? null,
    });
    // 유니크 위반(23505)은 이미 기록된 것이므로 정상 흐름이다.
    if (error && error.code !== "23505") {
      console.error("[recordLedgerEntry] failed (non-fatal):", error);
    }
  } catch (err) {
    console.error("[recordLedgerEntry] failed (non-fatal):", err);
  }
}

/**
 * 정산 1건의 현재 상태를 원장에 그대로 반영한다(멱등).
 *
 * - 금액 확정(pending/requested) → earn 1줄, 금액이 바뀌면 그 줄을 갱신
 * - 입금완료(paid) → earn + withdraw
 * - 취소(cancelled)·금액 없음 → 그 정산에서 나온 줄 제거
 *
 * 금액 수정·취소 후에도 잔액이 정산 상태와 어긋나지 않게 하는 게 핵심이다.
 */
export async function syncSettlementLedger(settlementId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: s } = await admin
      .from("settlements")
      .select("dancer_id, gross_amount, withholding_rate, status")
      .eq("id", settlementId)
      .maybeSingle();
    if (!s) return;

    const dancerId = s.dancer_id as string;
    const gross = s.gross_amount as number | null;
    const status = s.status as string;
    const counts = gross != null && gross > 0 && status !== "cancelled";

    if (!counts) {
      // 취소되었거나 금액이 사라진 정산 — 잔액에서 흔적을 없앤다.
      await admin
        .from("dancer_ledger_entries")
        .delete()
        .eq("ref_type", "settlement")
        .eq("ref_id", settlementId);
      return;
    }

    const { net } = calcSettlement(gross, Number(s.withholding_rate));

    // earn: 없으면 만들고, 금액이 달라졌으면 갱신한다.
    const { data: existingEarn } = await admin
      .from("dancer_ledger_entries")
      .select("id, amount")
      .eq("ref_type", "settlement")
      .eq("ref_id", settlementId)
      .eq("entry_type", "earn")
      .maybeSingle();

    if (!existingEarn) {
      await admin.from("dancer_ledger_entries").insert({
        dancer_id: dancerId,
        entry_type: "earn",
        amount: net,
        ref_type: "settlement",
        ref_id: settlementId,
        memo: "정산 금액 확정",
      });
    } else if (Number(existingEarn.amount) !== net) {
      await admin
        .from("dancer_ledger_entries")
        .update({ amount: net, memo: "정산 금액 확정(수정 반영)" })
        .eq("id", existingEarn.id);
    }

    // withdraw: 입금완료일 때만 존재해야 한다.
    const { data: existingWithdraw } = await admin
      .from("dancer_ledger_entries")
      .select("id, amount")
      .eq("ref_type", "settlement")
      .eq("ref_id", settlementId)
      .eq("entry_type", "withdraw")
      .maybeSingle();

    if (status === "paid") {
      if (!existingWithdraw) {
        await admin.from("dancer_ledger_entries").insert({
          dancer_id: dancerId,
          entry_type: "withdraw",
          amount: -net,
          ref_type: "settlement",
          ref_id: settlementId,
          memo: "출금(이체 완료)",
        });
      } else if (Number(existingWithdraw.amount) !== -net) {
        await admin
          .from("dancer_ledger_entries")
          .update({ amount: -net })
          .eq("id", existingWithdraw.id);
      }
    } else if (existingWithdraw) {
      // 입금완료가 취소·되돌림된 경우
      await admin
        .from("dancer_ledger_entries")
        .delete()
        .eq("id", existingWithdraw.id);
    }
  } catch (err) {
    console.error("[syncSettlementLedger] failed (non-fatal):", err);
  }
}

/** 현재 잔액(원, 세후). 서버에서만 호출. */
export async function getDancerBalance(dancerId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancer_ledger_entries")
    .select("amount")
    .eq("dancer_id", dancerId);
  return (data ?? []).reduce(
    (sum, r) => sum + Number((r as { amount: number }).amount),
    0,
  );
}
