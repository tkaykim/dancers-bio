import type { BoardCard, BoardRateTable } from "@/lib/casting/board-data";

const priceFormatter = new Intl.NumberFormat("ko-KR");

function formatPrice(priceKrw: number): string {
  return `${priceFormatter.format(priceKrw)}원`;
}

function formatFollowers(followersMan: number): string {
  return `${followersMan.toFixed(1)}만`;
}

function CandidatePhoto({ card, name }: { card: BoardCard | undefined; name: string }) {
  return (
    <div className="h-16 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-secondary sm:h-[72px] sm:w-16">
      {card?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photo} alt={name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center px-1 text-center text-[9px] text-ink-3">
          사진 준비중
        </div>
      )}
    </div>
  );
}

export function ProposalRateTable({
  table,
  cards,
}: {
  table: BoardRateTable | null | undefined;
  cards: BoardCard[];
}) {
  const rows = Array.isArray(table?.rows)
    ? table.rows.filter(
        (row) =>
          row &&
          typeof row.name === "string" &&
          typeof row.followersMan === "number" &&
          Number.isFinite(row.followersMan) &&
          typeof row.priceKrw === "number" &&
          Number.isFinite(row.priceKrw),
      )
    : [];
  const cardsById = new Map(cards.map((card) => [card.dancerId, card]));

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
            후보별 사진, Instagram 팔로워 수, 주요 이력, 금액
          </caption>
          <colgroup>
            <col className="w-[29%]" />
            <col className="w-[15%]" />
            <col />
            <col className="w-[21%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-secondary/45 text-[11px] font-semibold text-ink-3">
              <th scope="col" className="px-5 py-3">사진</th>
              <th scope="col" className="px-4 py-3">팔로워수</th>
              <th scope="col" className="px-4 py-3">주요이력</th>
              <th scope="col" className="px-5 py-3 text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const card = row.dancerId ? cardsById.get(row.dancerId) : undefined;

              return (
                <tr
                  key={`${row.name}-${index}`}
                  className="border-b border-border/80 last:border-b-0"
                >
                  <th scope="row" className="px-5 py-3.5 text-left align-middle">
                    <div className="flex items-center gap-3">
                      <CandidatePhoto card={card} name={row.name} />
                      <span className="text-sm font-bold leading-snug text-ink-1">
                        {row.name}
                      </span>
                    </div>
                  </th>
                  <td className="px-4 py-3.5 align-middle text-base font-extrabold tabular-nums text-ink-1">
                    {formatFollowers(row.followersMan)}
                  </td>
                  <td className="px-4 py-3.5 align-middle text-[13px] leading-relaxed text-ink-2">
                    {row.highlight?.trim() || "-"}
                  </td>
                  <td className="px-5 py-3.5 text-right align-middle text-[15px] font-extrabold tabular-nums text-ink-1">
                    {formatPrice(row.priceKrw)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {rows.map((row, index) => {
          const card = row.dancerId ? cardsById.get(row.dancerId) : undefined;

          return (
            <article key={`${row.name}-${index}`} className="px-4 py-4">
              <div className="flex gap-3">
                <CandidatePhoto card={card} name={row.name} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold leading-snug text-ink-1">
                    {row.name}
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] font-semibold text-ink-3">팔로워수</p>
                      <p className="mt-0.5 text-base font-extrabold tabular-nums text-ink-1">
                        {formatFollowers(row.followersMan)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-ink-3">금액</p>
                      <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-ink-1">
                        {formatPrice(row.priceKrw)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-border/80 pt-3">
                <p className="text-[10px] font-semibold text-ink-3">주요이력</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-2">
                  {row.highlight?.trim() || "-"}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {table.notice?.trim() ? (
        <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-950 sm:px-5">
          {table.notice}
        </p>
      ) : null}
    </section>
  );
}
