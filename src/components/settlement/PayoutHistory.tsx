"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatWon } from "@/lib/settlement";
import {
  kstDayLabel,
  type KstMonthGroup,
  type PayoutPeriod,
} from "@/lib/payout-schedule";

// 실제로 통장에 들어온 건 하나하나. 원천이 둘이다.
// - settlement: 구 경로(정산 건별 출금) — 세전·원천징수를 그대로 보여줄 수 있다.
// - balance: 잔액 출금 — 정산 확정 시점에 이미 3.3%가 빠진 세후 잔액에서
//   나가므로 이 시점의 세전·세금이 없다(있는 척하면 거짓말이 된다).
export type PayoutHistoryRow = {
  id: string;
  source: "settlement" | "balance";
  paidAt: string;
  amount: number;
  title: string;
  detail: string | null;
  gross: number | null;
  tax: number | null;
  vat: number | null;
  dancerName: string | null;
};

const SOURCE_LABEL: Record<PayoutHistoryRow["source"], string> = {
  settlement: "프로젝트 정산",
  balance: "잔액 출금",
};

const TAB_LABEL: Record<PayoutPeriod, string> = {
  month: "이번 달",
  year: "연도별",
  all: "전체",
  custom: "직접 선택",
};

const BASE = "/me/settlements/history";

function tabHref(period: PayoutPeriod, year: number): string {
  if (period === "year") return `${BASE}?period=year&year=${year}`;
  if (period === "custom") return `${BASE}?period=custom`;
  return `${BASE}?period=${period}`;
}

export function PayoutHistory({
  groups,
  total,
  count,
  period,
  year,
  years,
  from,
  to,
  periodLabel,
  showDancerName,
}: {
  groups: KstMonthGroup<PayoutHistoryRow>[];
  total: number;
  count: number;
  period: PayoutPeriod;
  year: number;
  years: number[];
  from: string | null;
  to: string | null;
  periodLabel: string;
  showDancerName: boolean;
}) {
  const router = useRouter();
  const [cFrom, setCFrom] = useState(from ?? "");
  const [cTo, setCTo] = useState(to ?? "");

  function applyCustom() {
    if (!cFrom && !cTo) return;
    const params = new URLSearchParams({ period: "custom" });
    if (cFrom) params.set("from", cFrom);
    if (cTo) params.set("to", cTo);
    router.push(`${BASE}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 기간 탭 */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["month", "year", "all", "custom"] as const).map((p) => {
            const active = period === p;
            return (
              <Link
                key={p}
                href={tabHref(p, year)}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-ink-2 hover:bg-secondary")
                }
              >
                {TAB_LABEL[p]}
              </Link>
            );
          })}
        </div>

        {period === "year" && years.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => (
              <Link
                key={y}
                href={`${BASE}?period=year&year=${y}`}
                aria-current={y === year ? "page" : undefined}
                className={
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors " +
                  (y === year
                    ? "bg-secondary text-foreground"
                    : "text-ink-3 hover:bg-secondary")
                }
              >
                {y}년
              </Link>
            ))}
          </div>
        ) : null}

        {period === "custom" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <input
              type="date"
              value={cFrom}
              max={cTo || undefined}
              onChange={(e) => setCFrom(e.target.value)}
              aria-label="조회 시작일"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-xs text-ink-3">~</span>
            <input
              type="date"
              value={cTo}
              min={cFrom || undefined}
              onChange={(e) => setCTo(e.target.value)}
              aria-label="조회 종료일"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={applyCustom}
              disabled={!cFrom && !cTo}
              className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              적용
            </button>
            <span className="text-[11px] text-ink-3">입금일(KST) 기준</span>
          </div>
        ) : null}
      </div>

      {/* 기간 합계 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-card p-4">
          <span className="text-[11px] font-medium text-ink-3">
            {periodLabel} 받은 금액
          </span>
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            {formatWon(total)}
          </span>
          <span className="text-[10px] text-ink-3">실제 입금된 금액</span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
          <span className="text-[11px] font-medium text-ink-3">입금 건수</span>
          <span className="text-xl font-extrabold tracking-tight text-foreground">
            {count}건
          </span>
          <span className="text-[10px] text-ink-3">
            {groups.length > 0 ? `${groups.length}개월에 걸쳐 입금` : "입금 없음"}
          </span>
        </div>
      </div>

      {/* 월별 소계 + 건별 내역 */}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-ink-3">
          {periodLabel === "전체"
            ? "아직 입금된 정산이 없어요."
            : `${periodLabel}에 입금된 정산이 없어요.`}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h2 className="text-sm font-bold tracking-tight text-foreground">
                  {g.label}
                </h2>
                <span className="text-xs text-ink-3">
                  <span className="font-semibold text-foreground">
                    {formatWon(g.total)}
                  </span>{" "}
                  · {g.count}건
                </span>
              </div>
              <ul className="overflow-hidden rounded-2xl border border-border bg-card">
                {g.rows.map((r) => (
                  <li
                    key={`${r.source}-${r.id}`}
                    className="flex items-start gap-3 border-b border-hairline-2 px-4 py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold">
                        {r.title}
                      </span>
                      <span className="truncate text-[11px] text-ink-3">
                        {[
                          kstDayLabel(r.paidAt),
                          // 잔액 출금은 제목이 이미 원천이라 두 번 쓰지 않는다.
                          r.title === SOURCE_LABEL[r.source]
                            ? null
                            : SOURCE_LABEL[r.source],
                          r.detail,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {showDancerName && r.dancerName ? (
                        <span className="truncate text-[10px] text-ink-4">
                          {r.dancerName}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-sm font-bold">
                        {formatWon(r.amount)}
                      </span>
                      {r.gross != null ? (
                        <span className="text-[10px] text-ink-3">
                          세전 {formatWon(r.gross)}
                          {r.vat != null && r.vat > 0
                            ? ` · 부가세 +${formatWon(r.vat)}`
                            : ` · 세금 −${formatWon(r.tax ?? 0)}`}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
