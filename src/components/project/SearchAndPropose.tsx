"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { sendDirectProposalAction } from "@/app/actions/proposals";
import { loadMoreDancersAction } from "@/app/actions/dancers-list";

type Dancer = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  genres: string[] | null;
  profile_id: string | null;
};

export function SearchAndPropose({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Dancer[]>([]);
  const [searching, startSearch] = useTransition();
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      if (q.trim().length < 1) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const r = await loadMoreDancersAction({ q: q.trim(), offset: 0 });
        if (r.ok && r.data) {
          setResults(r.data.dancers as Dancer[]);
        }
      });
    },
    [],
  );

  function propose(dancerId: string) {
    setError(null);
    setSendingId(dancerId);
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("dancer_id", dancerId);
    sendDirectProposalAction(fd).then((r) => {
      setSendingId(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSentIds((prev) => new Set(prev).add(dancerId));
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        댄서 검색해서 제안 보내기
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">댄서 검색</p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setQuery("");
            setResults([]);
            setError(null);
          }}
          className="text-xs text-ink-3 hover:text-foreground"
        >
          닫기
        </button>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="이름, 장르, 한글명으로 검색..."
        autoFocus
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-ink-3"
      />

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {searching ? (
        <p className="py-4 text-center text-xs text-ink-3">검색 중...</p>
      ) : results.length === 0 && query.trim().length > 0 ? (
        <p className="py-4 text-center text-xs text-ink-3">
          결과가 없습니다. 다른 이름으로 시도해 보세요.
        </p>
      ) : (
        <ul className="flex max-h-[360px] flex-col gap-1 overflow-y-auto">
          {results.map((d) => {
            const sent = sentIds.has(d.id);
            const isSending = sendingId === d.id;
            return (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary/40"
              >
                {d.profile_img ? (
                  <Image
                    src={d.profile_img}
                    alt={d.stage_name}
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                    {d.stage_name[0]}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/d/${d.slug ?? d.id}`}
                    target="_blank"
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {d.stage_name}
                    {d.korean_name ? (
                      <span className="ml-1 text-ink-3">{d.korean_name}</span>
                    ) : null}
                  </Link>
                  <p className="truncate text-[11px] text-ink-3">
                    {(d.genres ?? []).slice(0, 2).join(" · ")}
                    {d.location ? ` · ${d.location}` : ""}
                    {!d.profile_id ? " · 미claim" : ""}
                  </p>
                </div>
                {sent ? (
                  <span className="shrink-0 text-[11px] font-medium text-primary">
                    전송됨
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => propose(d.id)}
                    className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {isSending ? "..." : "제안"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
