"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { formatWon } from "@/lib/settlement";

export type LedgerPeriod = "month" | "year" | "all" | "custom";

export type LedgerRow = {
  id: string;
  paidAt: string | null;
  dancerName: string;
  projectTitle: string;
  gross: number;
  tax: number;
  net: number;
  rate: number;
  handler: string;
};

export type LedgerTotals = {
  count: number;
  gross: number;
  tax: number;
  net: number;
};

const PERIOD_LABEL: Record<Exclude<LedgerPeriod, "custom">, string> = {
  month: "이번 달",
  year: "올해",
  all: "전체",
};

function fmtDateKST(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

export function SettlementLedger({
  rows,
  totals,
  period,
  from,
  to,
}: {
  rows: LedgerRow[];
  totals: LedgerTotals;
  period: LedgerPeriod;
  from: string | null;
  to: string | null;
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(period === "custom");
  const [cFrom, setCFrom] = useState(from ?? "");
  const [cTo, setCTo] = useState(to ?? "");

  function applyCustom() {
    if (!cFrom && !cTo) return;
    const params = new URLSearchParams({ period: "custom" });
    if (cFrom) params.set("from", cFrom);
    if (cTo) params.set("to", cTo);
    router.push(`/admin/settlements/ledger?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.dancerName.toLowerCase().includes(term) ||
        r.projectTitle.toLowerCase().includes(term),
    );
  }, [rows, q]);

  // 검색 적용된 합계 (검색 중이면 화면 합계도 같이 좁혀짐)
  const shown = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => ({
          count: acc.count + 1,
          gross: acc.gross + r.gross,
          tax: acc.tax + r.tax,
          net: acc.net + r.net,
        }),
        { count: 0, gross: 0, tax: 0, net: 0 },
      ),
    [filtered],
  );
  const isSearching = q.trim().length > 0;
  const t = isSearching ? shown : totals;

  function exportCsv() {
    const header = [
      "입금일",
      "댄서",
      "프로젝트",
      "세전금액",
      "원천징수(3.3%)",
      "실지급액",
      "처리자",
    ];
    const esc = (v: string | number) => {
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [
      header.join(","),
      ...filtered.map((r) =>
        [
          fmtDateKST(r.paidAt),
          esc(r.dancerName),
          esc(r.projectTitle),
          r.gross,
          r.tax,
          r.net,
          esc(r.handler),
        ].join(","),
      ),
      // 합계 행
      ["합계", "", String(t.count) + "건", t.gross, t.tax, t.net, ""].join(","),
    ];
    const csv = "﻿" + lines.join("\r\n"); // BOM (엑셀 한글)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const label =
      period === "custom"
        ? `${from ?? ""}_${to ?? ""}`
        : PERIOD_LABEL[period as Exclude<LedgerPeriod, "custom">];
    a.download = `정산_지급장부_${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 기간 탭 */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["month", "year", "all"] as const).map((p) => {
            const active = period === p;
            return (
              <Link
                key={p}
                href={`/admin/settlements/ledger?period=${p}`}
                aria-current={active ? "page" : undefined}
                className={
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-ink-2 hover:bg-secondary")
                }
              >
                {PERIOD_LABEL[p]}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            aria-pressed={period === "custom" || showCustom}
            className={
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors " +
              (period === "custom"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-ink-2 hover:bg-secondary")
            }
          >
            직접 선택
          </button>
        </div>

        {showCustom ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
            <input
              type="date"
              value={cFrom}
              max={cTo || undefined}
              onChange={(e) => setCFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
            <span className="text-xs text-ink-3">~</span>
            <input
              type="date"
              value={cTo}
              min={cFrom || undefined}
              onChange={(e) => setCTo(e.target.value)}
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

      {/* 합계 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="실지급 합계" value={formatWon(t.net)} strong />
        <StatCard label="세전 합계" value={formatWon(t.gross)} />
        <StatCard label="원천징수(3.3%) 합계" value={formatWon(t.tax)} />
        <StatCard label="건수" value={`${t.count}건`} />
      </div>

      {/* 검색 + 내보내기 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <Search size={15} className="shrink-0 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="댄서·프로젝트 검색"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-sm font-semibold text-ink-2 hover:bg-secondary disabled:opacity-50"
        >
          <Download size={15} aria-hidden />
          엑셀(CSV)
        </button>
      </div>

      {/* 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-ink-3">
          {isSearching
            ? "검색 결과가 없어요."
            : "이 기간에 지급된 정산이 없어요."}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-hairline-2 px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {r.dancerName}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">
                    {fmtDateKST(r.paidAt)}
                  </span>
                </div>
                <span className="truncate text-xs text-ink-3">
                  {r.projectTitle}
                </span>
                <span className="text-[10px] text-ink-4">처리 {r.handler}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-sm font-bold">{formatWon(r.net)}</span>
                <span className="text-[10px] text-ink-3">
                  세전 {formatWon(r.gross)} · 세금 −{formatWon(r.tax)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        "flex flex-col gap-1 rounded-xl border border-border p-3 " +
        (strong ? "bg-gradient-to-br from-primary/10 to-card" : "bg-card")
      }
    >
      <span className="text-[11px] text-ink-3">{label}</span>
      <span
        className={
          strong
            ? "text-lg font-extrabold tracking-tight text-foreground"
            : "text-base font-bold text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
