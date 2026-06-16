"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  requestWithdrawalAction,
  savePayoutAccountAction,
} from "@/app/actions/settlements";
import {
  calcSettlement,
  formatWon,
  SETTLEMENT_STATUS_LABEL,
  type SettlementStatus,
} from "@/lib/settlement";
import {
  DancerDocuments,
  type DancerDocsState,
} from "@/components/settlement/DancerDocuments";

export type MySettlementRow = {
  id: string;
  dancerId: string;
  dancerName: string;
  projectTitle: string;
  grossAmount: number;
  rate: number;
  status: SettlementStatus;
};

export type PayoutAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export function MySettlements({
  settlements,
  accounts,
  docs,
  dancerNames,
}: {
  settlements: MySettlementRow[];
  accounts: Record<string, PayoutAccount | null>;
  docs: Record<string, DancerDocsState>;
  dancerNames: Record<string, string>;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<MySettlementRow | null>(null);
  const dancerIds = Object.keys(dancerNames);

  // 출금 가능 잔액 = 정산완료(pending) 건의 세전 금액 합계.
  // (출금신청·입금완료 건은 이미 처리 중/완료라 잔액에서 제외)
  const pendingRows = settlements.filter((s) => s.status === "pending");
  const withdrawableGross = pendingRows.reduce(
    (sum, s) => sum + calcSettlement(s.grossAmount, s.rate).gross,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 출금 가능 잔액 요약 */}
      <section className="flex flex-col gap-1.5 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card p-5">
        <span className="text-xs font-medium text-ink-3">출금 가능 금액</span>
        <span className="text-3xl font-extrabold tracking-tight text-foreground">
          {formatWon(withdrawableGross)}
        </span>
        <span className="text-[11px] text-ink-3">
          정산완료 {pendingRows.length}건 · 출금 시 세금 3.3% 공제 후 입금돼요
        </span>
      </section>

      {/* 입금 계좌 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">입금 계좌</h2>
        {dancerIds.map((id) => (
          <AccountCard
            key={id}
            dancerId={id}
            dancerName={dancerNames[id]}
            showName={dancerIds.length > 1}
            account={accounts[id] ?? null}
          />
        ))}
      </section>

      {/* 정산 서류 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">정산 서류</h2>
        {dancerIds.map((id) => (
          <DancerDocuments
            key={id}
            dancerId={id}
            dancerName={dancerNames[id]}
            showName={dancerIds.length > 1}
            docs={docs[id] ?? { idCard: false, bankbook: false }}
          />
        ))}
      </section>

      {/* 정산 내역 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">정산 내역</h2>
        {settlements.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
            아직 확정된 정산금액이 없어요. 진행한 프로젝트의 정산금액이
            등록되면 여기에 표시됩니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {settlements.map((s) => {
              const calc = calcSettlement(s.grossAmount, s.rate);
              const hasAccount = !!accounts[s.dancerId];
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold leading-tight">
                        {s.projectTitle}
                      </span>
                      <span className="text-xs text-ink-3">{s.dancerName}</span>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 p-3">
                    <div className="flex items-end justify-between">
                      <span className="text-xs text-ink-3">정산 금액 (세전)</span>
                      <span className="text-lg font-bold text-foreground">
                        {formatWon(calc.gross)}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-3">
                      세금 {(calc.rate * 100).toFixed(1)}%(−{formatWon(calc.tax)})
                      {s.status === "paid"
                        ? ` 공제 후 ${formatWon(calc.net)} 입금 완료`
                        : s.status === "requested"
                          ? ` 공제 후 ${formatWon(calc.net)} 입금 예정`
                          : ` 공제 후 ${formatWon(calc.net)} 입금돼요`}
                    </p>
                  </div>

                  {s.status === "pending" ? (
                    hasAccount ? (
                      <button
                        type="button"
                        onClick={() => setConfirm(s)}
                        className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors active:opacity-80"
                      >
                        출금 신청
                      </button>
                    ) : (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        출금 신청하려면 위에서 입금 계좌를 먼저 등록해 주세요.
                      </p>
                    )
                  ) : null}
                  {s.status === "requested" ? (
                    <p className="text-xs text-ink-3">
                      출금 신청이 접수되었어요. 담당자 확인 후 등록하신 계좌로
                      입금됩니다.
                    </p>
                  ) : null}
                  {s.status === "paid" ? (
                    <p className="text-xs text-emerald-600">
                      입금이 완료되었어요.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirm ? (
        <WithdrawDialog
          row={confirm}
          account={accounts[confirm.dancerId] ?? null}
          onClose={() => setConfirm(null)}
          onDone={() => {
            setConfirm(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold text-foreground" : ""}>
        {label}
      </span>
      <span
        className={
          strong ? "text-base font-bold text-foreground" : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: SettlementStatus }) {
  const tone =
    status === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : status === "requested"
        ? "bg-blue-100 text-blue-700"
        : status === "cancelled"
          ? "bg-secondary text-ink-3"
          : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {SETTLEMENT_STATUS_LABEL[status]}
    </span>
  );
}

function AccountCard({
  dancerId,
  dancerName,
  showName,
  account,
}: {
  dancerId: string;
  dancerName: string;
  showName: boolean;
  account: PayoutAccount | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!account);
  const [busy, startTransition] = useTransition();
  const [bankName, setBankName] = useState(account?.bankName ?? "");
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [accountHolder, setAccountHolder] = useState(
    account?.accountHolder ?? "",
  );
  const [reveal, setReveal] = useState(false);

  function save() {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      toast.error("은행·계좌번호·예금주를 모두 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("bank_name", bankName);
    fd.set("bank_account_number", accountNumber);
    fd.set("bank_account_holder", accountHolder);
    startTransition(async () => {
      const res = await savePayoutAccountAction(fd);
      if (res.ok) {
        toast.success("계좌를 저장했어요.");
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      {showName ? (
        <span className="text-xs font-semibold text-ink-2">{dancerName}</span>
      ) : null}
      {!editing && account ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="truncate font-semibold">
              {account.bankName}{" "}
              {reveal ? account.accountNumber : maskAccount(account.accountNumber)}
            </span>
            <span className="text-xs text-ink-3">
              예금주 {account.accountHolder}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "가리기" : "계좌번호 전체 보기"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-2 active:bg-secondary"
            >
              {reveal ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 active:bg-secondary"
            >
              변경
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="은행 (예: 국민은행)"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="계좌번호 (- 없이)"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="예금주"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
            >
              {busy ? "저장 중…" : "계좌 저장"}
            </button>
            {account ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-ink-2 active:bg-secondary"
              >
                취소
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-ink-3">
            계좌 정보는 정산 담당자만 확인할 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}

function WithdrawDialog({
  row,
  account,
  onClose,
  onDone,
}: {
  row: MySettlementRow;
  account: PayoutAccount | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, startTransition] = useTransition();
  const [reveal, setReveal] = useState(false);
  const calc = calcSettlement(row.grossAmount, row.rate);

  function submit() {
    const fd = new FormData();
    fd.set("settlement_id", row.id);
    startTransition(async () => {
      const res = await requestWithdrawalAction(fd);
      if (res.ok) {
        toast.success("출금 신청이 접수되었어요.");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold">출금 신청</h3>
        <p className="mt-1 text-sm text-ink-2">{row.projectTitle}</p>

        <div className="mt-4 flex flex-col gap-1 rounded-xl bg-secondary/60 p-3 text-xs text-ink-2">
          <Line label="정산 금액 (세전)" value={formatWon(calc.gross)} />
          <Line
            label={`세금 원천징수 (${(calc.rate * 100).toFixed(1)}%)`}
            value={`− ${formatWon(calc.tax)}`}
          />
          <div className="my-1 border-t border-hairline-2" />
          <Line label="실입금액" value={formatWon(calc.net)} strong />
        </div>

        <div className="mt-3 rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed">
          <p className="font-semibold text-blue-800">
            원천징수 3.3%는 플랫폼 수수료가 아니에요.
          </p>
          <p className="mt-1 text-blue-700">
            국세청에 납부되는 세금이에요 (소득세 3% + 지방소득세 0.3%).
          </p>
          <p className="mt-1 text-blue-700">
            deetz가 댄서님 대신 원천징수·신고하고, 매년 5월 종합소득세 신고 때
            환급받으실 수도 있어요.
          </p>
        </div>

        {account ? (
          <div className="mt-3 flex items-start justify-between gap-2 text-sm text-ink-2">
            <p className="min-w-0">
              <span className="font-semibold text-foreground">
                {account.bankName}{" "}
                {reveal ? account.accountNumber : maskAccount(account.accountNumber)}
              </span>{" "}
              ({account.accountHolder}) 으로 입금됩니다.
            </p>
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "가리기" : "계좌번호 전체 보기"}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-ink-2 active:bg-secondary"
            >
              {reveal ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
            </button>
          </div>
        ) : null}

        <p className="mt-3 text-xs text-ink-3">
          신청하면 원천징수 3.3%를 제외한 {formatWon(calc.net)}이 등록하신
          계좌로 입금됩니다. 신청하시겠어요?
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-medium text-ink-2 active:bg-secondary"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
          >
            {busy ? "신청 중…" : "출금 신청"}
          </button>
        </div>
      </div>
    </div>
  );
}

function maskAccount(num: string): string {
  const s = num.replace(/\s/g, "");
  if (s.length <= 4) return s;
  return `${s.slice(0, 3)}${"*".repeat(Math.max(0, s.length - 6))}${s.slice(-3)}`;
}
