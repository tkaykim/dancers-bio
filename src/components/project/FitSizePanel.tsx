"use client";

import { useMemo, useState } from "react";

export type FitRow = {
  name: string;
  link: string;
  top: string | null;
  waist: string | null;
  length: string | null;
  submitted: boolean;
};

export function FitSizePanel({
  title = "의상 사이즈 현황",
  rows,
  shareUrl,
}: {
  title?: string;
  rows: FitRow[];
  shareUrl?: string;
}) {
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const total = rows.length;
  const done = useMemo(() => rows.filter((r) => r.submitted).length, [rows]);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const view = onlyMissing ? rows.filter((r) => !r.submitted) : rows;

  async function copy(link: string, name: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(name);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  }

  function exportCsv() {
    const head = ["이름", "상의", "허리(in)", "기장(cm)", "제출"];
    const body = rows.map((r) => [
      r.name,
      r.top ?? "",
      r.waist ?? "",
      r.length ?? "",
      r.submitted ? "제출" : "미제출",
    ]);
    const csv = [head, ...body]
      .map((cols) =>
        cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\r\n");
    // 엑셀 한글 깨짐 방지 BOM
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "의상사이즈.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-ink-3">
          제출 <span className="font-bold text-foreground">{done}</span> / {total}
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {shareUrl ? (
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareUrl);
              setShareCopied(true);
              setTimeout(() => setShareCopied(false), 1500);
            } catch {
              /* noop */
            }
          }}
          className="mt-3 w-full rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs font-semibold text-foreground"
        >
          {shareCopied ? "복사됨 — 단톡방에 붙여넣기" : "단톡방 공유 링크 복사 (로그인 후 입력)"}
        </button>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOnlyMissing((v) => !v)}
          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
            onlyMissing
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-ink-2"
          }`}
        >
          미제출만
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-2"
        >
          CSV 내보내기
        </button>
      </div>

      <ul className="mt-3 flex flex-col divide-y divide-hairline-2">
        {view.map((r) => (
          <li
            key={r.name + r.link}
            className="flex items-center justify-between gap-2 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.name}</p>
              {r.submitted ? (
                <p className="mt-0.5 text-xs text-ink-3">
                  상의 {r.top} · 허리 {r.waist}in · 기장 {r.length}cm
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-amber-600">미제출</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => copy(r.link, r.name)}
              className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-ink-2 active:bg-secondary"
            >
              {copied === r.name ? "복사됨" : "링크 복사"}
            </button>
          </li>
        ))}
        {view.length === 0 ? (
          <li className="py-6 text-center text-xs text-ink-3">
            {onlyMissing ? "미제출자가 없습니다 🎉" : "대상이 없습니다."}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
