"use client";

import { useEffect, useState } from "react";

type EvidenceFile = {
  path: string;
  name: string;
  size: number;
  type: string;
  url: string | null;
};

type FeeReportRow = {
  id: string;
  created_at: string;
  work_categories: string[];
  client_type: string;
  counterparty_note: string;
  amount_note: string;
  pay_type_note: string;
  facts: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  reporter_instagram: string | null;
  evidence_files?: EvidenceFile[];
};

const WORK_LABEL: Record<string, string> = {
  choreography: "안무 제작",
  performance: "공연",
  dancer_casting: "댄서 출연·섭외",
  advertisement: "광고",
  other: "기타",
};
const CLIENT_LABEL: Record<string, string> = {
  company: "회사·사업자",
  individual: "개인",
  unknown: "불명",
};

function isImage(f: EvidenceFile) {
  return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name);
}
function formatBytes(n: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminFeeReportsPage() {
  const [items, setItems] = useState<FeeReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/fee-reports", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "failed");
        setItems(json.items || []);
      } catch {
        setError("목록을 불러오지 못했습니다. 관리자 권한으로 로그인했는지 확인해 주세요.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-svh bg-[#f7f5ef] text-[#171611] [word-break:keep-all]">
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-14">
        <h1 className="text-2xl font-extrabold tracking-tight">미수·정산 제보</h1>

        {loading ? (
          <p className="mt-6 text-sm text-[#4f4a40]">불러오는 중…</p>
        ) : error ? (
          <p className="mt-6 text-sm text-red-700">{error}</p>
        ) : items.length === 0 ? (
          <p className="mt-6 text-sm text-[#4f4a40]">접수된 제보가 없습니다.</p>
        ) : (
          <div className="mt-6 space-y-4">
            {items.map((row) => (
              <div key={row.id} className="rounded-lg border border-[#ddd6c7] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {new Date(row.created_at).toLocaleString("ko-KR")}
                  </span>
                  <button
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="rounded-md border border-[#ddd6c7] px-3 py-1 text-xs hover:border-[#cfc8b8]"
                  >
                    {openId === row.id ? "접기" : "펼치기"}
                  </button>
                </div>

                <div className="mt-3 space-y-1 text-sm text-[#4f4a40]">
                  <div>
                    <span className="text-[#81796a]">업무: </span>
                    {(row.work_categories || []).map((c) => WORK_LABEL[c] || c).join(", ") || "—"}
                  </div>
                  <div>
                    <span className="text-[#81796a]">의뢰인: </span>
                    {CLIENT_LABEL[row.client_type] || row.client_type}
                  </div>
                  <div>
                    <span className="text-[#81796a]">금액: </span>
                    {row.amount_note}
                  </div>
                  <div>
                    <span className="text-[#81796a]">대금 성격: </span>
                    {row.pay_type_note}
                  </div>
                </div>

                {openId === row.id && (
                  <div className="mt-4 space-y-4 border-t border-[#e7e1d4] pt-4 text-sm text-[#171611]">
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#81796a]">상대·채권 정보</p>
                      <p className="mt-1 whitespace-pre-wrap">{row.counterparty_note}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#81796a]">정황·사실</p>
                      <p className="mt-1 whitespace-pre-wrap">{row.facts}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#81796a]">제보자 (비공개 수집)</p>
                      <p className="mt-1">
                        {row.reporter_name || "—"} / {row.reporter_contact || "—"}
                      </p>
                      <p className="mt-1">
                        <span className="text-[#81796a]">인스타그램: </span>
                        {row.reporter_instagram ? `@${row.reporter_instagram}` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#81796a]">
                        증빙 자료 {row.evidence_files?.length ? `(${row.evidence_files.length})` : ""}
                      </p>
                      {row.evidence_files && row.evidence_files.length > 0 ? (
                        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {row.evidence_files.map((f, i) => (
                            <a
                              key={`${f.path}-${i}`}
                              href={f.url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-md border border-[#ddd6c7] bg-white p-2 hover:border-[#cfc8b8]"
                            >
                              {isImage(f) && f.url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={f.url} alt={f.name} className="h-28 w-full rounded object-cover" />
                              ) : (
                                <div className="flex h-28 w-full items-center justify-center rounded bg-[#f0ece2] text-3xl">
                                  📎
                                </div>
                              )}
                              <p className="mt-1 truncate text-xs" title={f.name}>
                                {f.name}
                              </p>
                              <p className="text-[10px] text-[#a59e8d]">{formatBytes(f.size)}</p>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-[#a59e8d]">첨부 없음</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
