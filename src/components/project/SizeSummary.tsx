"use client";

import { useMemo, useState } from "react";
import { TOP_SIZES } from "@/lib/fit/sizes";

type SortKey = "name" | "gender" | "height" | "top" | "waist";

export type SizeRow = {
  name: string;
  gender: "male" | "female" | "other";
  height: number | null;
  top: string | null;
  waist: string | null; // 인치
  length: string | null; // cm
  submitted: boolean;
};

const G_LABEL: Record<string, string> = { male: "남", female: "여", other: "-" };

function countBy(rows: SizeRow[], key: (r: SizeRow) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()];
}

// 상의는 TOP_SIZES 순서, 허리는 숫자 오름차순으로 정렬.
function sortTop(entries: [string, number][]): [string, number][] {
  return [...entries].sort(
    (a, b) => TOP_SIZES.indexOf(a[0]) - TOP_SIZES.indexOf(b[0]),
  );
}
function sortNum(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => Number(a[0]) - Number(b[0]));
}

function CountTable({
  title,
  unit,
  entries,
}: {
  title: string;
  unit?: string;
  entries: [string, number][];
}) {
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-ink-3">계 {total}</span>
      </div>
      {entries.length === 0 ? (
        <p className="py-3 text-center text-xs text-ink-3">제출 없음</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {entries.map(([k, n]) => (
              <tr key={k} className="border-t border-hairline-2 first:border-0">
                <td className="py-1.5 text-ink-2">
                  {k}
                  {unit ?? ""}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums">
                  {n}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SizeSummary({
  rows,
  projectTitle,
}: {
  rows: SizeRow[];
  projectTitle: string;
}) {
  const done = rows.filter((r) => r.submitted);
  const males = done.filter((r) => r.gender === "male");
  const females = done.filter((r) => r.gender === "female");

  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "gender",
    dir: 1,
  });
  function onSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  }
  const sortedRows = useMemo(() => {
    const gOrder: Record<string, number> = { male: 0, female: 1, other: 2 };
    const val = (r: SizeRow): number | string => {
      switch (sort.key) {
        case "name":
          return r.name.toLowerCase();
        case "gender":
          return gOrder[r.gender] ?? 9;
        case "height":
          return r.height ?? -1;
        case "top":
          return r.top ? TOP_SIZES.indexOf(r.top) : -1;
        case "waist":
          return r.waist ? Number(r.waist) : -1;
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return c !== 0 ? c * sort.dir : a.name.localeCompare(b.name);
    });
  }, [rows, sort]);

  const arrow = (key: SortKey) =>
    sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : "";

  function exportCsv() {
    const head = ["이름", "성별", "키(cm)", "상의", "허리(in)", "기장(cm)", "제출"];
    const body = rows.map((r) => [
      r.name,
      G_LABEL[r.gender] ?? "-",
      r.height ?? "",
      r.top ?? "",
      r.waist ?? "",
      r.length ?? "",
      r.submitted ? "제출" : "미제출",
    ]);
    const csv = [head, ...body]
      .map((c) => c.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "의상사이즈_취합.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 요약 헤더 */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-xs text-ink-3">제출 완료 (총수량)</p>
          <p className="text-2xl font-bold">
            {done.length}
            <span className="ml-1 text-sm font-normal text-ink-3">
              / {rows.length}명
            </span>
          </p>
        </div>
        <div className="text-sm text-ink-2">
          남 {males.length} · 여 {females.length}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          엑셀(CSV) 다운로드
        </button>
      </div>

      {/* 대시보드: 사이즈별 수량 — PC에서 4개 한 줄 */}
      <div>
        <h2 className="mb-2 text-sm font-bold">사이즈별 수량</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CountTable title={`남자 상의 (${males.length})`} entries={sortTop(countBy(males, (r) => r.top))} />
          <CountTable
            title="남자 하의 (허리)"
            unit="in"
            entries={sortNum(countBy(males, (r) => r.waist))}
          />
          <CountTable title={`여자 상의 (${females.length})`} entries={sortTop(countBy(females, (r) => r.top))} />
          <CountTable
            title="여자 하의 (허리)"
            unit="in"
            entries={sortNum(countBy(females, (r) => r.waist))}
          />
        </div>
      </div>

      {/* 리스트뷰: 이름 | 성별 | 키 | 상의 | 하의 */}
      <div>
        <h2 className="mb-2 text-sm font-bold">전체 명단 ({rows.length})</h2>
        <div className="max-h-[72vh] overflow-auto rounded-2xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-secondary text-left text-xs text-ink-2">
                {(
                  [
                    ["name", "이름"],
                    ["gender", "성별"],
                    ["height", "키"],
                    ["top", "상의"],
                    ["waist", "하의 (허리/기장)"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="px-3 py-2 font-medium">
                    <button
                      type="button"
                      onClick={() => onSort(key)}
                      className="flex items-center gap-0.5 hover:text-foreground"
                    >
                      {label}
                      <span className="text-primary">{arrow(key)}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
                <tr
                  key={r.name + i}
                  className={`border-t border-hairline-2 ${r.submitted ? "" : "text-ink-3"}`}
                >
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{G_LABEL[r.gender] ?? "-"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.height ? `${r.height}cm` : "-"}
                  </td>
                  <td className="px-3 py-2">{r.top ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.submitted
                      ? `${r.waist}in / ${r.length}cm`
                      : "미제출"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-center text-[11px] text-ink-3">{projectTitle}</p>
    </div>
  );
}
