"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadMoreDancersAction } from "@/app/actions/dancers-list";
import {
  DANCER_PAGE_SIZE,
  type DancerListItem,
} from "@/lib/data/dancers";

type Props = {
  q: string;
  initialDancers: DancerListItem[];
  /**
   * Whether the initial server-rendered batch was a full page. When false the
   * grid renders without an intersection sentinel because there is nothing
   * more to fetch.
   */
  initialHasMore: boolean;
};

const PRIORITY_COUNT = 4; // first row of 2-col grid x 2 — render eagerly above the fold

export function DancerInfiniteGrid({
  q,
  initialDancers,
  initialHasMore,
}: Props) {
  const [dancers, setDancers] = useState<DancerListItem[]>(initialDancers);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Tracks the offset of the next page to request. Starts after whatever the
  // server pre-rendered. Lives in a ref so the IO callback is stable.
  const offsetRef = useRef<number>(initialDancers.length);
  // Guards against double-firing: when an in-flight load resolves we only
  // commit results if `q` is still the value we asked for.
  const requestQRef = useRef<string>(q);

  // Reset is handled via parent's key={q} which remounts this component.

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    const requestedQ = requestQRef.current;
    const requestedOffset = offsetRef.current;

    const result = await loadMoreDancersAction({
      q: requestedQ,
      offset: requestedOffset,
    });

    // Drop stale results if the query changed mid-flight
    if (requestQRef.current !== requestedQ) {
      setLoading(false);
      return;
    }

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const { dancers: more, hasMore: nextHasMore } = result.data!;
    setDancers((prev) => {
      // De-duplicate by id in case of overlap
      const seen = new Set(prev.map((d) => d.id));
      const merged = [...prev];
      for (const d of more) {
        if (!seen.has(d.id)) merged.push(d);
      }
      offsetRef.current = merged.length;
      return merged;
    });
    setHasMore(nextHasMore);
    setLoading(false);
  }, [hasMore, loading]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMore();
          }
        }
      },
      { rootMargin: "400px 0px" }, // start fetching when sentinel is 400px below viewport
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  if (dancers.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
        {q ? "검색 결과가 없습니다." : "아직 등록된 댄서가 없습니다."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-3">
        {dancers.map((d, i) => (
          <li key={d.id}>
            <Link
              href={`/d/${d.slug ?? d.id}`}
              className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-card"
            >
              {d.profile_img ? (
                <Image
                  src={d.profile_img}
                  alt={d.stage_name}
                  fill
                  sizes="(max-width: 448px) 50vw, 220px"
                  priority={i < PRIORITY_COUNT}
                  loading={i < PRIORITY_COUNT ? "eager" : "lazy"}
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 12px, rgba(255,255,255,0.09) 12px 24px), #1c1c19",
                  }}
                />
              )}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(14,14,12,0.95) 5%, transparent 60%)",
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-0.5 p-3">
                <p className="text-sm font-semibold leading-tight text-white">
                  {d.stage_name}
                </p>
                {d.korean_name ? (
                  <p className="text-[11px] text-white/65">{d.korean_name}</p>
                ) : null}
                {(d.genres ?? []).length > 0 ? (
                  <p className="text-[10px] text-white/55">
                    {(d.genres ?? []).slice(0, 2).join(" · ")}
                  </p>
                ) : null}
              </div>
              {!d.profile_id && !d.is_verified ? (
                <span className="absolute right-2 top-2 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-ink-3 backdrop-blur">
                  큐레이션
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {error ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={loadMore}
            className="rounded-full border border-hairline-2 px-4 py-1.5 text-xs text-ink-2 hover:bg-secondary"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {hasMore ? (
        <>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <div className="flex justify-center pb-4">
            <SkeletonRow visible={loading} />
          </div>
        </>
      ) : dancers.length >= DANCER_PAGE_SIZE ? (
        <p className="pb-4 text-center text-xs text-ink-3">
          마지막입니다.
        </p>
      ) : null}
    </div>
  );
}

function SkeletonRow({ visible }: { visible: boolean }) {
  return (
    <div
      className={
        "h-5 w-24 animate-pulse rounded-full bg-secondary " +
        (visible ? "opacity-100" : "opacity-0")
      }
      aria-label={visible ? "더 불러오는 중" : undefined}
    />
  );
}
