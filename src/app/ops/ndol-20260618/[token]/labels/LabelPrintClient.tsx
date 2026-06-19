"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/browser";

type LabelRow = {
  id: string;
  name: string;
  gender: "male" | "female" | "unknown";
  bib_code: string | null;
  outreach_status: string;
};

function genderLabel(value: string) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기재";
}

function bibSortValue(value: string | null) {
  if (!value) return 99999;
  const match = /^([A-Z])-([0-9]+)$/.exec(value);
  if (!match) return 99998;
  return (match[1].charCodeAt(0) - 65) * 100 + Number(match[2]);
}

export function LabelPrintClient({ token }: { token: string }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc(
      "ops_ndol_contacts_for_token_v2",
      { p_token: token },
    );

    if (rpcError) {
      setError("번호표를 불러오지 못했습니다.");
    } else {
      const nextRows = ((data ?? []) as LabelRow[])
        .filter((row) => row.bib_code && row.outreach_status === "available")
        .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));
      setRows(nextRows);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            NDOL 2026.06.18
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            번호표 출력용
          </h1>
          <p className="mt-1 text-sm text-black/55">
            진행가능 인원만 번호표로 출력됩니다. 현재 {rows.length}명입니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-black/70 hover:bg-black/5"
          >
            <RefreshCw size={15} />
            새로고침
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-sm font-semibold text-white hover:bg-black/80"
          >
            <Printer size={15} />
            인쇄
          </button>
        </div>
      </header>

      {error ? (
        <div className="no-print mx-auto max-w-[1120px] border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="no-print mx-auto max-w-[1120px] border border-black/10 bg-white p-8 text-center text-sm text-black/50">
          불러오는 중입니다.
        </div>
      ) : (
        <section className="label-grid mx-auto grid max-w-[1120px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.id}
              className="label-card flex min-h-36 flex-col justify-between border border-black bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-5xl font-black tracking-tight">
                  {row.bib_code}
                </div>
                <div className="rounded-full border border-black px-2 py-1 text-xs font-extrabold">
                  {genderLabel(row.gender)}
                </div>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-extrabold">
                    {row.name || "이름 없음"}
                  </div>
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
      )}
    </main>
  );
}
