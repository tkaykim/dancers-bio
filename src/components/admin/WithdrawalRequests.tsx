"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  buildTransferFileAction,
  markSettlementPaidAction,
  markSettlementsPaidAction,
  setSettlementAmountAction,
  savePayoutAccountAction,
  saveResidentNumberAction,
  sendWithdrawalRequestEmailAction,
} from "@/app/actions/settlements";
import { DancerDocuments } from "@/components/settlement/DancerDocuments";
import { BankPicker } from "@/components/settlement/BankPicker";
import { matchBank, type Bank } from "@/lib/banks";
import { Drawer } from "@/components/ui/drawer";
import {
  calcSettlement,
  formatWon,
  SETTLEMENT_STATUS_LABEL,
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
  residentNumber: string | null;
  hasIdCard: boolean;
  hasBankbook: boolean;
};

const STATUS_TONE: Record<SettlementStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  requested: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-secondary text-ink-3",
};

export function WithdrawalRequests({ rows }: { rows: WithdrawalRow[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkBusy, startBulk] = useTransition();
  const requested = rows.filter((r) => r.status === "requested");
  const awaiting = rows.filter((r) => r.status === "pending");
  const paid = rows.filter((r) => r.status === "paid");
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  // 입금완료로 넘길 수 있는 건(아직 미지급 + 계좌 등록됨)만 선택 대상.
  const payableById = new Map(
    rows
      .filter(
        (r) =>
          r.status !== "paid" &&
          !!(r.bankName && r.accountNumber && r.accountHolder),
      )
      .map((r) => [r.id, r]),
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 단건 입금완료 (리스트 행 빠른 처리)
  function markOne(r: WithdrawalRow) {
    const calc = calcSettlement(r.grossAmount, r.rate);
    if (
      !confirm(
        `${r.dancerName}님 ${formatWon(calc.net)} 입금완료로 처리할까요?\n실제 통장 이체를 마친 뒤 눌러 주세요.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("settlement_id", r.id);
    startBulk(async () => {
      const res = await markSettlementPaidAction(fd);
      if (res.ok) {
        toast.success(`${r.dancerName} 입금완료 처리했어요.`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  // 선택 건 → 우리은행 다계좌이체 파일(.xls) 다운로드.
  // 다운로드 후 사람이 우리WON비즈에 업로드·OTP 승인 → 그 다음 '일괄 입금완료'로 기록.
  function downloadTransferFile() {
    const ids = [...checked].filter((id) => payableById.has(id));
    if (ids.length === 0) return;
    const fd = new FormData();
    fd.set("ids", JSON.stringify(ids));
    startBulk(async () => {
      const res = await buildTransferFileAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { filename, base64, included, skipped } = res.data!;
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.ms-excel" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `다계좌이체 파일 ${included}건 생성${skipped > 0 ? ` · ${skipped}건 제외(계좌 미등록/입금완료)` : ""}`,
      );
    });
  }

  // 일괄 입금완료
  function markBulk() {
    const ids = [...checked].filter((id) => payableById.has(id));
    if (ids.length === 0) return;
    if (
      !confirm(
        `선택한 ${ids.length}명을 입금완료로 처리할까요?\n실제 이체를 모두 마친 뒤 눌러 주세요.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("ids", JSON.stringify(ids));
    startBulk(async () => {
      const res = await markSettlementsPaidAction(fd);
      if (res.ok) {
        toast.success(`${res.data?.updated ?? ids.length}명 입금완료 처리했어요.`);
        setChecked(new Set());
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {checked.size > 0 ? (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold">{checked.size}명 선택됨</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChecked(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs text-ink-2 hover:bg-secondary"
            >
              해제
            </button>
            <button
              type="button"
              onClick={downloadTransferFile}
              disabled={bulkBusy}
              className="rounded-lg border border-primary/40 bg-card px-4 py-1.5 text-xs font-semibold text-primary disabled:opacity-50"
            >
              다계좌이체 파일
            </button>
            <button
              type="button"
              onClick={markBulk}
              disabled={bulkBusy}
              className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {bulkBusy ? "처리 중…" : "일괄 입금완료"}
            </button>
          </div>
        </div>
      ) : null}

      <Section title="출금신청" count={requested.length} empty="처리할 출금 신청이 없어요.">
        {requested.map((r) => (
          <Row
            key={r.id}
            row={r}
            onOpen={() => setSelectedId(r.id)}
            payable={payableById.has(r.id)}
            checked={checked.has(r.id)}
            onToggle={() => toggle(r.id)}
            onMarkPaid={() => markOne(r)}
            busy={bulkBusy}
          />
        ))}
      </Section>

      {awaiting.length > 0 ? (
        <Section title="정산완료 · 출금신청 전" count={awaiting.length}>
          {awaiting.map((r) => (
            <Row
              key={r.id}
              row={r}
              onOpen={() => setSelectedId(r.id)}
              payable={payableById.has(r.id)}
              checked={checked.has(r.id)}
              onToggle={() => toggle(r.id)}
              onMarkPaid={() => markOne(r)}
              busy={bulkBusy}
            />
          ))}
        </Section>
      ) : null}

      {paid.length > 0 ? (
        <Section title="입금완료" count={paid.length}>
          {paid.map((r) => (
            <Row key={r.id} row={r} onOpen={() => setSelectedId(r.id)} />
          ))}
        </Section>
      ) : null}

      <Drawer
        open={selected !== null}
        onOpenChange={(o) => !o && setSelectedId(null)}
        title={selected?.dancerName ?? "정산"}
      >
        {selected ? (
          <SettlementDetail row={selected} onClose={() => setSelectedId(null)} />
        ) : null}
      </Drawer>
    </div>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold text-ink-2">
        {title} ({count})
      </h2>
      {count === 0 && empty ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
          {empty}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {children}
        </ul>
      )}
    </section>
  );
}

function Row({
  row,
  onOpen,
  payable,
  checked,
  onToggle,
  onMarkPaid,
  busy,
}: {
  row: WithdrawalRow;
  onOpen: () => void;
  payable?: boolean;
  checked?: boolean;
  onToggle?: () => void;
  onMarkPaid?: () => void;
  busy?: boolean;
}) {
  const calc = calcSettlement(row.grossAmount, row.rate);
  const hasAccount = !!(row.bankName && row.accountNumber && row.accountHolder);
  const docCount = (row.hasIdCard ? 1 : 0) + (row.hasBankbook ? 1 : 0);
  return (
    <li
      className={`flex items-center gap-2 border-b border-hairline-2 px-3 last:border-b-0 ${
        checked ? "bg-primary/5" : ""
      }`}
    >
      {payable ? (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={onToggle}
          aria-label="선택"
          className="size-4 shrink-0 accent-primary"
        />
      ) : null}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left transition-colors hover:bg-secondary/40"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{row.dancerName}</span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_TONE[row.status]}`}
            >
              {SETTLEMENT_STATUS_LABEL[row.status]}
            </span>
          </div>
          <span className="truncate text-xs text-ink-3">{row.projectTitle}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <ReadyChip ok={hasAccount} label="계좌" />
            <ReadyChip ok={!!row.residentNumber} label="주민번호" />
            <ReadyChip ok={docCount === 2} label={`서류 ${docCount}/2`} partial={docCount === 1} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-sm font-bold">{formatWon(calc.net)}</span>
          <span className="text-[10px] text-ink-3">실수령</span>
        </div>
      </button>
      {payable && onMarkPaid ? (
        <button
          type="button"
          onClick={onMarkPaid}
          disabled={busy}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
        >
          입금완료
        </button>
      ) : (
        <span className="shrink-0 text-ink-3">›</span>
      )}
    </li>
  );
}

function ReadyChip({
  ok,
  label,
  partial,
}: {
  ok: boolean;
  label: string;
  partial?: boolean;
}) {
  const tone = ok
    ? "bg-emerald-50 text-emerald-700"
    : partial
      ? "bg-amber-50 text-amber-700"
      : "bg-secondary text-ink-3";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
      {ok ? "✓ " : ""}
      {label}
    </span>
  );
}

function SettlementDetail({
  row,
  onClose,
}: {
  row: WithdrawalRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const calc = calcSettlement(row.grossAmount, row.rate);
  const hasAccount = !!(row.bankName && row.accountNumber && row.accountHolder);

  function markPaid() {
    const fd = new FormData();
    fd.set("settlement_id", row.id);
    startTransition(async () => {
      const res = await markSettlementPaidAction(fd);
      if (res.ok) {
        toast.success(`${row.dancerName} 이체 완료 처리했어요.`);
        onClose();
        router.refresh();
      } else {
        toast.error(res.error);
        setConfirming(false);
      }
    });
  }

  function sendMail() {
    const fd = new FormData();
    fd.set("settlement_id", row.id);
    startTransition(async () => {
      const res = await sendWithdrawalRequestEmailAction(fd);
      if (res.ok) {
        toast.success(`${row.dancerName}에게 출금신청 안내 메일을 보냈어요.`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-3">{row.projectTitle}</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[row.status]}`}
        >
          {SETTLEMENT_STATUS_LABEL[row.status]}
        </span>
      </div>

      <SettlementAdminControls row={row} />

      {row.status === "requested" ? (
        <span className="text-[11px] text-ink-3">신청 {fmtDate(row.requestedAt)}</span>
      ) : null}

      {/* 핵심 액션: 입금완료 처리 — 정산완료·출금신청 공통 */}
      {row.status !== "paid" ? (
        confirming ? (
          <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
            <p className="text-xs text-amber-800">
              실제로 통장에서 {formatWon(calc.net)}을 이체하셨나요? 입금완료로
              기록되며 댄서 화면도 입금완료로 바뀝니다.
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
                {busy ? "처리 중…" : "네, 입금완료"}
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
            {hasAccount ? "입금완료 처리" : "계좌 등록 후 처리 가능"}
          </button>
        )
      ) : null}

      {/* 보조: 정산완료면 댄서에게 출금신청 안내 메일(선택) */}
      {row.status === "pending" ? (
        <button
          type="button"
          onClick={sendMail}
          disabled={busy || !hasAccount}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
        >
          {busy ? "처리 중…" : "출금신청 안내 메일 보내기 (선택)"}
        </button>
      ) : null}

      {row.status === "paid" ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {fmtDate(row.paidAt)} 입금완료 — {formatWon(calc.net)}
        </p>
      ) : null}
    </div>
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
  const [revealAcct, setRevealAcct] = useState(false);
  const [bank, setBank] = useState<Bank | null>(matchBank(row.bankName));
  const [acctNo, setAcctNo] = useState(row.accountNumber ?? "");
  const [holder, setHolder] = useState(row.accountHolder ?? "");

  const hasRrn = !!row.residentNumber;
  const [editRrn, setEditRrn] = useState(!hasRrn);
  const [revealRrn, setRevealRrn] = useState(false);
  const [rrn, setRrn] = useState(row.residentNumber ?? "");

  function saveRrn() {
    if (!rrn.trim()) {
      toast.error("주민(외국인)등록번호를 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", row.dancerId);
    fd.set("resident_registration_number", rrn);
    startTransition(async () => {
      const res = await saveResidentNumberAction(fd);
      if (res.ok) {
        toast.success("주민등록번호를 저장했어요.");
        setEditRrn(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

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
    if (!bank || !acctNo.trim() || !holder.trim()) {
      toast.error("은행·계좌번호·예금주를 모두 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", row.dancerId);
    fd.set("bank_name", bank.transfer);
    fd.set("bank_code", bank.code);
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
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {row.bankName}{" "}
                {revealAcct ? row.accountNumber : maskAcct(row.accountNumber ?? "")}
              </span>
              <span className="text-[11px] text-ink-3">예금주 {row.accountHolder}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <EyeToggle on={revealAcct} onClick={() => setRevealAcct((v) => !v)} />
              <button
                type="button"
                onClick={() => setEditAcct(true)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink-2 active:bg-secondary"
              >
                수정
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <BankPicker value={bank} onChange={setBank} disabled={busy} />
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

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-ink-3">
          주민(외국인)등록번호
        </span>
        {!editRrn && hasRrn ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
            <span className="truncate text-sm font-medium tabular-nums">
              {revealRrn ? row.residentNumber : maskRrn(row.residentNumber ?? "")}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <EyeToggle on={revealRrn} onClick={() => setRevealRrn((v) => !v)} />
              <button
                type="button"
                onClick={() => setEditRrn(true)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink-2 active:bg-secondary"
              >
                수정
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <input
              inputMode="numeric"
              value={rrn}
              onChange={(e) => setRrn(e.target.value)}
              placeholder="앞 6자리-뒤 7자리"
              disabled={busy}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <button
              type="button"
              onClick={saveRrn}
              disabled={busy}
              className="h-9 shrink-0 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              저장
            </button>
            {hasRrn ? (
              <button
                type="button"
                onClick={() => setEditRrn(false)}
                disabled={busy}
                className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs text-ink-2"
              >
                취소
              </button>
            ) : null}
          </div>
        )}
      </div>

      <DancerDocuments
        dancerId={row.dancerId}
        dancerName={row.dancerName}
        showName={false}
        docs={{ idCard: row.hasIdCard, bankbook: row.hasBankbook }}
        compact
      />
    </div>
  );
}

function EyeToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={on ? "가리기" : "전체 보기"}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-2 active:bg-secondary"
    >
      {on ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
    </button>
  );
}

function maskAcct(s: string): string {
  const t = s.replace(/\s/g, "");
  if (t.length <= 4) return t;
  return `${t.slice(0, 3)}${"*".repeat(Math.max(2, t.length - 6))}${t.slice(-3)}`;
}

function maskRrn(s: string): string {
  const d = s.replace(/\D/g, "");
  if (d.length < 7) return "*".repeat(d.length || 6);
  return `${d.slice(0, 6)}-${d.slice(6, 7)}******`;
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
