"use client";

import Link from "next/link";
import { Printer, RefreshCw } from "lucide-react";
import type {
  EventPrintEvent,
  EventPrintProject,
  EventPrintRow,
} from "@/lib/ops/event-print-data";

function genderLabel(value: string | null) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기입";
}

export function EventLabelsClient({
  event,
  project,
  rows,
}: {
  event: EventPrintEvent;
  project: EventPrintProject | null;
  rows: EventPrintRow[];
}) {
  return (
    <main className="label-page min-h-svh bg-[#f7f7f4] p-5 text-[#17140f]">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .label-page { padding: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          .label-grid {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 7mm !important;
            padding: 8mm !important;
          }
          .label-card {
            height: 38mm !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1.5px solid #111 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <header className="no-print mx-auto mb-5 flex max-w-[1120px] flex-col gap-3 border-b border-black/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={`/ops/events/${event.ops_code}`}
            className="text-xs font-bold uppercase tracking-[0.18em] text-black/45 hover:text-black"
          >
            운영판으로 돌아가기
          </Link>
          <h1 className="mt-2 text-2xl font-black tracking-tight">
            번호표 라벨
          </h1>
          <p className="mt-1 text-sm text-black/55">
            {project?.title ?? event.name} · 현재 {rows.length}명입니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-sm font-bold text-black/70 hover:bg-black/5"
          >
            <RefreshCw size={15} />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-sm font-bold text-white hover:bg-black/80"
          >
            <Printer size={15} />
            인쇄
          </button>
        </div>
      </header>

      <section className="label-grid mx-auto grid max-w-[1120px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.id}
            className="label-card flex min-h-36 flex-col justify-between border border-black bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-5xl font-black tracking-tight">
                {row.bib_code ?? "-"}
              </div>
              <div className="rounded-full border border-black px-2 py-1 text-xs font-black">
                {genderLabel(row.gender)}
              </div>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-lg font-black">
                  {row.name}
                </div>
                {row.real_name && row.real_name !== row.name ? (
                  <div className="truncate text-xs font-bold text-black/45">
                    {row.real_name}
                  </div>
                ) : null}
              </div>
              <div
                aria-label="dee'tz"
                className="shrink-0 text-3xl font-black leading-none text-black"
              >
                dee&apos;tz
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
