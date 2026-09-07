"use client";

import { useState } from "react";
import { costMetricsAction } from "@/app/actions/campaign-results";
import type { Summary } from "@/lib/campaign/types";
import { number } from "@/components/campaign/ResultsReport";
import { buttonClass, ErrorText, inputClass, useAction } from "./Controls";
export function CostPanel({
  projectId,
  supplyAmount,
  summary,
}: {
  projectId: string;
  supplyAmount: number;
  summary: Summary;
}) {
  const [amount, setAmount] = useState(supplyAmount),
    action = useAction();
  const interactions =
    summary.likes.sum + summary.comments.sum + summary.shares.sum;
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h2 className="font-semibold">비용 · 정산 확정 전 잠정</h2>
      <form
        action={(f) =>
          action.run(
            () => costMetricsAction(projectId, Number(f.get("amount"))),
            (d) => {
              if ("supplyAmount" in d && typeof d.supplyAmount === "number")
                setAmount(d.supplyAmount);
            },
          )
        }
      >
        <label>
          수동 공급가{" "}
          <input
            name="amount"
            type="number"
            min="0"
            defaultValue={amount}
            className={inputClass}
          />
        </label>
        <button className={buttonClass} disabled={action.pending}>
          계산
        </button>
      </form>
      <p>
        공급가 {number(amount)}원 · 재생당{" "}
        {number(summary.plays.sum ? amount / summary.plays.sum : null)}원 ·
        게시물당 {number(summary.posts ? amount / summary.posts : null)}원 ·
        확인 상호작용당 {number(interactions ? amount / interactions : null)}원
      </p>
      <p className="text-sm text-ink-3">
        확인 상호작용은 확인된 좋아요·댓글·공유의 합계입니다.
      </p>
      <ErrorText error={action.error} />
    </section>
  );
}
