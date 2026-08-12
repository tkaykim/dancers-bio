"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";
import { requestRosterAccessAction } from "@/app/actions/roster-access";
import { Input } from "@/components/ui/input";
import {
  ROSTER_ACCESS_PURPOSES,
  type RosterAccessPurpose,
} from "@/lib/roster-access";

const PAGE_SIZE = 24;
// 비로그인·로그인 모두 디렉토리 브라우즈는 이만큼까지만 — 그 이상은 '열람 요청'.
const PUBLIC_BROWSE_CAP = 40;

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
  is_verified: boolean | null;
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

type OwnDancer = {
  id: string;
  slug: string | null;
  stage_name: string;
  is_active: boolean;
};

export function DirectoryClient({
  initialDancers,
  initialTeams,
  initialTab,
  totalDancers,
  totalTeams,
  isLoggedIn,
  ownDancers,
}: {
  initialDancers: Dancer[];
  initialTeams: Team[];
  initialTab: Tab;
  totalDancers: number;
  totalTeams: number;
  isLoggedIn: boolean;
  ownDancers: OwnDancer[];
}) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [purpose, setPurpose] = useState<RosterAccessPurpose | null>(null);
  const [details, setDetails] = useState("");
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
      requestedLimit = PAGE_SIZE,
    ): Promise<{ dancers?: Dancer[]; teams?: Team[] }> => {
      const supabase = createClient();
      if (target === "dancers") {
        const limit = !q
          ? Math.min(requestedLimit, PUBLIC_BROWSE_CAP - offset)
          : requestedLimit;
        if (limit <= 0) return { dancers: [] };
        // 내부 경력점수 정렬 + 이름 검색을 RPC(SECURITY DEFINER)로 위임.
        // 점수는 노출하지 않고 정렬만 수행한다.
        const safe = q ? q.replace(/[%_,]/g, "") : "";
        const { data } = await supabase.rpc("list_directory_dancers", {
          _limit: limit,
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
      if (
        tab === "dancers" &&
        !debouncedQ &&
        offset >= PUBLIC_BROWSE_CAP
      ) {
        setDancerHasMore(false);
        return;
      }
      const requestedLimit =
        tab === "dancers" && !debouncedQ
          ? Math.min(PAGE_SIZE, PUBLIC_BROWSE_CAP - offset)
          : PAGE_SIZE;
      const result = await fetchPage(
        tab,
        debouncedQ,
        offset,
        requestedLimit,
      );
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

  function handleRequestAccess() {
    if (!isLoggedIn) {
      router.push("/login?next=/dancers");
      return;
    }
    setShowRequestForm(true);
  }

  async function submitRequest() {
    if (!purpose || purpose === "profile_check") return;
    if (requesting || requested) return;
    setRequesting(true);
    try {
      const res = await requestRosterAccessAction({ purpose, details });
      if (res.ok) {
        setRequested(true);
        toast.success("문의가 접수되었습니다. 검토 후 연락드리겠습니다.");
      } else {
        toast.error(res.error);
      }
    } finally {
      setRequesting(false);
    }
  }

  const list = tab === "dancers" ? dancers : teams;
  const hasMore = tab === "dancers" ? dancerHasMore : teamHasMore;
  const total = tab === "dancers" ? totalDancers : totalTeams;
  const shown = list.length;
  // 디렉토리(개인) 브라우즈가 공개 캡(40)에 도달했고, 더 있을 때 → '열람 요청' 전환.
  const atDancerCap =
    tab === "dancers" &&
    !debouncedQ &&
    dancers.length >= PUBLIC_BROWSE_CAP &&
    totalDancers > PUBLIC_BROWSE_CAP;

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
                    badge={!d.profile_id && !d.is_verified ? "큐레이션" : null}
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

      {atDancerCap ? (
        <div className="mx-auto mt-2 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-hairline-2 bg-card p-6 text-center">
          <p className="text-sm font-semibold text-foreground">
            더 많은 댄서가 필요하신가요?
          </p>
          <p className="text-xs leading-relaxed text-ink-3">
            공개 디렉토리에는 {PUBLIC_BROWSE_CAP}명까지 표시됩니다.
            <br />
            전체 명단은 공개하지 않고, 목적을 확인한 뒤 개별적으로 안내드립니다.
          </p>
          <button
            type="button"
            onClick={handleRequestAccess}
            disabled={requesting || requested || showRequestForm}
            className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {requested ? "문의 접수됨 ✓" : isLoggedIn ? "목적 선택하고 문의하기" : "로그인하고 문의하기"}
          </button>

          {showRequestForm ? (
            <div className="mt-2 flex w-full flex-col gap-3 text-left">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-foreground">
                  어떤 목적으로 찾고 계신가요?
                </p>
                {ROSTER_ACCESS_PURPOSES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPurpose(item.value)}
                    className={
                      "rounded-xl border px-3 py-3 text-left transition-colors " +
                      (purpose === item.value
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-secondary")
                    }
                  >
                    <span className="block text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-ink-3">
                      {item.description}
                    </span>
                  </button>
                ))}
              </div>

              {purpose === "profile_check" ? (
                <ProfileLinkPanel ownDancers={ownDancers} />
              ) : purpose ? (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="roster-request-details"
                    className="text-xs font-semibold text-foreground"
                  >
                    구체적인 내용을 적어주세요.
                  </label>
                  <textarea
                    id="roster-request-details"
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    maxLength={2000}
                    rows={5}
                    placeholder="프로젝트·회사명, 찾는 장르/조건, 예상 일정, 협업 내용 등을 적어주세요."
                    className="w-full resize-y rounded-xl border border-border bg-card px-3 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-ink-3 focus:border-primary"
                  />
                  <p className="text-[11px] leading-relaxed text-ink-3">
                    작성해주신 내용을 확인한 뒤 deetz 운영팀이 이메일로 연락드립니다.
                  </p>
                  <button
                    type="button"
                    onClick={submitRequest}
                    disabled={requesting || requested || details.trim().length < 10}
                    className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                  >
                    {requested
                      ? "문의 접수됨 ✓"
                      : requesting
                        ? "전송 중…"
                        : "문의 접수하기"}
                  </button>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-ink-3">
                  목적을 선택하면 필요한 안내가 표시됩니다.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : hasMore && list.length > 0 ? (
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

function ProfileLinkPanel({ ownDancers }: { ownDancers: OwnDancer[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/40 p-4">
      <p className="text-sm font-semibold text-foreground">내 공개 프로필</p>
      {ownDancers.length > 0 ? (
        ownDancers.map((dancer) => {
          const profileKey = dancer.slug ?? dancer.id;
          const deetzUrl = `https://deetz.kr/d/${profileKey}`;
          const dancersBioUrl = dancer.slug
            ? `https://dancers.bio/${dancer.slug}`
            : `https://dancers.bio/d/${dancer.id}`;
          return (
            <div
              key={dancer.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
            >
              <p className="text-sm font-medium text-foreground">
                {dancer.stage_name}
              </p>
              <p className="text-xs leading-relaxed text-ink-3">
                두 링크 중 하나를 SNS 프로필에 등록해두시면 됩니다.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={deetzUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border px-3 py-2 text-center text-xs font-semibold text-foreground hover:bg-secondary"
                >
                  deetz.kr 프로필 보기
                </a>
                <a
                  href={dancersBioUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border px-3 py-2 text-center text-xs font-semibold text-foreground hover:bg-secondary"
                >
                  dancers.bio 프로필 보기
                </a>
              </div>
            </div>
          );
        })
      ) : (
        <>
          <p className="text-xs leading-relaxed text-ink-3">
            아직 연결된 댄서 프로필이 없습니다.
          </p>
          <Link
            href="/me/portfolio"
            className="rounded-lg bg-primary px-3 py-2 text-center text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            내 프로필 확인·등록하기
          </Link>
        </>
      )}
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
