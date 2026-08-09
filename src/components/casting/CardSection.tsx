"use client";

import { useEffect, useState } from "react";
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
              href={`https://dancers.bio/${c.slug}`}
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

// 처음 노출 줄 수 + '더보기' 한 번에 추가로 펼치는 줄 수.
const INITIAL_ROWS = 3;
const STEP_ROWS = 3;

// 카드 섹션: 처음엔 3줄(열수×3)만, '더보기'를 누를 때마다 3줄씩 추가. 열수는 너비로 계산.
export function CardSection({
  label,
  cards,
  fields,
}: {
  label: string;
  cards: BoardCard[];
  fields: BoardView["settings"]["fields"];
}) {
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(INITIAL_ROWS);

  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth;
      setCols(w < 640 ? 2 : w < 768 ? 3 : w < 1024 ? 4 : 5);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  if (cards.length === 0) return null;

  const limit = cols * rows;
  const shown = cards.slice(0, limit);
  const remaining = cards.length - limit; // 남은(아직 안 보이는) 인원
  const nextBatch = Math.min(remaining, cols * STEP_ROWS);
  const canCollapse = remaining <= 0 && rows > INITIAL_ROWS;

  return (
    <section className="mt-7">
      <h2 className="mb-3 border-b-2 border-ink-1 pb-1 text-[15px] font-extrabold">
        {label} ({cards.length}명)
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {shown.map((c) => (
          <Card key={c.dancerId} c={c} fields={fields} />
        ))}
      </div>
      {remaining > 0 || canCollapse ? (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() =>
              remaining > 0
                ? setRows((r) => r + STEP_ROWS)
                : setRows(INITIAL_ROWS)
            }
            className="rounded-full border border-border bg-card px-5 py-2 text-xs font-semibold text-ink-1 hover:bg-secondary"
          >
            {remaining > 0 ? `더보기 (+${nextBatch}명 · 남은 ${remaining}명)` : "접기"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
