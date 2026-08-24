"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { AddSettlementDancer } from "@/components/settlement/AddSettlementDancer";
import { setSettlementAmountsBulkAction } from "@/app/actions/settlements";
import {
  setSettlementCollectionAction,
  setProjectFinanceAction,
  setSettlementAmountAction,
} from "@/app/actions/settlements";
import {
  calcSettlement,
  formatWon,
  formatWonInput,
  settlementRoleLabel,
  settlementStageLabel,
  type SettlementStatus,
} from "@/lib/settlement";

export type OwnerSettlementRow = {
  id: string;
  dancerId: string;
  dancerName: string;
  role: string;
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
  // GRIGO 화이트라벨 수집 링크 base. 넘기면 GRIGO 도메인 링크 복사 행이 추가된다.
  grigoUrlBase,
  clientRevenue,
  expenseAmount,
  rows,
}: {
  projectId: string;
  collectCode: string | null;
  collectionOpen: boolean;
  collectUrlBase: string;
  grigoUrlBase?: string;
  clientRevenue: number | null;
  expenseAmount: number | null;
  rows: OwnerSettlementRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [copiedGrigo, setCopiedGrigo] = useState(false);
  // 금액 입력값을 상위에서 보관한다. 단건 저장마다 화면이 새로 그려지면서
  // 나머지 입력이 날아가던 문제를 없애고, 일괄 입력·일괄 저장이 같은 값을 공유한다.
  // 키는 settlement id — 겸직(한 사람이 출연료+스태프비)에서 dancerId 키는 서로 덮어쓴다.
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, formatWonInput(r.grossAmount)])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAmount, setBulkAmount] = useState("");
  // 사용자가 실제로 건드린 칸. 서버 갱신이 입력 중인 값을 덮어쓰지 않게 한다.
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  // 서버 목록이 바뀌면(추가·저장·상태변경) 손대지 않은 칸만 서버값으로 맞춘다.
  // status도 키에 넣어야 다른 탭에서 출금신청이 들어온 경우 잠금이 반영된다.
  const rowsKey = rows
    .map((r) => `${r.id}:${r.grossAmount ?? ""}:${r.status}`)
    .join("|");
  useEffect(() => {
    setAmounts((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!dirtyIds.has(r.id)) next[r.id] = formatWonInput(r.grossAmount);
      }
      return next;
    });
    setSelected((prev) => {
      // 목록에서 사라졌거나 잠긴 행은 선택에서 뺀다.
      const usable = new Set(
        rows
          .filter(
            (r) =>
              r.status !== "paid" &&
              r.status !== "requested" &&
              r.status !== "cancelled",
          )
          .map((r) => r.id),
      );
      const next = new Set([...prev].filter((id) => usable.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // rowsKey로 서버 목록 변화만 추적한다(rows 배열은 매 렌더 새 참조라 제외).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  function setAmountFor(settlementId: string, v: string) {
    setAmounts((prev) => ({ ...prev, [settlementId]: v }));
    setDirtyIds((prev) => new Set(prev).add(settlementId));
  }

  const editableRows = rows.filter(
    (r) => r.status !== "paid" && r.status !== "requested" && r.status !== "cancelled",
  );
  const allSelected =
    editableRows.length > 0 && editableRows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(editableRows.map((r) => r.id)));
  }

  function applyBulkAmount() {
    const v = formatWonInput(bulkAmount);
    if (!v) {
      toast.error("일괄 입력할 금액을 넣어 주세요.");
      return;
    }
    if (selected.size === 0) {
      toast.error("적용할 댄서를 선택해 주세요.");
      return;
    }
    setAmounts((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = v;
      return next;
    });
    setDirtyIds((prev) => new Set([...prev, ...selected]));
    toast.success(`${selected.size}명에 ${v}원을 입력했어요. 저장을 눌러 주세요.`);
  }

  // 화면에 입력된 값 중 서버와 다른 것만 모아 한 번에 저장한다.
  function saveAll() {
    const entries = editableRows
      .filter((r) => {
        if (!dirtyIds.has(r.id)) return false;
        const v = (amounts[r.id] ?? "").trim();
        return v !== "" && v !== formatWonInput(r.grossAmount);
      })
      .map((r) => ({ settlementId: r.id, amount: amounts[r.id] }));
    if (entries.length === 0) {
      toast.message("저장할 변경 사항이 없어요.");
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("entries", JSON.stringify(entries));
    startTransition(async () => {
      const res = await setSettlementAmountsBulkAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { saved, failures } = res.data!;
      if (failures.length > 0) {
        // 실패가 있으면 선택·입력을 그대로 둔다 — 다시 고르게 만들면 안 된다.
        toast.error(
          saved > 0
            ? `${saved}명 저장, ${failures.length}명 실패 — ${failures[0].error}`
            : `저장하지 못했어요 — ${failures[0].error}`,
        );
        if (saved > 0) router.refresh();
        return;
      }
      toast.success(`${saved}명의 정산 금액을 저장했어요.`);
      setSelected(new Set());
      setBulkAmount("");
      setDirtyIds(new Set());
      router.refresh();
    });
  }

  const totalGross = rows.reduce((sum, r) => sum + (r.grossAmount ?? 0), 0);
  const margin =
    clientRevenue != null
      ? clientRevenue - totalGross - (expenseAmount ?? 0)
      : null;
  const collectUrl = collectCode ? `${collectUrlBase}${collectCode}` : null;
  const grigoUrl =
    collectCode && grigoUrlBase ? `${grigoUrlBase}${collectCode}` : null;

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

  function copyGrigoLink() {
    if (!grigoUrl) return;
    navigator.clipboard.writeText(grigoUrl).then(
      () => {
        setCopiedGrigo(true);
        toast.success("GRIGO 수집 링크를 복사했어요.");
        setTimeout(() => setCopiedGrigo(false), 1500);
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
            {grigoUrl ? (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-ink-3">
                  GRIGO 명의 링크 (그리고엔터 소속 프로젝트용 — 같은 폼, 회사 도메인)
                </span>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {grigoUrl}
                  </span>
                  <button
                    type="button"
                    onClick={copyGrigoLink}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-ink-2 active:bg-secondary"
                    aria-label="GRIGO 링크 복사"
                  >
                    {copiedGrigo ? (
                      <Check size={15} className="text-primary" aria-hidden />
                    ) : (
                      <Copy size={15} aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            ) : null}
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

      {/* 3) 참여 댄서 직접 추가 — 이미 섭외가 끝난 건을 정산만 기입하는 경로 */}
      <AddSettlementDancer projectId={projectId} />

      {/* 4) 댄서별 정산 */}
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
            아직 명단이 비어 있어요. 위에서 댄서를 직접 추가하거나, 수집 링크를
            보내 정산 정보를 받아 보세요.
          </div>
        ) : (
          <>
            {/* 여러 명 금액을 한 번에 넣고 한 번에 저장 — 7명짜리 프로젝트에서
                한 명씩 저장하면 화면이 새로 그려져 나머지 입력이 날아갔다. */}
            {editableRows.length > 1 ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-[var(--primary)]"
                    />
                    전체 선택 ({editableRows.length}명)
                  </label>
                  <span className="text-[11px] text-ink-3">
                    {selected.size > 0 ? `${selected.size}명 선택됨` : "선택 없음"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={bulkAmount}
                    onChange={(e) => setBulkAmount(formatWonInput(e.target.value))}
                    placeholder="선택한 인원에 넣을 금액 (원)"
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={applyBulkAmount}
                    disabled={busy}
                    className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-ink-2 active:bg-secondary disabled:opacity-50"
                  >
                    일괄 입력
                  </button>
                </div>
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={busy}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
                >
                  {busy ? "저장 중…" : "전체 저장"}
                </button>
                <p className="text-[11px] text-ink-3">
                  일괄 입력은 칸을 채우기만 해요. 개별로 고친 뒤 ‘전체 저장’을 누르면
                  바뀐 금액만 한 번에 저장됩니다.
                </p>
              </div>
            ) : null}
            <ul className="flex flex-col gap-3">
              {rows.map((r) => (
                <DancerRow
                  key={r.id}
                  projectId={projectId}
                  row={r}
                  busy={busy}
                  amount={amounts[r.id] ?? ""}
                  onAmountChange={(v) => setAmountFor(r.id, v)}
                  selected={selected.has(r.id)}
                  onToggle={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  startTransition={startTransition}
                  onDone={() => router.refresh()}
                />
              ))}
            </ul>
          </>
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
  amount,
  onAmountChange,
  selected,
  onToggle,
  startTransition,
  onDone,
}: {
  projectId: string;
  row: OwnerSettlementRow;
  busy: boolean;
  /** 금액은 상위에서 보관한다 — 일괄 입력·일괄 저장이 같은 값을 공유해야 하므로. */
  amount: string;
  onAmountChange: (v: string) => void;
  selected: boolean;
  onToggle: () => void;
  startTransition: (cb: () => void) => void;
  onDone: () => void;
}) {
  const locked = row.status === "paid" || row.status === "requested" || row.status === "cancelled";
  const calc =
    row.grossAmount != null ? calcSettlement(row.grossAmount, row.rate) : null;

  function save() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", row.dancerId);
    // 기존 행은 id로 특정한다 — 겸직(복수 role)에서 (project, dancer)는 유일하지 않다.
    fd.set("settlement_id", row.id);
    fd.set("role", row.role);
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
        <div className="flex flex-1 items-start gap-2.5">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            disabled={locked}
            aria-label={`${row.dancerName} 선택`}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)] disabled:opacity-40"
          />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{row.dancerName}</span>
          <div className="flex flex-wrap items-center gap-1">
            {row.role !== "dancer" ? (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-ink-2">
                {settlementRoleLabel(row.role)}
              </span>
            ) : null}
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
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
          {settlementStageLabel(row.status, row.grossAmount)}
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
            onChange={(e) => onAmountChange(formatWonInput(e.target.value))}
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
