"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { formatWon } from "@/lib/settlement";
import { PAYOUT_RULE_LINE } from "@/lib/payout-schedule";

// "내 돈이 지금 어디에 있는가" 요약 4칸 + 지급 주기 안내.
// 금액 기준: 출금 가능·지급 처리 중·받은 정산 = 전부 세후(실수령).
// 정산 확정 대기만 금액 미정이라 건수로 보여준다.
export function SettlementSummary({
  awaitingCount,
  availableTotal,
  processingTotal,
  processingCount,
  nextPayoutLabel,
  receivedByYear,
  currentYear,
}: {
  awaitingCount: number;
  availableTotal: number;
  processingTotal: number;
  processingCount: number;
  nextPayoutLabel: string;
  receivedByYear: Record<number, number>;
  currentYear: number;
}) {
  const years = [
    ...new Set([currentYear, ...Object.keys(receivedByYear).map(Number)]),
  ].sort((a, b) => b - a);
  const [year, setYear] = useState(currentYear);
  const received = receivedByYear[year] ?? 0;

  return (
    <section className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
          <span className="text-[11px] font-medium text-ink-3">
            정산 확정 대기
          </span>
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            {awaitingCount}건
          </span>
          <span className="text-[10px] text-ink-3">금액 확정 전</span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card p-4">
          <span className="text-[11px] font-medium text-ink-3">출금 가능</span>
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            {formatWon(availableTotal)}
          </span>
          <span className="text-[10px] text-ink-3">
            세후 잔액 · 아래에서 신청
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
          <span className="text-[11px] font-medium text-ink-3">
            지급 처리 중
          </span>
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            {formatWon(processingTotal)}
          </span>
          <span className="text-[10px] text-ink-3">
            {processingCount > 0
              ? `${processingCount}건 · ${nextPayoutLabel} 입금 예정`
              : "처리 중인 신청 없음"}
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-medium text-ink-3">
              받은 정산
            </span>
            {years.length > 1 ? (
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="받은 정산 연도 선택"
                className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-ink-2 outline-none focus:border-primary"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[10px] text-ink-3">{year}년</span>
            )}
          </div>
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            {formatWon(received)}
          </span>
          <span className="text-[10px] text-ink-3">입금완료 실수령 기준</span>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5">
        <CalendarClock size={15} className="shrink-0 text-ink-3" aria-hidden />
        <p className="text-[11px] leading-relaxed text-ink-3">
          {PAYOUT_RULE_LINE} 다음 지급일{" "}
          <span className="font-semibold text-foreground">
            {nextPayoutLabel}
          </span>
        </p>
      </div>
    </section>
  );
}
