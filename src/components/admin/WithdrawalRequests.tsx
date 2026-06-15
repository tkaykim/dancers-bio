"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { markSettlementPaidAction } from "@/app/actions/settlements";
import {
  calcSettlement,
  formatWon,
  type SettlementStatus,
} from "@/lib/settlement";

export type WithdrawalRow = {
  id: string;
  dancerName: string;
  projectTitle: string;
  grossAmount: number;
  rate: number;
  status: SettlementStatus;
  requestedAt: string | null;
  paidAt: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
};

export function WithdrawalRequests({ rows }: { rows: WithdrawalRow[] }) {
  const pending = rows.filter((r) => r.status === "requested");
  const paid = rows.filter((r) => r.status === "paid");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">
          입금 대기 ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
            처리할 출금 신청이 없어요.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((r) => (
              <RequestCard key={r.id} row={r} />
            ))}
          </ul>
        )}
      </section>

      {paid.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink-2">입금 완료 ({paid.length})</h2>
          <ul className="flex flex-col gap-2">
            {paid.map((r) => {
              const calc = calcSettlement(r.grossAmount, r.rate);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {r.dancerName} · {r.projectTitle}
                    </span>
                    <span className="text-xs text-ink-3">
                      {fmtDate(r.paidAt)} 입금
                    </span>
                  </div>
                  <span className="font-semibold text-emerald-600">
                    {formatWon(calc.net)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RequestCard({ row }: { row: WithdrawalRow }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const calc = calcSettlement(row.grossAmount, row.rate);
  const hasAccount = row.bankName && row.accountNumber && row.accountHolder;

  function markPaid() {
    const fd = new FormData();
    fd.set("settlement_id", row.id);
    startTransition(async () => {
      const res = await markSettlementPaidAction(fd);
      if (res.ok) {
        toast.success(`${row.dancerName} 이체 완료 처리했어요.`);
        router.refresh();
      } else {
        toast.error(res.error);
        setConfirming(false);
      }
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">{row.dancerName}</span>
          <span className="text-xs text-ink-3">{row.projectTitle}</span>
          <span className="text-[11px] text-ink-3">
            신청 {fmtDate(row.requestedAt)}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
          입금대기
        </span>
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 p-3 text-xs text-ink-2">
        <div className="flex justify-between">
          <span>세전</span>
          <span className="font-medium">{formatWon(calc.gross)}</span>
        </div>
        <div className="flex justify-between">
          <span>원천징수 ({(calc.rate * 100).toFixed(1)}%)</span>
          <span className="font-medium">− {formatWon(calc.tax)}</span>
        </div>
        <div className="my-1 border-t border-hairline-2" />
        <div className="flex justify-between">
          <span className="font-semibold text-foreground">실입금액</span>
          <span className="text-base font-bold text-foreground">
            {formatWon(calc.net)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border p-3 text-sm">
        {hasAccount ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">
              {row.bankName} {row.accountNumber}
            </span>
            <span className="text-xs text-ink-3">예금주 {row.accountHolder}</span>
          </div>
        ) : (
          <span className="text-xs text-red-600">
            계좌 정보가 없어요. 댄서에게 계좌 등록을 요청하세요.
          </span>
        )}
      </div>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            실제로 통장에서 {formatWon(calc.net)}을 이체하셨나요? 이체 완료로
            기록되며 댄서 화면이 입금완료로 바뀝니다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-ink-2"
            >
              아니요
            </button>
            <button
              type="button"
              onClick={markPaid}
              disabled={busy}
              className="flex-1 rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50"
            >
              {busy ? "처리 중…" : "네, 이체 완료"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!hasAccount}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors active:opacity-80 disabled:opacity-50"
        >
          이체 완료 처리
        </button>
      )}
    </li>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
