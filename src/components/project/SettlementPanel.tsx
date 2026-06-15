"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setSettlementAmountAction } from "@/app/actions/settlements";
import {
  calcSettlement,
  formatWon,
  SETTLEMENT_STATUS_LABEL,
  type SettlementStatus,
} from "@/lib/settlement";

export type SettlementApplicant = {
  dancerId: string;
  name: string;
  grossAmount: number | null;
  status: SettlementStatus | null;
};

export function SettlementPanel({
  projectId,
  applicants,
}: {
  projectId: string;
  applicants: SettlementApplicant[];
}) {
  if (applicants.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-sm text-ink-3">
        합격(수락) 처리된 댄서가 있어야 정산금액을 등록할 수 있어요.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-bold">정산금액 등록</h3>
        <p className="text-xs text-ink-3">
          합격 댄서별 세전 금액을 입력하세요. 댄서 화면에 원천징수 3.3%를 뺀 실수령액과
          함께 표시되고, 댄서가 출금 신청하면 관리자 정산 화면에서 확인할 수 있어요.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-hairline-2">
        {applicants.map((a) => (
          <SettlementRow key={a.dancerId} projectId={projectId} applicant={a} />
        ))}
      </ul>
    </div>
  );
}

function SettlementRow({
  projectId,
  applicant,
}: {
  projectId: string;
  applicant: SettlementApplicant;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [value, setValue] = useState(
    applicant.grossAmount != null ? String(applicant.grossAmount) : "",
  );

  const locked = applicant.status === "paid";
  const num = Number(value.replace(/[,\s]/g, ""));
  const preview =
    Number.isFinite(num) && num > 0 ? calcSettlement(num) : null;

  function save() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", applicant.dancerId);
    fd.set("gross_amount", value);
    startTransition(async () => {
      const res = await setSettlementAmountAction(fd);
      if (res.ok) {
        toast.success(`${applicant.name} 정산금액을 저장했어요.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{applicant.name}</span>
        {applicant.status ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-ink-2">
            {SETTLEMENT_STATUS_LABEL[applicant.status]}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="세전 금액 (원)"
            disabled={locked || busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={locked || busy || !value.trim()}
          className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors active:opacity-80 disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
      {preview ? (
        <p className="text-xs text-ink-3">
          세전 {formatWon(preview.gross)} · 원천징수 3.3% −{formatWon(preview.tax)} ·{" "}
          <span className="font-semibold text-foreground">
            실수령 {formatWon(preview.net)}
          </span>
        </p>
      ) : null}
      {locked ? (
        <p className="text-xs text-ink-3">입금완료된 건은 수정할 수 없어요.</p>
      ) : null}
    </li>
  );
}
