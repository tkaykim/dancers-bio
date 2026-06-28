"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  setSettlementCollectionAction,
  setProjectFinanceAction,
  setSettlementAmountAction,
} from "@/app/actions/settlements";
import {
  calcSettlement,
  formatWon,
  formatWonInput,
  SETTLEMENT_STATUS_LABEL,
  type SettlementStatus,
} from "@/lib/settlement";

export type OwnerSettlementRow = {
  id: string;
  dancerId: string;
  dancerName: string;
  grossAmount: number | null;
  rate: number;
  status: SettlementStatus;
  origin: string;
  hasBank: boolean;
  hasRrn: boolean;
};

export function OwnerSettlementConsole({
  projectId,
  collectCode,
  collectionOpen,
  collectUrlBase,
  clientRevenue,
  expenseAmount,
  rows,
}: {
  projectId: string;
  collectCode: string | null;
  collectionOpen: boolean;
  collectUrlBase: string;
  clientRevenue: number | null;
  expenseAmount: number | null;
  rows: OwnerSettlementRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const totalGross = rows.reduce((sum, r) => sum + (r.grossAmount ?? 0), 0);
  const margin =
    clientRevenue != null
      ? clientRevenue - totalGross - (expenseAmount ?? 0)
      : null;
  const collectUrl = collectCode ? `${collectUrlBase}${collectCode}` : null;

  function toggleCollection(open: boolean) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("open", open ? "true" : "false");
    startTransition(async () => {
      const res = await setSettlementCollectionAction(fd);
      if (res.ok) {
        toast.success(open ? "수집 링크를 열었어요." : "수집을 마감했어요.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function copyLink() {
    if (!collectUrl) return;
    navigator.clipboard.writeText(collectUrl).then(
      () => {
        setCopied(true);
        toast.success("수집 링크를 복사했어요.");
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("복사에 실패했어요."),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1) 정산 정보 수집 링크 */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-2">정산 정보 수집 링크</h2>
          {collectCode ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                collectionOpen
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-secondary text-ink-3"
              }`}
            >
              {collectionOpen ? "수집 중" : "마감"}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-ink-3">
          이 링크를 댄서들에게 보내면, 각자 로그인 후 계좌·주민번호를 직접
          입력해요. 구글폼 대신 쓰세요.
        </p>

        {collectUrl ? (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {collectUrl}
              </span>
              <button
                type="button"
                onClick={copyLink}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-ink-2 active:bg-secondary"
                aria-label="링크 복사"
              >
                {copied ? (
                  <Check size={15} className="text-primary" aria-hidden />
                ) : (
                  <Copy size={15} aria-hidden />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => toggleCollection(!collectionOpen)}
              disabled={busy}
              className="self-start rounded-xl border border-border px-4 py-2 text-xs font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
            >
              {collectionOpen ? "수집 마감하기" : "수집 다시 열기"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => toggleCollection(true)}
            disabled={busy}
            className="self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
          >
            {busy ? "생성 중…" : "수집 링크 만들기"}
          </button>
        )}
      </section>

      {/* 2) 수익 · 마진 */}
      <FinanceSection
        projectId={projectId}
        clientRevenue={clientRevenue}
        expenseAmount={expenseAmount}
        totalGross={totalGross}
        margin={margin}
        busy={busy}
        startTransition={startTransition}
        onDone={() => router.refresh()}
      />

      {/* 3) 댄서별 정산 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-2">
            참여 댄서 정산 ({rows.length})
          </h2>
          <span className="text-xs text-ink-3">
            배분 합계 {formatWon(totalGross)}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
            아직 제출한 댄서가 없어요. 위 수집 링크를 보내 정산 정보를 받아
            보세요.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <DancerRow
                key={r.id}
                projectId={projectId}
                row={r}
                busy={busy}
                startTransition={startTransition}
                onDone={() => router.refresh()}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-xl bg-secondary/60 px-4 py-3 text-[11px] leading-relaxed text-ink-3">
        실제 입금(다계좌이체)은 정산 담당자(경영지원실)가 처리해요. 금액 확정 후
        담당자가 입금하면 ‘입금완료’로 표시됩니다.
      </p>
    </div>
  );
}

function FinanceSection({
  projectId,
  clientRevenue,
  expenseAmount,
  totalGross,
  margin,
  busy,
  startTransition,
  onDone,
}: {
  projectId: string;
  clientRevenue: number | null;
  expenseAmount: number | null;
  totalGross: number;
  margin: number | null;
  busy: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [revenue, setRevenue] = useState(formatWonInput(clientRevenue));
  const [expense, setExpense] = useState(formatWonInput(expenseAmount));

  function save() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("client_revenue", revenue);
    fd.set("expense_amount", expense);
    startTransition(async () => {
      const res = await setProjectFinanceAction(fd);
      if (res.ok) {
        toast.success("수익 정보를 저장했어요.");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-ink-2">수익 · 마진</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-3">
            클라이언트 수주액
          </span>
          <input
            inputMode="numeric"
            value={revenue}
            onChange={(e) => setRevenue(formatWonInput(e.target.value))}
            placeholder="원"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-3">실비</span>
          <input
            inputMode="numeric"
            value={expense}
            onChange={(e) => setExpense(formatWonInput(e.target.value))}
            placeholder="원"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 p-3 text-xs">
        <div className="flex justify-between text-ink-2">
          <span>댄서 배분 합계</span>
          <span>− {formatWon(totalGross)}</span>
        </div>
        <div className="flex justify-between text-ink-2">
          <span>실비</span>
          <span>− {formatWon(expenseAmount ?? 0)}</span>
        </div>
        <div className="my-1 border-t border-hairline-2" />
        <div className="flex justify-between font-semibold text-foreground">
          <span>예상 마진</span>
          <span>{margin != null ? formatWon(margin) : "수주액 입력 시 계산"}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="self-start rounded-xl border border-border px-4 py-2 text-xs font-semibold text-ink-2 active:bg-secondary disabled:opacity-50"
      >
        수익 정보 저장
      </button>
    </section>
  );
}

function DancerRow({
  projectId,
  row,
  busy,
  startTransition,
  onDone,
}: {
  projectId: string;
  row: OwnerSettlementRow;
  busy: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(formatWonInput(row.grossAmount));
  const locked = row.status === "paid";
  const calc =
    row.grossAmount != null ? calcSettlement(row.grossAmount, row.rate) : null;

  function save() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", row.dancerId);
    fd.set("gross_amount", amount);
    startTransition(async () => {
      const res = await setSettlementAmountAction(fd);
      if (res.ok) {
        toast.success("정산 금액을 저장했어요.");
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{row.dancerName}</span>
          <div className="flex flex-wrap items-center gap-1">
            {row.origin === "self_collected" ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                셀프 제출
              </span>
            ) : null}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                row.hasBank
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              계좌 {row.hasBank ? "제출됨" : "미제출"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                row.hasRrn
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              주민번호 {row.hasRrn ? "제출됨" : "미제출"}
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
          {SETTLEMENT_STATUS_LABEL[row.status]}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-3">
            정산 금액 (세전)
          </span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(formatWonInput(e.target.value))}
            placeholder="원"
            disabled={busy || locked}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={busy || locked}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
        >
          저장
        </button>
      </div>
      {calc ? (
        <p className="text-[11px] text-ink-3">
          세금 {(calc.rate * 100).toFixed(1)}%(−{formatWon(calc.tax)}) 공제 →
          실수령 {formatWon(calc.net)}
        </p>
      ) : (
        <p className="text-[11px] text-amber-600">금액 산정 대기</p>
      )}
    </li>
  );
}
