"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatWon } from "@/lib/settlement";
import {
  buildBalanceTransferFileAction,
  markWithdrawalPaidAction,
  markWithdrawalsPaidBulkAction,
} from "@/app/actions/withdrawals";

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
//
// 처리 순서: 선택 → 다계좌이체 파일(.xls) 다운로드 → 우리WON비즈 업로드·OTP 승인
//          → 실제 이체 확인 → '일괄 입금완료'.
// ⚠ 파일을 받는 것만으로는 아무것도 차감되지 않는다. 잔액은 입금완료 시점에만 빠진다.
export function BalanceWithdrawalQueue({
  rows,
}: {
  rows: BalanceWithdrawalRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [bulkBusy, startBulk] = useTransition();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // 계좌가 없는 건은 이체 파일에 넣을 수 없으므로 선택 대상에서 뺀다.
  const payable = useMemo(
    () => rows.filter((r) => !doneIds.has(r.id) && !!r.accountNumber),
    [rows, doneIds],
  );
  const checkedIds = useMemo(
    () => payable.filter((r) => checked.has(r.id)).map((r) => r.id),
    [payable, checked],
  );
  const checkedTotal = useMemo(
    () =>
      payable
        .filter((r) => checked.has(r.id))
        .reduce((s, r) => s + r.amount, 0),
    [payable, checked],
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked((prev) =>
      prev.size === payable.length
        ? new Set()
        : new Set(payable.map((r) => r.id)),
    );
  }

  function downloadTransferFile() {
    if (checkedIds.length === 0) return;
    const fd = new FormData();
    fd.set("ids", JSON.stringify(checkedIds));
    startBulk(async () => {
      const res = await buildBalanceTransferFileAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { filename, base64, included, skipped, total } = res.data!;
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
        `다계좌이체 파일 ${included}건 · ${formatWon(total)}` +
          (skipped > 0 ? ` · ${skipped}건 제외(상태·계좌 확인)` : ""),
      );
    });
  }

  function markBulk() {
    if (checkedIds.length === 0) return;
    if (
      !window.confirm(
        `선택한 ${checkedIds.length}건(${formatWon(checkedTotal)})을 입금완료로 기록할까요?\n실제 이체를 모두 마친 뒤 눌러 주세요.\n확인을 누르면 각자의 잔액에서 차감됩니다.`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("ids", JSON.stringify(checkedIds));
    startBulk(async () => {
      const res = await markWithdrawalsPaidBulkAction(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { done, failed } = res.data!;
      setDoneIds((prev) => {
        const next = new Set(prev);
        checkedIds.forEach((id) => next.add(id));
        return next;
      });
      setChecked(new Set());
      if (failed > 0)
        toast.warning(`${done}건 완료 · ${failed}건 실패(새로고침 후 확인)`);
      else toast.success(`${done}건 입금완료로 기록했어요.`);
      router.refresh();
    });
  }

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
  const working = busy || bulkBusy;

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
        <>
          {payable.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3">
              <button
                type="button"
                onClick={toggleAll}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold active:opacity-80"
              >
                {checked.size === payable.length ? "선택 해제" : "전체 선택"}
              </button>
              <span className="text-xs text-ink-3">
                {checkedIds.length}건 선택 · {formatWon(checkedTotal)}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={downloadTransferFile}
                  disabled={working || checkedIds.length === 0}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-semibold active:opacity-80 disabled:opacity-50"
                >
                  다계좌이체 파일
                </button>
                <button
                  type="button"
                  onClick={markBulk}
                  disabled={working || checkedIds.length === 0}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
                >
                  일괄 입금완료
                </button>
              </div>
              <p className="w-full text-[11px] text-ink-3">
                파일을 받아 은행에 업로드·승인한 뒤, 실제 이체가 끝나면 &lsquo;일괄
                입금완료&rsquo;를 누르세요. 파일만 받는 것으로는 잔액이 차감되지
                않습니다.
              </p>
            </div>
          ) : null}

          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const done = doneIds.has(r.id);
              const selectable = !done && !!r.accountNumber;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={!selectable || working}
                      aria-label={`${r.dancerName} 선택`}
                      className="size-4 shrink-0 accent-[var(--color-primary)] disabled:opacity-30"
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-semibold">
                        {r.dancerName}
                      </span>
                      <span className="truncate text-[11px] text-ink-3">
                        {r.bankName ?? "은행 미등록"} {r.accountNumber ?? ""}
                        {r.accountHolder ? ` · ${r.accountHolder}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-bold">
                      {formatWon(r.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => markPaid(r.id, r.dancerName, r.amount)}
                      disabled={working || done}
                      className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
                    >
                      {done ? "완료" : "이체 완료 처리"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
