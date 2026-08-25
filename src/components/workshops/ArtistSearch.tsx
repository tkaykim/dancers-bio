"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { searchWorkshopArtistsAction, type WorkshopSearchResult } from "@/app/actions/workshops";
import { cn } from "@/lib/utils";
import { InstagramGlyph } from "./InstagramGlyph";
import { T, type Lang } from "./copy";
import { VoteBox } from "./VoteBox";

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background py-3 pl-10 pr-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

/**
 * 검색 우선 제출 플로우 (기획 정본 제안 A).
 * 기존 카드·시드 카탈로그를 먼저 찾아 "이 사람 맞다!" 확인 후 탭 한 번으로 수요를 합산한다.
 * 결과가 없을 때만 직접 입력 폼(NominateForm)으로 폴백한다.
 */
export function ArtistSearch({
  isLoggedIn,
  lang,
  onManualRequest,
}: {
  isLoggedIn: boolean;
  lang: Lang;
  onManualRequest: (query: string) => void;
}) {
  const c = T[lang];
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WorkshopSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  // 디바운스는 입력 핸들러에서 직접 관리한다 (effect 내 동기 setState 금지 — 레포 lint 규칙).
  // seq 는 응답 역전 방지 — 마지막 요청의 결과만 반영한다.
  const seq = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const onQueryChange = (value: string) => {
    setQ(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    const query = value.trim();
    const mySeq = ++seq.current;
    if (!query) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const res = await searchWorkshopArtistsAction({ q: query });
      if (seq.current !== mySeq) return;
      setResults(res.ok ? (res.data?.results ?? []) : []);
      setSearched(true);
      setSearching(false);
    }, 300);
  };

  const showEmpty = searched && !searching && q.trim().length > 0 && results.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
        <input
          type="text"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={c.searchPh}
          className={inputClass}
        />
      </div>

      {searching ? <p className="text-[12px] text-ink-4">{c.searchSearching}</p> : null}

      {results.length > 0 ? (
        <div className="flex flex-col gap-2">
          {results.map((r) => (
            <SearchResultRow key={r.id} result={r} isLoggedIn={isLoggedIn} lang={lang} />
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <p className="rounded-lg border border-dashed border-hairline-2 px-4 py-3 text-[13px] text-ink-3">
          {c.searchEmpty}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onManualRequest(q.trim())}
        className={cn(
          "self-start text-[13px] font-semibold underline-offset-2 transition-colors hover:underline",
          showEmpty ? "text-primary" : "text-ink-3 hover:text-foreground",
        )}
      >
        {c.searchManualCta}
      </button>
    </div>
  );
}

function SearchResultRow({
  result,
  isLoggedIn,
  lang,
}: {
  result: WorkshopSearchResult;
  isLoggedIn: boolean;
  lang: Lang;
}) {
  const c = T[lang];
  const isDancer = result.source === "dancer";
  const listed = !isDancer && result.status !== "suggested" && result.slug;
  const genres = (result.genres ?? []).slice(0, 3);

  return (
    <div className="rounded-xl border border-hairline-2 bg-card p-3">
      <div className="flex items-center gap-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-secondary">
          {result.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.image_url} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-base font-bold text-ink-4">
              {result.name.trim().charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {listed ? (
              <Link
                href={`/workshops/${result.slug}`}
                className="truncate text-sm font-bold text-foreground hover:underline"
              >
                {result.name}
              </Link>
            ) : (
              <span className="truncate text-sm font-bold text-foreground">{result.name}</span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                listed || isDancer ? "bg-primary/10 text-primary" : "bg-secondary text-ink-3",
              )}
            >
              {isDancer ? c.searchStatusDancer : listed ? c.searchStatusListed : c.searchStatusSuggested}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1">
              <InstagramGlyph className="size-3" />@{result.instagram_handle}
            </span>
            {result.country ? <span>{result.country}</span> : null}
            {genres.length > 0 ? <span className="truncate">{genres.join(" · ")}</span> : null}
          </p>
          {result.headline ? (
            <p className="mt-0.5 truncate text-[11.5px] text-ink-4">{result.headline}</p>
          ) : null}
        </div>
      </div>
      {isDancer ? (
        // deetz 댄서 풀 결과 — 카드가 아직 없으므로 nominate 경로로 제출(서버가 카드 생성·수요 합산)
        <VoteBox
          nominate={{ name: result.name, instagramHandle: result.instagram_handle }}
          isLoggedIn={isLoggedIn}
          lang={lang}
          className="mt-2.5"
        />
      ) : (
        <VoteBox artistId={result.id} isLoggedIn={isLoggedIn} lang={lang} className="mt-2.5" />
      )}
    </div>
  );
}
