"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 24;

type Dancer = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  genres: string[] | null;
  specialties: string[] | null;
  profile_id: string | null;
};

type Team = {
  id: string;
  team_name: string;
  korean_name: string | null;
  slug: string | null;
  profile_img: string | null;
  location: string | null;
  genres: string[] | null;
  specialties: string[] | null;
};

type Tab = "dancers" | "teams";

export function DirectoryClient({
  initialDancers,
  initialTeams,
  initialTab,
  totalDancers,
  totalTeams,
}: {
  initialDancers: Dancer[];
  initialTeams: Team[];
  initialTab: Tab;
  totalDancers: number;
  totalTeams: number;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [dancers, setDancers] = useState<Dancer[]>(initialDancers);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  const [dancerHasMore, setDancerHasMore] = useState(
    initialDancers.length === PAGE_SIZE,
  );
  const [teamHasMore, setTeamHasMore] = useState(
    initialTeams.length === PAGE_SIZE,
  );
  const [, startTransition] = useTransition();
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce search input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const fetchPage = useCallback(
    async (
      target: Tab,
      q: string,
      offset: number,
    ): Promise<{ dancers?: Dancer[]; teams?: Team[] }> => {
      const supabase = createClient();
      if (target === "dancers") {
        // 내부 경력점수 정렬 + 이름 검색을 RPC(SECURITY DEFINER)로 위임.
        // 점수는 노출하지 않고 정렬만 수행한다.
        const safe = q ? q.replace(/[%_,]/g, "") : "";
        const { data } = await supabase.rpc("list_directory_dancers", {
          _limit: PAGE_SIZE,
          _offset: offset,
          _q: safe,
        });
        return { dancers: (data ?? []) as Dancer[] };
      } else {
        let qb = supabase
          .from("teams")
          .select(
            "id, team_name, korean_name, slug, profile_img, location, genres, specialties",
          )
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (q) {
          const safe = q.replace(/[%_,]/g, "");
          qb = qb.or(`team_name.ilike.%${safe}%,korean_name.ilike.%${safe}%`);
        }
        const { data } = await qb;
        return { teams: (data ?? []) as Team[] };
      }
    },
    [],
  );

  // First-load skip flag: avoid refetching identical initial state
  const skipFirstFetch = useRef(true);

  // Refetch when debounced query OR tab changes
  useEffect(() => {
    if (skipFirstFetch.current && debouncedQ === "" && tab === initialTab) {
      skipFirstFetch.current = false;
      return;
    }
    startTransition(() => {
      void (async () => {
        const result = await fetchPage(tab, debouncedQ, 0);
        if (tab === "dancers") {
          setDancers(result.dancers ?? []);
          setDancerHasMore((result.dancers ?? []).length === PAGE_SIZE);
        } else {
          setTeams(result.teams ?? []);
          setTeamHasMore((result.teams ?? []).length === PAGE_SIZE);
        }
      })();
    });
  }, [debouncedQ, tab, initialTab, fetchPage]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const offset = tab === "dancers" ? dancers.length : teams.length;
      const result = await fetchPage(tab, debouncedQ, offset);
      if (tab === "dancers") {
        const next = result.dancers ?? [];
        setDancers((prev) => [...prev, ...next]);
        setDancerHasMore(next.length === PAGE_SIZE);
      } else {
        const next = result.teams ?? [];
        setTeams((prev) => [...prev, ...next]);
        setTeamHasMore(next.length === PAGE_SIZE);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const list = tab === "dancers" ? dancers : teams;
  const hasMore = tab === "dancers" ? dancerHasMore : teamHasMore;
  const total = tab === "dancers" ? totalDancers : totalTeams;
  const shown = list.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-full border border-border bg-card p-1 text-xs lg:w-fit lg:self-start">
        <TabBtn
          active={tab === "dancers"}
          onClick={() => setTab("dancers")}
          label="개인"
        />
        <TabBtn
          active={tab === "teams"}
          onClick={() => setTab("teams")}
          label="팀"
        />
      </div>

      <div className="w-full lg:max-w-xl">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "teams" ? "팀명 검색" : "활동명, 한글 이름 검색"}
          autoComplete="off"
          type="search"
          enterKeyHint="search"
        />
      </div>

      {total > 0 && !debouncedQ ? (
        <p className="text-[11px] text-ink-3">
          총 {total.toLocaleString()}{tab === "dancers" ? "명" : "팀"} 중 {shown.toLocaleString()}{tab === "dancers" ? "명" : "팀"} 표시
        </p>
      ) : null}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          {debouncedQ
            ? "검색 결과가 없습니다."
            : tab === "dancers"
              ? "아직 등록된 댄서가 없습니다."
              : "아직 등록된 팀이 없습니다."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tab === "dancers"
            ? dancers.map((d) => (
                <li key={d.id}>
                  <Card
                    href={`/d/${d.slug ?? d.id}`}
                    name={d.stage_name}
                    sub={d.korean_name}
                    tags={d.genres}
                    img={d.profile_img}
                    badge={d.profile_id ? null : "큐레이션"}
                  />
                </li>
              ))
            : teams.map((t) => (
                <li key={t.id}>
                  <Card
                    href={`/t/${t.slug ?? t.id}`}
                    name={t.team_name}
                    sub={t.korean_name}
                    tags={t.genres}
                    img={t.profile_img}
                    badge="팀"
                  />
                </li>
              ))}
        </ul>
      )}

      {hasMore && list.length > 0 ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mx-auto mt-2 rounded-full border border-hairline-2 bg-card px-6 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      ) : null}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-1 items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-ink-3 hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

function Card({
  href,
  name,
  sub,
  tags,
  img,
  badge,
}: {
  href: string;
  name: string;
  sub: string | null;
  tags: string[] | null;
  img: string | null;
  badge: string | null;
}) {
  return (
    <Link
      href={href}
      className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-border bg-card"
    >
      {img ? (
        <Image
          src={img}
          alt={name}
          fill
          sizes="(max-width: 448px) 50vw, 220px"
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
          {name}
        </p>
        {sub ? <p className="text-[11px] text-white/65">{sub}</p> : null}
        {(tags ?? []).length > 0 ? (
          <p className="text-[10px] text-white/55">
            {(tags ?? []).slice(0, 2).join(" · ")}
          </p>
        ) : null}
      </div>
      {badge ? (
        <span className="absolute right-2 top-2 rounded-full bg-card/80 px-2 py-0.5 text-[10px] text-ink-3 backdrop-blur">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
