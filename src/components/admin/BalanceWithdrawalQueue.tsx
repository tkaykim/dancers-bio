"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatWon } from "@/lib/settlement";
import { markWithdrawalPaidAction } from "@/app/actions/withdrawals";

export type BalanceWithdrawalRow = {
  id: string;
  dancerName: string;
  amount: number;
  requestedAt: string;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
};

// 잔액 기반 부분 출금 신청 큐.
// 기존 '정산 건별 출금'과 별개 경로라 화면도 따로 둔다 —
// 같은 목록에 섞으면 담당자가 같은 돈을 두 번 이체할 위험이 있다.
export function BalanceWithdrawalQueue({
  rows,
}: {
  rows: BalanceWithdrawalRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  function markPaid(id: string, name: string, amount: number) {
    if (
      !window.confirm(
        `${name}님에게 ${formatWon(amount)}을 실제로 이체하셨나요?\n확인을 누르면 입금완료로 기록되고 잔액에서 차감됩니다.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("request_id", id);
    startTransition(async () => {
      const res = await markWithdrawalPaidAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDoneIds((prev) => new Set(prev).add(id));
      toast.success("입금완료로 기록했어요.");
      router.refresh();
    });
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-2">
          잔액 출금 신청 ({rows.length})
        </h2>
        <span className="text-xs text-ink-3">합계 {formatWon(total)}</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
          처리할 잔액 출금 신청이 없어요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const done = doneIds.has(r.id);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{r.dancerName}</span>
                  <span className="truncate text-[11px] text-ink-3">
                    {r.bankName ?? "은행 미등록"} {r.accountNumber ?? ""}
                    {r.accountHolder ? ` · ${r.accountHolder}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-bold">
                    {formatWon(r.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => markPaid(r.id, r.dancerName, r.amount)}
                    disabled={busy || done}
                    className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
                  >
                    {done ? "완료" : "이체 완료 처리"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
