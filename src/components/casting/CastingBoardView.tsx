import type { BoardView, BoardCard } from "@/lib/casting/board-data";

function instaHandle(url: string | null): string | null {
  if (!url) return null;
  const m = url.replace(/\/+$/, "").match(/instagram\.com\/([^/?#]+)/i);
  return m ? "@" + m[1] : null;
}

function genderKo(g: string | null): string {
  return g === "female" ? "여" : g === "male" ? "남" : "-";
}

function Card({ c, fields }: { c: BoardCard; fields: BoardView["settings"]["fields"] }) {
  const handle = instaHandle(c.instagram);
  const sub = [genderKo(c.gender), c.height ? `${c.height}cm` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card break-inside-avoid">
      <div className="aspect-[3/4] w-full bg-secondary">
        {c.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo} alt={c.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-ink-3">
            사진 준비중
          </div>
        )}
      </div>
      <div className="px-2.5 py-2">
        <div className="truncate text-[13px] font-bold leading-tight">{c.name}</div>
        <div className="min-h-[14px] truncate text-[10.5px] text-ink-3">
          {c.koreanName ?? ""}
        </div>
        <div className="mt-0.5 text-[12px] font-semibold">{sub}</div>
        {fields?.career !== false && c.career ? (
          <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-2">
            {c.career}
          </div>
        ) : null}
        <div className="mt-1.5 flex flex-col gap-0.5">
          {fields?.instagram !== false && handle ? (
            <a
              href={c.instagram!}
              target="_blank"
              rel="noreferrer"
              className="truncate text-[10px] text-primary"
            >
              {handle}
            </a>
          ) : null}
          {c.slug ? (
            <a
              href={`https://deetz.kr/d/${c.slug}`}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-semibold text-ink-1"
            >
              프로필 보기 →
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  cards,
  fields,
}: {
  label: string;
  cards: BoardCard[];
  fields: BoardView["settings"]["fields"];
}) {
  if (cards.length === 0) return null;
  return (
    <section className="mt-7">
      <h2 className="mb-3 border-b-2 border-ink-1 pb-1 text-[15px] font-extrabold">
        {label} ({cards.length}명)
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.dancerId} c={c} fields={fields} />
        ))}
      </div>
    </section>
  );
}

function ListBlock({ items }: { items: BoardCard[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-7">
      <h2 className="mb-1 border-b-2 border-ink-1 pb-1 text-[15px] font-extrabold">
        사진 미등록 ({items.length}명)
      </h2>
      <p className="mb-3 text-[11px] text-ink-3">
        프로필 사진이 없는 인원입니다. 이름·성별·키만 표기됩니다.
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 md:grid-cols-4">
        {items.map((c) => (
          <div
            key={c.dancerId}
            className="flex items-baseline justify-between gap-2 border-b border-hairline-2 py-1 text-[12px]"
          >
            <span className="truncate font-medium">
              {c.name}
              {c.koreanName && c.koreanName !== c.name ? (
                <span className="ml-1 text-ink-3">{c.koreanName}</span>
              ) : null}
            </span>
            <span className="shrink-0 text-ink-3">
              {genderKo(c.gender)}
              {c.height ? ` · ${c.height}` : ""}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CastingBoardView({ board }: { board: BoardView }) {
  const { settings, cards, listOnly, counts } = board;
  const gp = settings.genderPriority;
  const males = cards.filter((c) => c.gender === "male");
  const females = cards.filter((c) => c.gender === "female");
  const others = cards.filter((c) => c.gender !== "male" && c.gender !== "female");

  const maleSec = (
    <Section key="m" label="남자 댄서" cards={males} fields={settings.fields} />
  );
  const femaleSec = (
    <Section key="f" label="여자 댄서" cards={females} fields={settings.fields} />
  );
  const ordered = gp === "female" ? [femaleSec, maleSec] : [maleSec, femaleSec];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="border-b-2 border-ink-1 pb-5">
        <div className="text-3xl font-extrabold leading-none tracking-tight">
          deetz<span className="text-hairline">.</span>
        </div>
        <div className="mt-1 text-xs text-ink-3">댄서 매거진 &amp; 캐스팅 플랫폼</div>
        {board.title ? (
          <h1 className="mt-4 text-xl font-bold">{board.title}</h1>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-xl border border-border bg-secondary px-3 py-1.5">
            총 <b>{counts.total}</b>명
          </span>
          <span className="rounded-xl border border-border bg-secondary px-3 py-1.5">
            남 <b>{counts.male}</b>
          </span>
          <span className="rounded-xl border border-border bg-secondary px-3 py-1.5">
            여 <b>{counts.female}</b>
          </span>
        </div>
      </header>

      {counts.total === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">표시할 인원이 없습니다.</p>
      ) : (
        <>
          {ordered}
          {others.length ? (
            <Section label="기타" cards={others} fields={settings.fields} />
          ) : null}
          <ListBlock items={listOnly} />
        </>
      )}

      <footer className="mt-10 border-t border-border pt-4 text-[10px] text-ink-3">
        deetz · deetz.kr · 본 자료는 캐스팅 검토용이며 외부 유출을 금합니다.
      </footer>
    </div>
  );
}
