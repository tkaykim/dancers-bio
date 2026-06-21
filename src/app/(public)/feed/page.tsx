import Link from "next/link";
import Image from "next/image";
import { getProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectListView } from "@/components/project/ProjectListView";
import { daysUntilDeadline, isExpired } from "@/lib/utils/deadline";

type Row = {
  id: string;
  short_code: string | null;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: string;
  category:
    | "performance"
    | "choreography"
    | "instructor"
    | "broadcast"
    | "advertisement"
    | "event"
    | "video"
    | "other"
    | null;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  application_deadline: string | null;
  is_standing_pool: boolean | null;
  created_at: string;
  owner_id: string;
  region_text: string | null;
  genre: { label_ko: string } | null;
  region: { label_ko: string } | null;
};

type SpotlightDancer = {
  id: string;
  stage_name: string;
  slug: string | null;
  profile_img: string | null;
};

type FeedProject = {
  id: string;
  short_code: string | null;
  visibility: "public" | "private";
  title: string;
  category: Row["category"];
  pay_amount: number | null;
  pay_type: Row["pay_type"];
  application_deadline: string | null;
  is_standing_pool: boolean;
  created_at: string;
  owner_name: string | null;
  genre_label: string | null;
  region_label: string | null;
  session_count: number;
};

type YoutubeVideo = {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  published: string;
  views: number | null;
  kind: "Shorts" | "Interview";
};

const DEETZ_YOUTUBE_RSS =
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCHnObQO12HVxYeWfq3nRveg";
const DEETZ_YOUTUBE_URL = "https://www.youtube.com/@deetzmagazine";
const DEETZ_INSTAGRAM_URL = "https://www.instagram.com/deetz_magazine/";

function decodeXml(value: string | null): string {
  if (!value) return "";
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function pickXml(entry: string, pattern: RegExp): string {
  return decodeXml(entry.match(pattern)?.[1] ?? null);
}

function cleanVideoTitle(title: string): string {
  return title
    .replace(/^\[Today's dee'tz\]\s*/i, "")
    .replace(/\s*#shorts?$/i, "")
    .trim();
}

function formatViews(views: number | null): string {
  if (!views) return "YouTube";
  if (views >= 10000) {
    return `${(views / 10000).toFixed(views % 10000 === 0 ? 0 : 1)}만 views`;
  }
  return `${views.toLocaleString("ko-KR")} views`;
}

function displayProjectTitle(project: FeedProject | undefined): string {
  if (!project) return "Open Calls";
  return project.visibility === "private" ? "비공개 공고" : project.title;
}

async function getDeetzVideos(): Promise<YoutubeVideo[]> {
  try {
    const response = await fetch(DEETZ_YOUTUBE_RSS, {
      next: { revalidate: 60 * 60 },
    });
    if (!response.ok) return [];

    const xml = await response.text();
    const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];

    return entries
      .map((entry) => {
        const id = pickXml(entry, /<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
        const title = cleanVideoTitle(
          pickXml(entry, /<title>([\s\S]*?)<\/title>/),
        );
        const url = pickXml(
          entry,
          /<link rel="alternate" href="([\s\S]*?)"\/>/,
        );
        const thumbnail = pickXml(
          entry,
          /<media:thumbnail url="([\s\S]*?)"/,
        );
        const published = pickXml(entry, /<published>([\s\S]*?)<\/published>/);
        const views = Number(
          pickXml(entry, /<media:statistics views="(\d+)"/),
        );
        const kind: YoutubeVideo["kind"] = url.includes("/shorts/")
          ? "Shorts"
          : "Interview";

        return {
          id,
          title,
          url,
          thumbnail,
          published,
          views: Number.isFinite(views) && views > 0 ? views : null,
          kind,
        };
      })
      .filter((video) => video.id && video.title && video.thumbnail)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export default async function FeedPage() {
  // 비로그인도 피드 열람 가능. 로그인 유도는 공고 상세에서.
  const profile = await getProfile();
  const supabase = await createClient();
  const videosPromise = getDeetzVideos();

  const { data: rawProjects } = await supabase
    .from("projects")
    .select(
      `id, short_code, title, description, visibility, status, category, pay_amount, pay_type,
       application_deadline, is_standing_pool, created_at, owner_id, region_text,
       genre:genres ( label_ko ),
       region:regions ( label_ko )`,
    )
    .eq("status", "open")
    .is("deleted_at", null)
    // 최신순으로 가져온다. 만료 공고가 ascending deadline 정렬로 상단을 차지해
    // limit을 잠식하지 않도록(클라이언트가 마감순 재정렬). 기본 노출에서 만료는 제외.
    .order("created_at", { ascending: false })
    .limit(200);

  const projects = (rawProjects ?? []) as unknown as Row[];

  // Fetch owner names + session counts in batch
  const ownerIds = Array.from(new Set(projects.map((p) => p.owner_id)));
  const projectIds = projects.map((p) => p.id);

  const [{ data: ownersData }, { data: sessionsData }] = await Promise.all([
    ownerIds.length > 0
      ? supabase.from("profiles").select("id, display_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    projectIds.length > 0
      ? supabase
          .from("project_schedules")
          .select("project_id, starts_at")
          .in("project_id", projectIds)
          .eq("status", "confirmed")
      : Promise.resolve({ data: [] as { project_id: string; starts_at: string }[] }),
  ]);

  const { data: spotlightData } = await supabase.rpc("list_directory_dancers", {
    _limit: 3,
    _offset: 0,
    _q: "",
  });
  const videos = await videosPromise;

  const ownerMap = new Map((ownersData ?? []).map((o) => [o.id, o.display_name]));
  const sessionMap = new Map<string, number>();
  for (const s of sessionsData ?? []) {
    sessionMap.set(s.project_id, (sessionMap.get(s.project_id) ?? 0) + 1);
  }

  const isAdmin = !!profile?.is_admin;

  const enriched: FeedProject[] = projects.map((p) => {
    const isPrivate = p.visibility === "private";
    // 비공개 공고는 admin 외엔 short_code도 노출하지 않음 (DOM 인스펙트로도 못 찾게)
    const revealDetails = !isPrivate || isAdmin;
    return {
      id: p.id,
      short_code: revealDetails ? p.short_code : null,
      visibility: p.visibility,
      title: p.title,
      category: p.category,
      pay_amount: p.pay_amount,
      pay_type: p.pay_type,
      application_deadline: p.application_deadline,
      is_standing_pool: !!p.is_standing_pool,
      created_at: p.created_at,
      owner_name: ownerMap.get(p.owner_id) ?? null,
      genre_label: p.genre?.label_ko ?? null,
      region_label: p.region_text ?? p.region?.label_ko ?? null,
      session_count: sessionMap.get(p.id) ?? 0,
    };
  });

  const canCreate = profile?.can_create_project || profile?.is_admin;
  // 헤더 "모집 중" 카운트는 만료되지 않은 공고 기준 (만료는 기본 숨김).
  const activeCount = enriched.filter(
    (p) => !isExpired(p.application_deadline, p.is_standing_pool),
  ).length;
  const urgentCount = enriched.filter((p) => {
    if (isExpired(p.application_deadline, p.is_standing_pool)) return false;
    const d = daysUntilDeadline(p.application_deadline);
    return d !== null && d <= 7;
  }).length;
  const standingCount = enriched.filter((p) => p.is_standing_pool).length;
  const regions = Array.from(
    new Set(enriched.map((p) => p.region_label).filter((r): r is string => !!r)),
  );
  const spotlight = ((spotlightData ?? []) as SpotlightDancer[]).slice(0, 3);
  const featured = enriched.find(
    (p) => !isExpired(p.application_deadline, p.is_standing_pool),
  );
  const heroVideo =
    videos.find((video) => video.kind === "Interview") ?? videos[0] ?? null;
  const sideVideos = videos
    .filter((video) => video.id !== heroVideo?.id)
    .slice(0, 2);
  const railVideos = videos
    .filter((video) => video.id !== heroVideo?.id)
    .slice(0, 3);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 lg:max-w-none lg:px-0 lg:py-0">
      <section className="hidden overflow-hidden rounded-md bg-[#11100d] p-px text-white lg:grid lg:min-h-[430px] lg:grid-cols-[minmax(0,1fr)_190px_260px] lg:gap-px">
        <VideoFeature video={heroVideo} fallback={spotlight[0] ?? null} />
        <div className="grid grid-rows-2 gap-px">
          {sideVideos.map((video) => (
            <VideoSmall key={video.id} video={video} />
          ))}
          {sideVideos.length < 2 ? <InstagramMini /> : null}
        </div>
        <div className="grid grid-rows-2 gap-px">
          <InstagramMini />
          <HeroPlatformMini
            featured={featured}
            activeCount={activeCount}
            urgentCount={urgentCount}
            standingCount={standingCount}
          />
        </div>
      </section>

      <section className="hidden grid-cols-3 gap-3 lg:grid">
        <VideoTile video={railVideos[0] ?? heroVideo} />
        <VideoTile video={railVideos[1] ?? null} />
        <VideoTile video={railVideos[2] ?? null} />
      </section>

      <header className="flex items-end justify-between lg:hidden">
        <div>
          <h1 className="text-3xl font-extrabold leading-none tracking-normal">
            Casting
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-ink-3">
            {activeCount} 모집 중
          </p>
        </div>
        {canCreate ? (
          <Link href="/projects/new">
            <Button size="sm" className="rounded-full">
              + 개설
            </Button>
          </Link>
        ) : !profile ? (
          <div className="flex gap-1.5">
            <Link href="/login?next=/feed">
              <Button size="sm" variant="outline" className="rounded-full">
                로그인
              </Button>
            </Link>
            <Link href="/signup?next=/feed">
              <Button size="sm" className="rounded-full">
                가입
              </Button>
            </Link>
          </div>
        ) : null}
      </header>

      <section className="hidden items-end justify-between gap-6 lg:flex">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-3">
            Open Calls
          </p>
          <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-normal">
            지금 지원 가능한 공고
          </h2>
        </div>
        <div className="flex items-center gap-5 text-sm text-ink-3">
          <span>{activeCount} open</span>
          <span>{regions.length} regions</span>
          {featured ? (
            <span className="max-w-[280px] truncate text-foreground">
              {displayProjectTitle(featured)}
            </span>
          ) : null}
          {canCreate ? (
            <Link href="/projects/new">
              <Button size="sm" className="rounded-full">
                + 개설
              </Button>
            </Link>
          ) : null}
        </div>
      </section>

      {enriched.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">
            아직 공개된 프로젝트가 없습니다.
          </p>
        </div>
      ) : (
        <ProjectListView projects={enriched} isAdmin={isAdmin} />
      )}
    </div>
  );
}

function VideoFeature({
  video,
  fallback,
}: {
  video: YoutubeVideo | null;
  fallback: SpotlightDancer | null;
}) {
  if (!video) {
    return <SpotlightFeature dancer={fallback} />;
  }

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer"
      className="group relative min-h-[430px] overflow-hidden bg-black"
    >
      <Image
        src={video.thumbnail}
        alt={video.title}
        fill
        sizes="(min-width: 1024px) 560px"
        className="object-cover transition duration-500 group-hover:scale-[1.035]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-black/10" />
      <div className="absolute left-6 right-6 top-6 flex items-center justify-between gap-4">
        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#11100d]">
          Deetz TV
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/68">
          {video.kind}
        </span>
      </div>
      <div className="absolute bottom-6 left-6 right-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
          {formatViews(video.views)}
        </p>
        <h2 className="mt-3 line-clamp-2 max-w-[560px] text-3xl font-extrabold leading-tight tracking-normal text-white">
          {video.title}
        </h2>
      </div>
    </a>
  );
}

function SpotlightFeature({ dancer }: { dancer: SpotlightDancer | null }) {
  return (
    <Link
      href={dancer ? `/d/${dancer.slug ?? dancer.id}` : "/dancers"}
      className="relative min-h-[430px] overflow-hidden bg-[#24221b]"
    >
      {dancer?.profile_img ? (
        <Image
          src={dancer.profile_img}
          alt={dancer.stage_name}
          fill
          sizes="(min-width: 1024px) 560px"
          className="object-cover opacity-[0.9]"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute bottom-6 left-6 right-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/58">
          Dancer Profile
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-normal text-white">
          {dancer?.stage_name ?? "deetz dancers"}
        </h2>
      </div>
    </Link>
  );
}

function VideoSmall({ video }: { video: YoutubeVideo }) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer"
      className="group relative overflow-hidden bg-black"
    >
      <Image
        src={video.thumbnail}
        alt={video.title}
        fill
        sizes="190px"
        className="object-cover transition duration-500 group-hover:scale-[1.05]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/12 to-transparent" />
      <div className="absolute bottom-4 left-4 right-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/58">
          {video.kind}
        </p>
        <h3 className="mt-2 line-clamp-3 text-sm font-bold leading-tight tracking-normal text-white">
          {video.title}
        </h3>
      </div>
    </a>
  );
}

function InstagramMini() {
  return (
    <a
      href={DEETZ_INSTAGRAM_URL}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col justify-between bg-[#f46642] p-5 text-[#17100c]"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em]">
        Instagram
      </p>
      <div>
        <p className="text-lg font-extrabold tracking-normal">
          @deetz_magazine
        </p>
        <p className="mt-2 text-sm font-semibold leading-snug">
          릴스 · 현장 스냅
        </p>
      </div>
    </a>
  );
}

function HeroPlatformMini({
  featured,
  activeCount,
  urgentCount,
  standingCount,
}: {
  featured: FeedProject | undefined;
  activeCount: number;
  urgentCount: number;
  standingCount: number;
}) {
  const href = featured?.short_code
    ? `/projects/${featured.short_code}`
    : "/feed";

  return (
    <Link
      href={href}
      className="flex flex-col justify-between bg-[#e6ebe3] p-5 text-[#151713]"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#151713]/55">
        deetz.kr
      </p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xl font-extrabold leading-none">{activeCount}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#151713]/50">
            Open
          </p>
        </div>
        <div>
          <p className="text-xl font-extrabold leading-none">{urgentCount}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#151713]/50">
            D-7
          </p>
        </div>
        <div>
          <p className="text-xl font-extrabold leading-none">{standingCount}</p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#151713]/50">
            Always
          </p>
        </div>
      </div>
      <h3 className="line-clamp-2 text-lg font-extrabold leading-tight tracking-normal">
        {displayProjectTitle(featured)}
      </h3>
    </Link>
  );
}

function VideoTile({ video }: { video: YoutubeVideo | null }) {
  if (!video) {
    return (
      <a
        href={DEETZ_YOUTUBE_URL}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-[176px] flex-col justify-between rounded-md border border-border bg-[#14120c] p-5 text-white"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
          YouTube
        </p>
        <div>
          <h3 className="text-xl font-extrabold tracking-normal">
            @deetzmagazine
          </h3>
          <p className="mt-2 text-sm font-semibold text-white/70">
            인터뷰 · 쇼츠
          </p>
        </div>
      </a>
    );
  }

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer"
      className="group relative min-h-[176px] overflow-hidden rounded-md bg-black"
    >
      <Image
        src={video.thumbnail}
        alt={video.title}
        fill
        sizes="(min-width: 1024px) 320px"
        className="object-cover transition duration-500 group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-transparent" />
      <div className="absolute inset-x-5 bottom-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/58">
          {video.kind} · {formatViews(video.views)}
        </p>
        <h3 className="mt-2 line-clamp-2 text-lg font-extrabold leading-tight tracking-normal text-white">
          {video.title}
        </h3>
      </div>
    </a>
  );
}
