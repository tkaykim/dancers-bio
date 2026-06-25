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
import { BackButton } from "@/components/ui/back-button";
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
  approval_status: "pending" | "approved" | "rejected";
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DANCERS_BIO_ORIGIN = "https://dancers.bio";

function dancerDisplayName(dancer: DancerRow): string {
  return dancer.korean_name
    ? `${dancer.stage_name} (${dancer.korean_name})`
    : dancer.stage_name;
}

function dancerCanonicalUrl(dancer: DancerRow): string {
  return dancer.slug
    ? `${DANCERS_BIO_ORIGIN}/${dancer.slug}`
    : `${DANCERS_BIO_ORIGIN}/d/${dancer.id}`;
}

function dancerDescription(dancer: DancerRow, careerCount?: number): string {
  const tags = [...(dancer.genres ?? []), ...(dancer.specialties ?? [])]
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  const base = tags
    ? `${dancerDisplayName(dancer)} 댄서 프로필. ${tags} 경력과 영상 포트폴리오를 확인하세요.`
    : `${dancerDisplayName(dancer)} 댄서 프로필과 영상 포트폴리오를 확인하세요.`;
  return careerCount ? `${base} 공개 경력 ${careerCount}건.` : base;
}

async function loadDancer(slugOrId: string) {
  const supabase = await createClient();
  // 1) 공개 경로: approved 댄서는 SECURITY DEFINER RPC 로 조회한다.
  //    (anon 은 dancers 테이블 직접 SELECT 가 RLS 로 막혀 있으므로 RPC 가 유일한 공개 통로)
  const { data: pub } = await supabase.rpc("get_public_dancer", { _key: slugOrId });
  if (Array.isArray(pub) && pub.length > 0) return pub[0] as DancerRow;
  // 2) 미승인 프로필 미리보기: 본인·매니저·admin 만 (RLS 가 판정).
  //    로그인 세션의 authenticated 역할로 직접 조회 — 비로그인/타인은 RLS 로 0건 → notFound.
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
  const canonical = dancerCanonicalUrl(dancer);
  const description = dancer.bio ?? dancerDescription(dancer);
  const names = [dancer.stage_name, dancer.korean_name].filter(Boolean) as string[];
  return {
    title: { absolute: `${dancerDisplayName(dancer)} | 댄서 포트폴리오 · dancers.bio` },
    description,
    keywords: [
      ...names,
      ...names.map((name) => `${name} 댄서`),
      ...names.map((name) => `${name} 포트폴리오`),
      ...names.map((name) => `${name} 안무가`),
      ...(dancer.genres ?? []),
      ...(dancer.specialties ?? []),
    ],
    alternates: {
      canonical,
    },
    robots:
      dancer.approval_status === "approved"
        ? undefined
        : { index: false, follow: false },
    openGraph: {
      title: `${dancerDisplayName(dancer)} | 댄서 포트폴리오`,
      description,
      url: canonical,
      siteName: "dancers.bio",
      type: "profile",
      images: dancer.profile_img ? [{ url: dancer.profile_img }] : undefined,
    },
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

  // 수정 권한: 에디터(/me/portfolio/[dancerId]) 가드와 동일 — owner / manager / admin.
  // 본인 공개 프로필에서 바로 수정으로 진입할 수 있게 한다.
  let canEdit = isOwner || Boolean(viewerProfile?.is_admin);
  if (!canEdit && viewer) {
    const { data: mgr } = await supabase
      .from("dancer_managers")
      .select("dancer_id")
      .eq("dancer_id", dancer.id)
      .eq("manager_id", viewer.id)
      .maybeSingle();
    canEdit = Boolean(mgr);
  }
  const editHref = `/me/portfolio/${dancer.id}`;

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
  const canonicalUrl = dancerCanonicalUrl(dancer);
  const sameAs = (["instagram", "youtube", "tiktok"] as const)
    .map((platform) =>
      social[platform] ? normalizeSocialUrl(platform, social[platform]) : null,
    )
    .filter((url): url is string => Boolean(url));
  const knowsAbout = Array.from(
    new Set([...(dancer.genres ?? []), ...(dancer.specialties ?? [])]),
  ).slice(0, 12);
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${canonicalUrl}#person`,
    name: dancerDisplayName(dancer),
    alternateName: [dancer.stage_name, dancer.korean_name].filter(Boolean),
    url: canonicalUrl,
    image: dancer.profile_img ?? undefined,
    jobTitle: "Dancer",
    description: dancer.bio ?? dancerDescription(dancer, list.length),
    knowsAbout,
    sameAs,
    subjectOf: list.slice(0, 12).map((career) => ({
      "@type": "CreativeWork",
      name: career.title,
      dateCreated: career.date,
      description: career.details?.role ?? career.details?.description ?? undefined,
      url: career.details?.link ?? undefined,
    })),
  };
  const portfolio = (dancer.portfolio ?? []).filter((p) => p?.url) as Array<{
    url: string;
    thumbnail?: string;
    type?: string;
  }>;
  const yearsOnPlatform = list.length
    ? new Date().getFullYear() - Math.min(...list.map((c) => Number(c.date.slice(0, 4))))
    : 0;

  // 대표 경력(representative)은 Highlight 카루셀에 노출.
  const highlights = list.filter((c) => c.is_representative);

  // Credits 카테고리는 "전체" 경력으로 묶는다 — 대표 경력도 해당 카테고리 섹션에
  // 함께 보여야 하므로 비대표만 거르지 않고 list 전체를 그룹화한다.
  const grouped = new Map<string, Career[]>();
  for (const c of list) {
    const arr = grouped.get(c.type) ?? [];
    arr.push(c);
    grouped.set(c.type, arr);
  }
  // Order: choreo > broadcast > performance > judge > award > workshop > battle > other
  const TYPE_ORDER = ["choreo", "broadcast", "performance", "judge", "award", "workshop", "battle", "other"];
  const orderedTypes = TYPE_ORDER.filter((t) => grouped.has(t));

  return (
    <div className="relative mx-auto w-full max-w-md">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      {/* Back button (top-left, over hero) — 브라우저 히스토리로 직전 페이지 복귀 */}
      <BackButton
        fallback="/dancers"
        ariaLabel="뒤로"
        className="absolute left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-background/70 text-foreground backdrop-blur hover:bg-background/90"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </BackButton>
      {/* Edit button (top-right, over hero) — owner/manager/admin only */}
      {canEdit ? (
        <Link
          href={editHref}
          aria-label="프로필 수정"
          className="absolute right-4 top-4 z-40 flex h-10 items-center gap-1.5 rounded-full bg-background/70 px-4 text-sm font-semibold text-foreground backdrop-blur hover:bg-background/90"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
          수정
        </Link>
      ) : null}
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
          {(() => {
            const subtitle = [
              (dancer.genres ?? []).slice(0, 3).join(" · "),
              dancer.korean_name ?? "",
            ]
              .filter(Boolean)
              .join(" · ");
            return subtitle ? (
              <p className="text-sm font-medium text-white/80">{subtitle}</p>
            ) : null;
          })()}
        </div>
      </div>

      {/* Stats */}
      <section className="mx-4 mt-4 grid grid-cols-3 rounded-2xl border border-border bg-card py-4">
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

      {/* Tags — genres에 이미 있는 값은 specialties에서 중복 제거(대소문자 무시) */}
      {(() => {
        const genres = dancer.genres ?? [];
        const genreSet = new Set(genres.map((g) => g.trim().toLowerCase()));
        const extraSpecialties = (dancer.specialties ?? []).filter(
          (s) => !genreSet.has(s.trim().toLowerCase()),
        );
        if (genres.length === 0 && extraSpecialties.length === 0) return null;
        return (
          <section className="flex flex-wrap gap-1.5 px-6 pt-6">
            {genres.map((g) => (
              <span
                key={`g-${g}`}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {g}
              </span>
            ))}
            {extraSpecialties.map((s) => (
              <span
                key={`s-${s}`}
                className="rounded-full border border-border px-3 py-1 text-xs text-ink-2"
              >
                {s}
              </span>
            ))}
          </section>
        );
      })()}

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
          <CareerGroup label="대표 경력" items={highlights} variant="carousel" />
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

      {/* Owner edit entry — 본인(또는 매니저·관리자) 프로필이면 바로 수정 진입 */}
      {canEdit ? (
        <section className="mx-6 mt-6">
          <Link
            href={editHref}
            className="block rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 text-center transition-colors hover:bg-primary/10"
          >
            <p className="text-sm font-semibold text-foreground">✏️ 내 프로필 수정하기</p>
            <p className="mt-1 text-xs text-ink-3">
              사진·소개·경력·영상을 수정하고 저장하면 이 페이지에 바로 반영돼요
            </p>
          </Link>
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
