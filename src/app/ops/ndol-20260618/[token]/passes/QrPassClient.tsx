"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { getBrowserClient } from "@/lib/supabase/browser";
import { buildNdolQrPayload } from "@/lib/ops/ndol-qr";

type PassRow = {
  id: string;
  name: string;
  gender: "male" | "female" | "unknown";
  project_code: string;
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

export function QrPassClient({ token }: { token: string }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [rows, setRows] = useState<PassRow[]>([]);
  const [qrById, setQrById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "ops_ndol_contacts_for_token_v2",
      { p_token: token },
    );

    if (rpcError) {
      setError("QR 출입증을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const nextRows = ((data ?? []) as PassRow[])
      .filter((row) => row.bib_code && row.outreach_status === "available")
      .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));

    const entries = await Promise.all(
      nextRows.map(async (row) => [
        row.id,
        await QRCode.toDataURL(buildNdolQrPayload(row.id), {
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

    setRows(nextRows);
    setQrById(Object.fromEntries(entries));
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
            NDOL 2026.06.18
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            QR 출입증
          </h1>
          <p className="mt-1 text-sm text-black/55">
            진행가능 및 번호 배정 인원만 표시됩니다. 현재 {rows.length}명입니다.
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
        <div className="no-print mx-auto max-w-[1180px] border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="no-print mx-auto max-w-[1180px] border border-black/10 bg-white p-8 text-center text-sm text-black/50">
          불러오는 중입니다.
        </div>
      ) : (
        <section className="pass-grid mx-auto grid max-w-[1180px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((row) => (
            <article
              key={row.id}
              className="pass-card flex min-h-72 flex-col justify-between border border-black bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-4xl font-black tracking-tight">
                    {row.bib_code}
                  </div>
                  <div className="mt-1 text-xs font-bold text-black/45">
                    {row.project_code} · {genderLabel(row.gender)}
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
                    alt={`${row.name || "참석자"} QR`}
                    className="h-36 w-36"
                  />
                ) : (
                  <div className="flex h-36 w-36 items-center justify-center border border-black/10 text-xs text-black/40">
                    QR 생성 중
                  </div>
                )}
              </div>

              <div className="min-w-0 border-t border-black/10 pt-3">
                <div className="truncate text-xl font-extrabold">
                  {row.name || "이름 없음"}
                </div>
                <div className="mt-1 text-xs font-semibold text-black/45">
                  현장 접수 시 운영진에게 QR을 보여주세요.
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
