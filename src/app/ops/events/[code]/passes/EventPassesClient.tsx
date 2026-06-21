"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import type {
  EventPrintEvent,
  EventPrintProject,
  EventPrintRow,
} from "@/lib/ops/event-print-data";
import { buildEventQrPayload } from "@/lib/ops/event-qr";

function genderLabel(value: string | null) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기입";
}

export function EventPassesClient({
  event,
  project,
  rows,
}: {
  event: EventPrintEvent;
  project: EventPrintProject | null;
  rows: EventPrintRow[];
}) {
  const [qrById, setQrById] = useState<Record<string, string>>({});
  const qrPayloads = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => [row.id, buildEventQrPayload(event.ops_code, row.pass_token)]),
      ),
    [event.ops_code, rows],
  );

  useEffect(() => {
    let cancelled = false;

    async function build() {
      const QRCode = await import("qrcode");
      const entries = await Promise.all(
        rows.map(async (row) => [
          row.id,
          await QRCode.toDataURL(qrPayloads[row.id], {
            errorCorrectionLevel: "M",
            margin: 1,
            scale: 7,
            color: {
              dark: "#17140f",
              light: "#ffffff",
            },
          }),
        ]),
      );
      if (!cancelled) setQrById(Object.fromEntries(entries));
    }

    void build();

    return () => {
      cancelled = true;
    };
  }, [qrPayloads, rows]);

  return (
    <main className="pass-page min-h-svh bg-[#f7f7f4] p-5 text-[#17140f]">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .pass-page { padding: 0 !important; background: #fff !important; }
          .no-print { display: none !important; }
          .pass-grid {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 6mm !important;
            padding: 8mm !important;
          }
          .pass-card {
            height: 72mm !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            border: 1.5px solid #111 !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <header className="no-print mx-auto mb-5 flex max-w-[1180px] flex-col gap-3 border-b border-black/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href={`/ops/events/${event.ops_code}`}
            className="text-xs font-bold uppercase tracking-[0.18em] text-black/45 hover:text-black"
          >
            운영판으로 돌아가기
          </Link>
          <h1 className="mt-2 text-2xl font-black tracking-tight">
            QR 패스
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

      <section className="pass-grid mx-auto grid max-w-[1180px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rows.map((row) => (
          <article
            key={row.id}
            className="pass-card flex min-h-72 flex-col justify-between border border-black bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-4xl font-black tracking-tight">
                  {row.bib_code ?? "-"}
                </div>
                <div className="mt-1 text-xs font-bold text-black/45">
                  {row.channel_name ?? "채널 없음"} · {genderLabel(row.gender)}
                </div>
              </div>
              <div
                aria-label="dee'tz"
                className="shrink-0 text-2xl font-black leading-none text-black"
              >
                dee&apos;tz
              </div>
            </div>

            <div className="flex justify-center py-3">
              {qrById[row.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrById[row.id]}
                  alt={`${row.name} QR`}
                  className="h-36 w-36"
                />
              ) : (
                <div className="flex h-36 w-36 items-center justify-center border border-black/10 text-xs text-black/40">
                  QR 생성 중
                </div>
              )}
            </div>

            <div className="min-w-0 border-t border-black/10 pt-3">
              <div className="truncate text-xl font-black">
                {row.name}
              </div>
              {row.real_name && row.real_name !== row.name ? (
                <div className="mt-0.5 truncate text-xs font-bold text-black/45">
                  {row.real_name}
                </div>
              ) : null}
              <div className="mt-1 text-xs font-bold text-black/45">
                현장 접수 시 운영진에게 QR을 보여주세요.
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
