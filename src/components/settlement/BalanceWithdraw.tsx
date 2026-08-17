"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatWon, formatWonInput } from "@/lib/settlement";
import {
  cancelMyWithdrawalAction,
  requestPartialWithdrawalAction,
} from "@/app/actions/withdrawals";

export type PendingWithdrawal = {
  id: string;
  amount: number;
  requestedAt: string;
  bankName: string | null;
  accountTail: string | null;
};

// 잔액에서 원하는 금액만 출금 신청. 전액 신청도 여기서 한다.
// 실제 이체는 담당자(경영지원실)가 통장에서 하고, 그때 잔액에서 빠진다.
export function BalanceWithdraw({
  dancerId,
  dancerName,
  balance,
  available,
  pending,
  brandName = "deetz",
  payoutReady,
}: {
  dancerId: string;
  dancerName: string;
  balance: number;
  available: number;
  pending: PendingWithdrawal[];
  brandName?: string;
  payoutReady: boolean;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [amount, setAmount] = useState("");

  function submit() {
    const raw = amount.replace(/[,\s원]/g, "");
    const n = Number(raw);
    if (!raw || !Number.isFinite(n) || n <= 0) {
      toast.error("출금할 금액을 입력해 주세요.");
      return;
    }
    if (n > available) {
      toast.error(`출금 가능 금액(${formatWon(available)})을 넘을 수 없어요.`);
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("amount", raw);
    startTransition(async () => {
      const res = await requestPartialWithdrawalAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${formatWon(n)} 출금을 신청했어요.`);
      setAmount("");
      router.refresh();
    });
  }

  function cancel(id: string) {
    const fd = new FormData();
    fd.set("request_id", id);
    startTransition(async () => {
      const res = await cancelMyWithdrawalAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("출금 신청을 취소했어요.");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-2">출금하기</h2>
        <span className="text-[11px] text-ink-3">{dancerName}</span>
      </div>

      <div className="flex items-end justify-between gap-3 rounded-xl bg-secondary/60 px-3.5 py-3">
        <div className="flex flex-col">
          <span className="text-[11px] text-ink-3">출금 가능 금액</span>
          <span className="text-xl font-bold">{formatWon(available)}</span>
        </div>
        {balance !== available ? (
          <span className="pb-1 text-[11px] text-ink-3">
            잔액 {formatWon(balance)} · 신청중 {formatWon(balance - available)}
          </span>
        ) : null}
      </div>

      {!payoutReady ? (
        <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-[11px] leading-relaxed text-amber-700">
          출금하려면 입금 계좌와 주민(외국인)등록번호를 먼저 등록해 주세요.
        </p>
      ) : available <= 0 ? (
        <p className="text-[11px] text-ink-3">지금 출금할 수 있는 금액이 없어요.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatWonInput(e.target.value))}
              placeholder="출금할 금액 (원)"
              disabled={busy}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setAmount(formatWonInput(available))}
              disabled={busy}
              className="shrink-0 rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-ink-2 active:bg-secondary disabled:opacity-50"
            >
              전액
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
          >
            {busy ? "신청 중…" : "출금 신청"}
          </button>
          <p className="text-[11px] leading-relaxed text-ink-3">
            잔액은 원천징수 3.3%를 이미 뺀 실수령 금액이에요.
            <br />
            신청하면 {brandName} 정산 담당자가 등록하신 계좌로 입금합니다.
          </p>
        </>
      )}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-hairline-2 pt-3">
          <span className="text-[11px] font-semibold text-ink-3">
            처리 중인 출금 신청
          </span>
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold">
                    {formatWon(p.amount)}
                  </span>
                  <span className="truncate text-[11px] text-ink-3">
                    {p.bankName ?? "계좌"} {p.accountTail ?? ""} · 입금 대기
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => cancel(p.id)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
                >
                  취소
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
