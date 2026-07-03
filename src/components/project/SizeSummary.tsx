"use client";

import { TOP_SIZES } from "@/lib/fit/sizes";

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

      {/* 대시보드: 사이즈별 수량 */}
      <div>
        <h2 className="mb-2 text-sm font-bold">남자 · 사이즈별 수량 ({males.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CountTable title="상의" entries={sortTop(countBy(males, (r) => r.top))} />
          <CountTable
            title="하의 (허리)"
            unit="in"
            entries={sortNum(countBy(males, (r) => r.waist))}
          />
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-sm font-bold">여자 · 사이즈별 수량 ({females.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CountTable title="상의" entries={sortTop(countBy(females, (r) => r.top))} />
          <CountTable
            title="하의 (허리)"
            unit="in"
            entries={sortNum(countBy(females, (r) => r.waist))}
          />
        </div>
      </div>

      {/* 리스트뷰: 이름 | 성별 | 키 | 상의 | 하의 */}
      <div>
        <h2 className="mb-2 text-sm font-bold">전체 명단 ({rows.length})</h2>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left text-xs text-ink-2">
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">성별</th>
                <th className="px-3 py-2 font-medium">키</th>
                <th className="px-3 py-2 font-medium">상의</th>
                <th className="px-3 py-2 font-medium">하의 (허리/기장)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
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
