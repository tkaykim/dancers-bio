import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth/guard";
import { CAREER_CATEGORY_LABELS } from "@/lib/validation/portfolio";
import { VideoThumbnail } from "@/components/portfolio/VideoEmbed";
import { CareerGroup } from "@/components/portfolio/CareerGroup";
import { ProfileFooterCTA } from "@/components/portfolio/ProfileFooterCTA";
// parseVideoUrl is now used inside CareerGroup's dialog
import { SendProposalDialog } from "@/components/project/SendProposalDialog";

type Career = {
  id: number;
  type: string;
  title: string;
  date: string;
  details: {
    link?: string;
    role?: string;
    description?: string;
    thumbnail?: string;
  } | null;
  is_representative: boolean;
};

type DancerRow = {
  id: string;
  stage_name: string;
  korean_name: string | null;
  slug: string | null;
  gender: string | null;
  bio: string | null;
  location: string | null;
  specialties: string[] | null;
  genres: string[] | null;
  profile_img: string | null;
  social_links: Record<string, string> | null;
  is_verified: boolean | null;
  portfolio:
    | { url?: string; thumbnail?: string; type?: string; id?: string }[]
    | null;
  profile_id: string | null;
  portfolio_file_url: string | null;
  portfolio_file_name: string | null;
  portfolio_file_size_bytes: number | null;
  portfolio_file_mime: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadDancer(slugOrId: string) {
  const supabase = await createClient();
  const query = UUID_RE.test(slugOrId)
    ? supabase.from("dancers").select("*").eq("id", slugOrId).maybeSingle()
    : supabase.from("dancers").select("*").eq("slug", slugOrId).maybeSingle();
  const { data } = await query;
  return data as DancerRow | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dancer = await loadDancer(slug);
  if (!dancer) return { title: { absolute: "deetz" } };
  return {
    title: { absolute: `${dancer.stage_name} · deetz` },
    description: dancer.bio ?? `${dancer.stage_name}의 댄서 포트폴리오`,
  };
}

export default async function PublicDancerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dancer = await loadDancer(slug);
  if (!dancer) notFound();

  const supabase = await createClient();
  const [{ data: careers }, viewer, viewerProfile] = await Promise.all([
    supabase
      .from("careers")
      .select("id, type, title, date, details, is_representative")
      .eq("dancer_id", dancer.id)
      .eq("is_public", true)
      .order("is_representative", { ascending: false })
      .order("date", { ascending: false }),
    getUser(),
    getProfile(),
  ]);

  // claim 상태
  const isCuration = !dancer.profile_id;
  const isOwner = Boolean(viewer && dancer.profile_id === viewer.id);

  // Phase 1: direct_proposal 복원. 프로젝트 개설 권한이 있는 로그인 사용자가
  // 댄서(claimed·미claim 공통)에게 제안 가능. 본인 소유 프로필엔 불가.
  const canPropose =
    Boolean(viewer) &&
    Boolean(viewerProfile?.can_create_project || viewerProfile?.is_admin) &&
    !isOwner;

  let myProjects: Array<{ id: string; title: string; visibility: "public" | "private"; status: string; allow_team_apply: boolean }> = [];
  if (canPropose) {
    const { data: mp } = await supabase
      .from("projects")
      .select("id, title, visibility, status, allow_team_apply")
      .eq("owner_id", viewer!.id)
      .is("deleted_at", null)
      .in("status", ["draft", "open"])
      .order("created_at", { ascending: false })
      .limit(20);
    myProjects = (mp ?? []) as typeof myProjects;
  }

  let alreadyRequested = false;
  let existingClaimId: string | null = null;
  if (viewer && isCuration) {
    const { data: existing } = await supabase
      .from("dancer_claim_requests")
      .select("id, status")
      .eq("dancer_id", dancer.id)
      .eq("requester_id", viewer.id)
      .eq("status", "pending")
      .maybeSingle();
    alreadyRequested = Boolean(existing);
    existingClaimId = (existing?.id as string) ?? null;
  }

  // 미claim 프로필에 도착한 대기 중 캐스팅 제안 수 — claim 후크. (SECURITY DEFINER RPC)
  let pendingProposalCount = 0;
  if (isCuration) {
    const { data: cnt } = await supabase.rpc("dancer_pending_proposal_count", {
      d_id: dancer.id,
    });
    pendingProposalCount = typeof cnt === "number" ? cnt : 0;
  }

  const list = (careers ?? []) as Career[];
  const social = (dancer.social_links ?? {}) as Record<string, string>;
  const portfolio = (dancer.portfolio ?? []).filter((p) => p?.url) as Array<{
    url: string;
    thumbnail?: string;
    type?: string;
  }>;
  const yearsOnPlatform = list.length
    ? new Date().getFullYear() - Math.min(...list.map((c) => Number(c.date.slice(0, 4))))
    : 0;

  // Split highlights (representative) vs. rest
  const highlights = list.filter((c) => c.is_representative);
  const rest = list.filter((c) => !c.is_representative);

  // Group non-highlight careers by type for the credits section
  const grouped = new Map<string, Career[]>();
  for (const c of rest) {
    const arr = grouped.get(c.type) ?? [];
    arr.push(c);
    grouped.set(c.type, arr);
  }
  // Order: choreo > broadcast > performance > judge > award > workshop > battle > other
  const TYPE_ORDER = ["choreo", "broadcast", "performance", "judge", "award", "workshop", "battle", "other"];
  const orderedTypes = TYPE_ORDER.filter((t) => grouped.has(t));

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Back button (top-left, over hero) */}
      <Link
        href="/dancers"
        aria-label="뒤로"
        className="absolute left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur hover:bg-background/90"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </Link>
      {/* Hero */}
      <div className="relative h-[420px] overflow-hidden">
        {dancer.profile_img ? (
          <Image
            src={dancer.profile_img}
            alt={dancer.stage_name}
            fill
            priority
            sizes="(max-width: 672px) 100vw, 672px"
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.07), transparent 55%),
                repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 12px, rgba(255,255,255,0.09) 12px 24px),
                #1c1c19
              `,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(14,14,12,1) 8%, rgba(14,14,12,0.6) 40%, transparent 80%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 px-6 pb-7">
          <div className="flex flex-wrap gap-1.5">
            {dancer.is_verified ? (
              <span className="rounded-full border border-hairline-2 bg-card/60 px-2.5 py-0.5 text-[11px] font-medium text-ink-2 backdrop-blur">
                Verified ✓
              </span>
            ) : null}
            {dancer.location ? (
              <span className="rounded-full border border-hairline-2 bg-card/60 px-2.5 py-0.5 text-[11px] font-medium text-ink-2 backdrop-blur">
                {dancer.location}
              </span>
            ) : null}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight leading-none text-white">
            {dancer.stage_name}
          </h1>
          <p className="text-sm font-medium text-white/80">
            {(dancer.genres ?? []).slice(0, 3).join(" · ")}
            {dancer.korean_name ? ` · ${dancer.korean_name}` : ""}
          </p>
        </div>
      </div>

      {/* Stats */}
      <section className="mx-4 -mt-4 grid grid-cols-3 rounded-2xl border border-border bg-card py-4">
        {[
          { n: list.length, l: "Credits" },
          { n: orderedTypes.length, l: "Categories" },
          { n: yearsOnPlatform || "—", l: "Years" },
        ].map((s, i, arr) => (
          <div
            key={s.l}
            className={`text-center ${i < arr.length - 1 ? "border-r border-border" : ""}`}
          >
            <div className="text-xl font-bold tracking-tight">{s.n}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink-3">
              {s.l}
            </div>
          </div>
        ))}
      </section>

      {/* Bio */}
      {dancer.bio ? (
        <section className="px-6 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">
            ↳ About
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-2">
            {dancer.bio}
          </p>
        </section>
      ) : null}

      {/* Tags */}
      {(dancer.specialties?.length || dancer.genres?.length) ? (
        <section className="flex flex-wrap gap-1.5 px-6 pt-6">
          {(dancer.genres ?? []).map((g) => (
            <span
              key={`g-${g}`}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {g}
            </span>
          ))}
          {(dancer.specialties ?? []).map((s) => (
            <span
              key={`s-${s}`}
              className="rounded-full border border-border px-3 py-1 text-xs text-ink-2"
            >
              {s}
            </span>
          ))}
        </section>
      ) : null}

      {/* Portfolio file — downloadable PDF/JPG/PNG/MP4 */}
      {dancer.portfolio_file_url ? (
        <section className="px-6 pt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">
            ↳ 포트폴리오 다운로드
          </h2>
          <a
            href={dancer.portfolio_file_url}
            target="_blank"
            rel="noopener noreferrer"
            download={dancer.portfolio_file_name ?? undefined}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              ↓
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">
                {dancer.portfolio_file_name ?? "포트폴리오 파일"}
              </span>
              <span className="text-[11px] text-ink-3">
                {dancer.portfolio_file_size_bytes
                  ? formatFileSize(dancer.portfolio_file_size_bytes)
                  : ""}
                {dancer.portfolio_file_size_bytes && dancer.portfolio_file_mime
                  ? " · "
                  : ""}
                {prettyMime(dancer.portfolio_file_mime)}
              </span>
            </div>
            <span className="text-ink-3">→</span>
          </a>
        </section>
      ) : null}

      {/* Reel — uses dancer.portfolio jsonb */}
      {portfolio.length > 0 ? (
        <section className="pt-8">
          <div className="flex items-center justify-between px-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">
              ↳ Reel
            </h2>
            <span className="font-mono text-[11px] text-ink-3">
              {portfolio.length}
            </span>
          </div>
          <div className="scrollbar-none mt-3 flex gap-2.5 overflow-x-auto px-6 pb-1">
            {portfolio.map((item, i) => {
              const isImage =
                item.type === "photo" ||
                /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(item.url);
              return (
                <Link
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener"
                  className="block w-40 shrink-0"
                >
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={`${dancer.stage_name} reel ${i + 1}`}
                      loading="lazy"
                      className="h-56 w-full rounded-md object-cover"
                    />
                  ) : (
                    <VideoThumbnail
                      url={item.url}
                      className="!h-56 !w-full"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Highlight — representative careers with thumbnails */}
      {highlights.length > 0 ? (
        <section className="px-6 pt-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">
            ↳ Highlight
          </h2>
          <CareerGroup label="대표 경력" items={highlights} variant="card" />
        </section>
      ) : null}

      {/* Credits — grouped by type, compact row layout */}
      <section className="px-6 pb-16 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">
          ↳ Credits
        </h2>
        {orderedTypes.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
            {highlights.length > 0
              ? "대표 경력 외 추가된 경력이 없습니다."
              : "아직 공개된 경력이 없습니다."}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-6">
            {orderedTypes.map((type) => (
              <CareerGroup
                key={type}
                label={
                  CAREER_CATEGORY_LABELS[
                    type as keyof typeof CAREER_CATEGORY_LABELS
                  ] ?? type
                }
                items={grouped.get(type) ?? []}
                variant="row"
              />
            ))}
          </div>
        )}
      </section>

      {/* 미claim 프로필 claim 후크: 도착한 캐스팅 제안이 있으면 강조 */}
      {isCuration && pendingProposalCount > 0 ? (
        <section className="mx-6 mt-6 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4">
          <p className="text-sm font-semibold text-foreground">
            🔥 이 프로필로 캐스팅 제안 {pendingProposalCount}건이 도착했어요
          </p>
          <p className="mt-1 text-xs text-ink-3">
            본인 또는 매니저라면 권한을 신청하고 제안에 응답할 수 있어요. 아래에서 신청하세요.
          </p>
        </section>
      ) : null}

      {/* Footer CTAs: claim / signup / create-your-own */}
      <ProfileFooterCTA
        dancerId={dancer.id}
        dancerName={dancer.stage_name}
        isCuration={isCuration}
        isOwner={isOwner}
        mode={
          viewer
            ? { kind: "logged", canClaim: isCuration, alreadyRequested, claimRequestId: existingClaimId }
            : { kind: "guest" }
        }
      />

      {/* Send proposal — only for authenticated client-mode viewers */}
      {canPropose ? (
        <section className="px-6 pb-32 pt-4">
          <SendProposalDialog
            target={{
              kind: "dancer",
              dancer_id: dancer.id,
              name: dancer.stage_name,
            }}
            myProjects={myProjects}
          />
        </section>
      ) : null}

      {/* Sticky social CTA — only shown when there are links */}
      {Object.keys(social).length > 0 ? (
        <div className="fixed bottom-0 left-1/2 z-30 mb-4 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 gap-2 rounded-full border border-hairline-2 bg-background/80 p-1.5 backdrop-blur">
          {social.instagram ? (
            <SocialPill
              platform="instagram"
              raw={social.instagram}
              label="Instagram"
            />
          ) : null}
          {social.youtube ? (
            <SocialPill
              platform="youtube"
              raw={social.youtube}
              label="YouTube"
            />
          ) : null}
          {social.tiktok ? (
            <SocialPill
              platform="tiktok"
              raw={social.tiktok}
              label="TikTok"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function normalizeSocialUrl(
  platform: "instagram" | "youtube" | "tiktok",
  raw: string,
): string {
  const v = raw.trim();
  if (!v) return v;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  switch (platform) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "youtube":
      return handle.startsWith("UC") || handle.startsWith("channel/")
        ? `https://www.youtube.com/${handle.startsWith("channel/") ? handle : `channel/${handle}`}`
        : `https://www.youtube.com/@${handle}`;
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
  }
}

function SocialPill({
  platform,
  raw,
  label,
}: {
  platform: "instagram" | "youtube" | "tiktok";
  raw: string;
  label: string;
}) {
  return (
    <Link
      href={normalizeSocialUrl(platform, raw)}
      target="_blank"
      rel="noopener"
      className="flex flex-1 items-center justify-center rounded-full px-4 py-2 text-xs font-medium text-ink-2 hover:text-foreground"
    >
      {label} ↗
    </Link>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function prettyMime(mime: string | null): string {
  if (!mime) return "";
  if (mime === "application/pdf") return "PDF";
  if (mime === "image/jpeg") return "JPG";
  if (mime === "image/png") return "PNG";
  if (mime === "video/mp4") return "MP4";
  return mime;
}
