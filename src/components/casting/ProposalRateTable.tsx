import type { BoardRateTable } from "@/lib/casting/board-data";

const priceFormatter = new Intl.NumberFormat("ko-KR");

function formatPrice(priceKrw: number): string {
  return `${priceFormatter.format(priceKrw)}원`;
}

export function ProposalRateTable({ table }: { table: BoardRateTable | null | undefined }) {
  const rows = Array.isArray(table?.rows)
    ? table.rows.filter(
        (row) =>
          row &&
          typeof row.name === "string" &&
          typeof row.category === "string" &&
          typeof row.priceKrw === "number" &&
          Number.isFinite(row.priceKrw),
      )
    : [];

  if (!table || rows.length === 0) return null;

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border bg-secondary/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            RATE CARD
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-ink-1">
            {table.title?.trim() || "후보별 제안 단가"}
          </h2>
        </div>
        {table.caption?.trim() ? (
          <p className="w-fit rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-ink-2">
            {table.caption}
          </p>
        ) : null}
      </div>

      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">
            후보별 구분, 후보명, 주요 포인트, 클라이언트 제안 단가
          </caption>
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col />
            <col className="w-[22%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-secondary/45 text-[11px] font-semibold text-ink-3">
              <th scope="col" className="px-5 py-3">구분</th>
              <th scope="col" className="px-4 py-3">후보</th>
              <th scope="col" className="px-4 py-3">주요 포인트</th>
              <th scope="col" className="px-5 py-3 text-right">클라이언트 제안 단가</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.name}-${index}`}
                className="border-b border-border/80 last:border-b-0"
              >
                <td className="px-5 py-4 align-middle">
                  <span className="inline-flex rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-semibold text-ink-2">
                    {row.category}
                  </span>
                </td>
                <th scope="row" className="px-4 py-4 text-sm font-bold text-ink-1">
                  {row.name}
                </th>
                <td className="px-4 py-4 text-[13px] leading-relaxed text-ink-2">
                  {row.highlight?.trim() || "-"}
                </td>
                <td className="px-5 py-4 text-right text-[15px] font-extrabold tabular-nums text-ink-1">
                  {formatPrice(row.priceKrw)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {rows.map((row, index) => (
          <article key={`${row.name}-${index}`} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-ink-2">
                  {row.category}
                </span>
                <h3 className="mt-1.5 truncate text-sm font-bold text-ink-1">
                  {row.name}
                </h3>
              </div>
              <p className="shrink-0 text-[15px] font-extrabold tabular-nums text-ink-1">
                {formatPrice(row.priceKrw)}
              </p>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              {row.highlight?.trim() || "-"}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
