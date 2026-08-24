"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setProjectFinanceAction,
  cancelSettlementAction,
} from "@/app/actions/settlements";
import {
  adminRequestWithdrawalAction,
  createOneOffPayeeAction,
  issuePayeeCollectTokenAction,
  searchPayeesAction,
  setStaffPoolEnabledAction,
  setStaffSettlementAction,
  setTaxInvoiceReceivedAction,
} from "@/app/actions/staff-pool";
import {
  calcPayout,
  formatWon,
  formatWonInput,
  settlementRoleLabel,
  settlementStageLabel,
  type SettlementStatus,
} from "@/lib/settlement";

export type PoolRow = {
  id: string;
  dancerId: string;
  name: string;
  role: string;
  grossAmount: number | null;
  rate: number;
  taxMode: string;
  vatAmount: number;
  taxInvoiceReceived: boolean;
  status: SettlementStatus;
  memo: string | null;
  payoutReady: boolean;
  payeeTaxMode: string;
  hasAccount: boolean;
  balance: number;
};

// 프로젝트 풀 콘솔 — 분배 금액은 사람이 수기 확정(자동 분배 없음, 대표 결정 2).
// 추천 비율은 참고 표기만: 풀 대비 운영 PM 30~35% · 모집 15~20% · 소개 5~10% · 회사 유보 40~50%.
export function ProjectPoolConsole({
  projectId,
  isAdmin,
  staffPoolEnabled,
  clientRevenue,
  expenseAmount,
  directLabor,
  pool,
  distributed,
  residual,
  rows,
}: {
  projectId: string;
  isAdmin: boolean;
  staffPoolEnabled: boolean;
  clientRevenue: number | null;
  expenseAmount: number;
  directLabor: number;
  pool: number | null;
  distributed: number;
  residual: number | null;
  rows: PoolRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <FinanceCard
        projectId={projectId}
        isAdmin={isAdmin}
        staffPoolEnabled={staffPoolEnabled}
        clientRevenue={clientRevenue}
        expenseAmount={expenseAmount}
        busy={busy}
        startTransition={startTransition}
        onDone={() => router.refresh()}
      />

      {/* 풀 요약 — 잔여 = 회사 유보 자동(대표 결정 8) */}
      <section className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 text-sm">
        <SummaryLine label="수주액 (공급가)" value={clientRevenue} />
        <SummaryLine
          label="− 직접비 (출연료·교통비)"
          value={directLabor}
          negative
        />
        <SummaryLine label="− 비인건 실비" value={expenseAmount} negative />
        <div className="my-1 border-t border-hairline-2" />
        <SummaryLine label="분배 가능 풀" value={pool} bold />
        <SummaryLine
          label="− 분배 (스태프·소개비)"
          value={distributed}
          negative
        />
        <div className="my-1 border-t border-hairline-2" />
        <SummaryLine label="회사 유보 (잔여 자동)" value={residual} bold />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
          참고 비율(자동 계산 없음): 풀 대비 운영 PM 30~35% · 모집 15~20% ·
          소개 5~10% · 회사 유보 40~50%. 부가세는 풀 계산에 넣지 않아요(공급가
          기준).
        </p>
      </section>

      {/* 분배 목록 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-2">
            스태프·소개비 분배 ({rows.length})
          </h2>
          <span className="text-xs text-ink-3">
            분배 합계 {formatWon(distributed)}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
            아직 분배 내역이 없어요. 아래에서 수취인을 추가해 주세요.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <PoolRowCard
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

      <AddPayeeSection
        projectId={projectId}
        busy={busy}
        startTransition={startTransition}
        onDone={() => router.refresh()}
      />

      <p className="rounded-xl bg-secondary/60 px-4 py-3 text-[11px] leading-relaxed text-ink-3">
        표시 금액은 세전 기준이에요. 3.3%는 수수료가 아니라 국세청에 납부하는
        세금이고, 사업자 건은 세금계산서 수취 후 부가세 포함 금액으로
        이체됩니다. 실제 이체는 담당자(경영지원실)가 처리해요.
      </p>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  negative,
  bold,
}: {
  label: string;
  value: number | null;
  negative?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${bold ? "font-semibold text-foreground" : "text-ink-2"}`}
    >
      <span>{label}</span>
      <span>
        {value == null
          ? "수주액 입력 시 계산"
          : `${negative ? "− " : ""}${formatWon(value)}`}
      </span>
    </div>
  );
}

function FinanceCard({
  projectId,
  isAdmin,
  staffPoolEnabled,
  clientRevenue,
  expenseAmount,
  busy,
  startTransition,
  onDone,
}: {
  projectId: string;
  isAdmin: boolean;
  staffPoolEnabled: boolean;
  clientRevenue: number | null;
  expenseAmount: number;
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
        toast.success("재무 정보를 저장했어요.");
        onDone();
      } else toast.error(res.error);
    });
  }

  function toggleEnabled() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("enabled", staffPoolEnabled ? "false" : "true");
    startTransition(async () => {
      const res = await setStaffPoolEnabledAction(fd);
      if (res.ok) {
        toast.success(
          staffPoolEnabled
            ? "오너 풀 접근을 잠갔어요."
            : "오너에게 풀 화면을 열었어요.",
        );
        onDone();
      } else toast.error(res.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink-2">수주액 · 실비 (공급가)</h2>
        {isAdmin ? (
          <button
            type="button"
            onClick={toggleEnabled}
            disabled={busy}
            className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
          >
            오너 접근 {staffPoolEnabled ? "열림" : "잠김"}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-3">
            수주액 (부가세 제외)
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
          <span className="text-[11px] font-medium text-ink-3">
            비인건 실비 (대관·물품)
          </span>
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
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="self-start rounded-xl border border-border px-4 py-2 text-xs font-semibold text-ink-2 active:bg-secondary disabled:opacity-50"
      >
        저장
      </button>
    </section>
  );
}

function PoolRowCard({
  projectId,
  row,
  busy,
  startTransition,
  onDone,
}: {
  projectId: string;
  row: PoolRow;
  busy: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(formatWonInput(row.grossAmount));
  const [vat, setVat] = useState(formatWonInput(row.vatAmount));
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const locked = row.status !== "pending" && row.status !== "cancelled";
  const invoice = row.payeeTaxMode === "invoice";

  const grossNum = Number(amount.replace(/[^\d]/g, "") || 0);
  const vatNum = invoice
    ? Number(vat.replace(/[^\d]/g, "") || 0)
    : 0;
  const payout = calcPayout({
    gross: grossNum,
    rate: row.rate,
    taxMode: invoice ? "invoice" : "withholding",
    vatAmount: vatNum,
  });

  function save() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", row.dancerId);
    fd.set("role", row.role);
    fd.set("gross_amount", amount);
    if (invoice) fd.set("vat_amount", vat);
    startTransition(async () => {
      const res = await setStaffSettlementAction(fd);
      if (res.ok) {
        toast.success("분배 금액을 저장했어요.");
        onDone();
      } else toast.error(res.error);
    });
  }

  function cancel() {
    if (!window.confirm(`${row.name}님 ${settlementRoleLabel(row.role)} 건을 취소할까요?`))
      return;
    const fd = new FormData();
    fd.set("settlement_id", row.id);
    startTransition(async () => {
      const res = await cancelSettlementAction(fd);
      if (res.ok) {
        toast.success("취소했어요.");
        onDone();
      } else toast.error(res.error);
    });
  }

  function toggleInvoiceReceived() {
    const fd = new FormData();
    fd.set("settlement_id", row.id);
    fd.set("received", row.taxInvoiceReceived ? "false" : "true");
    startTransition(async () => {
      const res = await setTaxInvoiceReceivedAction(fd);
      if (res.ok) {
        toast.success(
          row.taxInvoiceReceived
            ? "세금계산서 수취를 취소했어요."
            : "세금계산서 수취를 기록했어요 — 이제 이체할 수 있어요.",
        );
        onDone();
      } else toast.error(res.error);
    });
  }

  function issueLink() {
    const fd = new FormData();
    fd.set("dancer_id", row.dancerId);
    startTransition(async () => {
      const res = await issuePayeeCollectTokenAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await navigator.clipboard.writeText(res.data!.url).catch(() => {});
      toast.success("지급정보 수집 링크를 복사했어요 (7일 · 1회용).");
    });
  }

  function requestWithdraw() {
    const amt = withdrawAmount.replace(/[^\d]/g, "");
    if (!amt) {
      toast.error("대리 출금할 금액을 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", row.dancerId);
    fd.set("amount", amt);
    fd.set("reason", `${settlementRoleLabel(row.role)} 지급 — 풀 화면 대리 신청`);
    startTransition(async () => {
      const res = await adminRequestWithdrawalAction(fd);
      if (res.ok) {
        toast.success("대리 출금을 신청했어요. 이체파일에서 처리하세요.");
        setWithdrawAmount("");
        onDone();
      } else toast.error(res.error);
    });
  }

  return (
    <li className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{row.name}</span>
          <div className="flex flex-wrap items-center gap-1">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-ink-2">
              {settlementRoleLabel(row.role)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                invoice
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-secondary text-ink-2"
              }`}
            >
              {invoice ? "사업자 (부가세 포함 지급)" : "3.3% 원천징수"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                row.payoutReady
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              지급정보 {row.payoutReady ? "완비" : "미비"}
            </span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
          {settlementStageLabel(row.status, row.grossAmount)}
        </span>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-ink-3">
            분배 금액 (세전{invoice ? " · 공급가" : ""})
          </span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              const v = formatWonInput(e.target.value);
              setAmount(v);
              // 사업자 기본 부가세 10% 자동 제안(수정 가능, 면세는 0).
              if (invoice) {
                const g = Number(v.replace(/[^\d]/g, "") || 0);
                setVat(formatWonInput(Math.round(g * 0.1)));
              }
            }}
            placeholder="원"
            disabled={busy || locked}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </label>
        {invoice ? (
          <label className="flex w-28 flex-col gap-1">
            <span className="text-[11px] font-medium text-ink-3">부가세</span>
            <input
              inputMode="numeric"
              value={vat}
              onChange={(e) => setVat(formatWonInput(e.target.value))}
              placeholder="0"
              disabled={busy || locked}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
          </label>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={busy || locked}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
        >
          저장
        </button>
      </div>

      {grossNum > 0 ? (
        <p className="text-[11px] text-ink-3">
          {invoice
            ? `이체액 ${formatWon(payout.transfer)} = 공급가 ${formatWon(payout.gross)} + 부가세 ${formatWon(payout.vat)} · 풀 차감은 공급가만`
            : `세금 ${(row.rate * 100).toFixed(1)}%(−${formatWon(payout.tax)}) 공제 → 실수령 ${formatWon(payout.transfer)}`}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline-2 pt-2">
        <span className="text-[11px] text-ink-3">
          잔액 {formatWon(row.balance)}
          <span className="text-ink-3/70"> · 전체 잔액(프로젝트 미귀속 참고값)</span>
        </span>
        {invoice && row.grossAmount ? (
          <button
            type="button"
            onClick={toggleInvoiceReceived}
            disabled={busy || row.status !== "pending"}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium active:opacity-80 disabled:opacity-50 ${
              row.taxInvoiceReceived
                ? "bg-emerald-100 text-emerald-700"
                : "border border-border text-ink-2"
            }`}
          >
            세금계산서 {row.taxInvoiceReceived ? "수취됨 ✓" : "수취 기록"}
          </button>
        ) : null}
        {!row.hasAccount ? (
          <button
            type="button"
            onClick={issueLink}
            disabled={busy}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
          >
            수집 링크 발급
          </button>
        ) : null}
        {!locked || row.status === "cancelled" ? (
          <button
            type="button"
            onClick={cancel}
            disabled={busy || row.status === "cancelled"}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-rose-600 active:bg-secondary disabled:opacity-50"
          >
            취소
          </button>
        ) : null}
        {!row.hasAccount && row.balance > 0 && row.payoutReady ? (
          <span className="flex items-center gap-1">
            <input
              inputMode="numeric"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(formatWonInput(e.target.value))}
              placeholder="대리출금액"
              disabled={busy}
              className="w-28 rounded-lg border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={requestWithdraw}
              disabled={busy}
              className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
            >
              대리 출금
            </button>
          </span>
        ) : null}
      </div>
    </li>
  );
}

function AddPayeeSection({
  projectId,
  busy,
  startTransition,
  onDone,
}: {
  projectId: string;
  busy: boolean;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; name: string; taxMode: string; payoutReady: boolean }>
  >([]);
  const [role, setRole] = useState<"staff" | "referral">("staff");
  const [showOneOff, setShowOneOff] = useState(false);
  const [oneOffName, setOneOffName] = useState("");
  const [oneOffTax, setOneOffTax] = useState<"withholding" | "invoice">(
    "withholding",
  );
  const [oneOffBrn, setOneOffBrn] = useState("");

  function search() {
    if (!q.trim()) return;
    startTransition(async () => {
      const res = await searchPayeesAction(projectId, q);
      if (res.ok) setResults(res.data!.payees);
      else toast.error(res.error);
    });
  }

  function addExisting(dancerId: string, name: string) {
    const gross = window.prompt(
      `${name}님 ${settlementRoleLabel(role)} 세전 금액(원)을 입력하세요.`,
    );
    if (!gross) return;
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", dancerId);
    fd.set("role", role);
    fd.set("gross_amount", gross);
    startTransition(async () => {
      const res = await setStaffSettlementAction(fd);
      if (res.ok) {
        toast.success(`${name}님을 분배 명단에 올렸어요.`);
        setResults([]);
        setQ("");
        onDone();
      } else toast.error(res.error);
    });
  }

  function createOneOff() {
    if (!oneOffName.trim()) {
      toast.error("수취인 이름을 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("name", oneOffName);
    fd.set("tax_mode", oneOffTax);
    if (oneOffBrn.trim()) fd.set("business_registration_number", oneOffBrn);
    startTransition(async () => {
      const res = await createOneOffPayeeAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("일회성 수취인을 만들었어요. 금액을 입력해 주세요.");
      addExisting(res.data!.dancerId, oneOffName);
      setShowOneOff(false);
      setOneOffName("");
      setOneOffBrn("");
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-bold text-ink-2">수취인 추가</h2>
      <div className="flex items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "staff" | "referral")}
          disabled={busy}
          className="rounded-xl border border-border bg-background px-2 py-2 text-sm outline-none"
        >
          <option value="staff">스태프</option>
          <option value="referral">소개비</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
          placeholder="이름·활동명 검색 (비활성 수취인 포함)"
          disabled={busy}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={search}
          disabled={busy}
          className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-ink-2 active:bg-secondary disabled:opacity-50"
        >
          검색
        </button>
      </div>
      {results.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {results.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {r.name}
                <span className="ml-1.5 text-[11px] text-ink-3">
                  {r.taxMode === "invoice" ? "사업자" : "3.3%"} ·{" "}
                  {r.payoutReady ? "지급정보 완비" : "지급정보 미비"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => addExisting(r.id, r.name)}
                disabled={busy}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
              >
                추가
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setShowOneOff((v) => !v)}
        className="self-start text-xs font-semibold text-primary underline"
      >
        {showOneOff ? "닫기" : "+ 일회성 수취인 만들기 (계정 없음 — 소개자·업체)"}
      </button>
      {showOneOff ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
          <input
            value={oneOffName}
            onChange={(e) => setOneOffName(e.target.value)}
            placeholder="이름 또는 업체명"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex items-center gap-2">
            <select
              value={oneOffTax}
              onChange={(e) =>
                setOneOffTax(e.target.value as "withholding" | "invoice")
              }
              disabled={busy}
              className="rounded-xl border border-border bg-card px-2 py-2 text-sm outline-none"
            >
              <option value="withholding">개인 (3.3% 원천징수)</option>
              <option value="invoice">사업자 (세금계산서·부가세 포함)</option>
            </select>
            {oneOffTax === "invoice" ? (
              <input
                inputMode="numeric"
                value={oneOffBrn}
                onChange={(e) => setOneOffBrn(e.target.value)}
                placeholder="사업자등록번호 10자리"
                disabled={busy}
                className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={createOneOff}
            disabled={busy}
            className="self-start rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
          >
            만들고 금액 입력
          </button>
          <p className="text-[11px] text-ink-3">
            공개 목록·검색에 노출되지 않는 정산 전용 수취인이에요. 계좌·주민번호
            (사업자는 사업자번호)는 ‘수집 링크 발급’으로 본인에게 받아요.
          </p>
        </div>
      ) : null}
    </section>
  );
}
