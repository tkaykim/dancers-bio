"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  markSettlementPaidAction,
  setSettlementAmountAction,
  savePayoutAccountAction,
} from "@/app/actions/settlements";
import { DancerDocuments } from "@/components/settlement/DancerDocuments";
import {
  calcSettlement,
  formatWon,
  type SettlementStatus,
} from "@/lib/settlement";

export type WithdrawalRow = {
  id: string;
  projectId: string;
  dancerId: string;
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
  hasIdCard: boolean;
  hasBankbook: boolean;
};

export function WithdrawalRequests({ rows }: { rows: WithdrawalRow[] }) {
  const requested = rows.filter((r) => r.status === "requested");
  const awaiting = rows.filter((r) => r.status === "pending");
  const paid = rows.filter((r) => r.status === "paid");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">
          입금 대기 ({requested.length})
        </h2>
        {requested.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
            처리할 출금 신청이 없어요.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {requested.map((r) => (
              <RequestCard key={r.id} row={r} />
            ))}
          </ul>
        )}
      </section>

      {awaiting.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-ink-2">
            정산 대기 · 출금신청 전 ({awaiting.length})
          </h2>
          <p className="-mt-1 text-xs text-ink-3">
            금액은 등록됐고 댄서의 출금 신청을 기다리는 중이에요. 매니저가 들고 있는
            신분증·통장사본은 여기서 미리 올려둘 수 있어요.
          </p>
          <ul className="flex flex-col gap-3">
            {awaiting.map((r) => (
              <PendingCard key={r.id} row={r} />
            ))}
          </ul>
        </section>
      ) : null}

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

      <SettlementAdminControls row={row} />

      <DancerDocuments
        dancerId={row.dancerId}
        dancerName={row.dancerName}
        showName={false}
        docs={{ idCard: row.hasIdCard, bankbook: row.hasBankbook }}
        compact
      />

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

function PendingCard({ row }: { row: WithdrawalRow }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">{row.dancerName}</span>
          <span className="text-xs text-ink-3">{row.projectTitle}</span>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
          출금신청 전
        </span>
      </div>
      <SettlementAdminControls row={row} />
      <DancerDocuments
        dancerId={row.dancerId}
        dancerName={row.dancerName}
        showName={false}
        docs={{ idCard: row.hasIdCard, bankbook: row.hasBankbook }}
        compact
      />
    </li>
  );
}

function SettlementAdminControls({ row }: { row: WithdrawalRow }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const locked = row.status === "paid";

  const [amount, setAmount] = useState(String(row.grossAmount));
  const num = Number(amount.replace(/[,\s]/g, ""));
  const preview = Number.isFinite(num) && num > 0 ? calcSettlement(num) : null;

  const hasAccount = !!(row.bankName && row.accountNumber && row.accountHolder);
  const [editAcct, setEditAcct] = useState(!hasAccount);
  const [bank, setBank] = useState(row.bankName ?? "");
  const [acctNo, setAcctNo] = useState(row.accountNumber ?? "");
  const [holder, setHolder] = useState(row.accountHolder ?? "");

  function saveAmount() {
    const fd = new FormData();
    fd.set("project_id", row.projectId);
    fd.set("dancer_id", row.dancerId);
    fd.set("gross_amount", amount);
    startTransition(async () => {
      const res = await setSettlementAmountAction(fd);
      if (res.ok) {
        toast.success("정산금액을 저장했어요.");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function saveAccount() {
    if (!bank.trim() || !acctNo.trim() || !holder.trim()) {
      toast.error("은행·계좌번호·예금주를 모두 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", row.dancerId);
    fd.set("bank_name", bank);
    fd.set("bank_account_number", acctNo);
    fd.set("bank_account_holder", holder);
    startTransition(async () => {
      const res = await savePayoutAccountAction(fd);
      if (res.ok) {
        toast.success("계좌를 저장했어요.");
        setEditAcct(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-ink-3">정산금액 (세전, 원)</span>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={locked || busy}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"
          />
          <button
            type="button"
            onClick={saveAmount}
            disabled={locked || busy || !amount.trim()}
            className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
          >
            저장
          </button>
        </div>
        {preview ? (
          <p className="text-[11px] text-ink-3">
            원천징수 3.3% −{formatWon(preview.tax)} ·{" "}
            <span className="font-semibold text-foreground">
              실입금액 {formatWon(preview.net)}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-ink-3">입금 계좌</span>
        {!editAcct && hasAccount ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {row.bankName} {row.accountNumber}
              </span>
              <span className="text-[11px] text-ink-3">예금주 {row.accountHolder}</span>
            </div>
            <button
              type="button"
              onClick={() => setEditAcct(true)}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-ink-2 active:bg-secondary"
            >
              수정
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <input
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="은행 (예: 국민은행)"
              disabled={busy}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <div className="flex gap-1.5">
              <input
                inputMode="numeric"
                value={acctNo}
                onChange={(e) => setAcctNo(e.target.value)}
                placeholder="계좌번호"
                disabled={busy}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <input
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                placeholder="예금주"
                disabled={busy}
                className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-sm"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={saveAccount}
                disabled={busy}
                className="h-9 flex-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                계좌 저장
              </button>
              {hasAccount ? (
                <button
                  type="button"
                  onClick={() => setEditAcct(false)}
                  disabled={busy}
                  className="h-9 rounded-lg border border-border px-3 text-xs text-ink-2"
                >
                  취소
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
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
