import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth/guard";
import {
  CAREER_CATEGORY_LABELS,
  CAREER_CATEGORY_ORDER,
} from "@/lib/validation/portfolio";
import { CareerGroup } from "@/components/portfolio/CareerGroup";
import { ProfileFooterCTA } from "@/components/portfolio/ProfileFooterCTA";
import { ProfileShareCard } from "@/components/share/ProfileShareCard";
import { ArtistProfileHero } from "@/components/profile/ArtistProfileHero";
import { ProfileMediaGallery } from "@/components/profile/ProfileMediaGallery";
import { ProfileSectionHeading } from "@/components/profile/ProfileSectionHeading";
import { Pencil, ChevronRight } from "lucide-react";
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
  const [{ data: careers }, viewer, viewerProfile, { data: dancerCount }] =
    await Promise.all([
      supabase
        .from("careers")
        .select("id, type, title, date, details, is_representative")
        .eq("dancer_id", dancer.id)
        .eq("is_public", true)
        .order("is_representative", { ascending: false })
        .order("date", { ascending: false }),
      getUser(),
      getProfile(),
      supabase.rpc("count_all_dancers"),
    ]);

  // claim 상태
  const isCuration = !dancer.profile_id && !dancer.is_verified;
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
  const isImageItem = (item: {
    url: string;
    type?: string;
  }): boolean =>
    item.type === "photo" ||
    /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(item.url);
  const photos = portfolio.filter(isImageItem);
  const videos = portfolio.filter((item) => !isImageItem(item));
  const careerYears = list
    .map((career) => Number(career.date.slice(0, 4)))
    .filter(Number.isFinite);
  const yearsOnPlatform = careerYears.length
    ? Math.max(
        1,
        new Date().getFullYear() - Math.min(...careerYears) + 1,
      )
    : 0;
  const personJsonLdString = JSON.stringify(personJsonLd).replace(
    /</g,
    "\\u003c",
  );

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
  const orderedTypes = CAREER_CATEGORY_ORDER.filter((type) => grouped.has(type));
  const genres = dancer.genres ?? [];
  const genreSet = new Set(genres.map((genre) => genre.trim().toLowerCase()));
  const extraSpecialties = (dancer.specialties ?? []).filter(
    (specialty) => !genreSet.has(specialty.trim().toLowerCase()),
  );
  const roleLabel = grouped.has("choreo")
    ? "Dancer · Choreographer"
    : "Dancer";
  const descriptor = [roleLabel, ...genres.slice(0, 2)].join(" · ");

  return (
    <div className="relative mx-auto w-full max-w-[1180px] lg:px-8 lg:pt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: personJsonLdString }}
      />
      {/* Hero */}
      <ArtistProfileHero
        name={dancer.stage_name}
        localName={dancer.korean_name}
        eyebrow="Dancer portfolio"
        descriptor={descriptor}
        imageUrl={dancer.profile_img}
        imageAlt={dancer.stage_name}
        imageMode="portrait"
        social={social}
        canonicalUrl={canonicalUrl}
        shareTitle={`${dancerDisplayName(dancer)} | 댄서 프로필`}
        backHref="/dancers"
        verified={Boolean(dancer.is_verified)}
        location={dancer.location}
        editHref={canEdit ? editHref : null}
        stats={[
          { value: list.length, label: "크레딧" },
          { value: orderedTypes.length, label: "활동 분야" },
          { value: yearsOnPlatform || "—", label: "활동 연차" },
        ]}
      />

      {/* Profile summary — 히어로와 작업 목록 사이의 짧은 소개·역할 맥락 */}
      {dancer.bio || genres.length > 0 || extraSpecialties.length > 0 ? (
        <section className="border-b border-hairline-2 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-2">
              Profile
            </p>
            {dancer.bio ? (
              <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-2 sm:text-lg">
                {dancer.bio}
              </p>
            ) : null}
            {genres.length > 0 || extraSpecialties.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <span
                    key={`g-${genre}`}
                    className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                  >
                    {genre}
                  </span>
                ))}
                {extraSpecialties.map((specialty) => (
                  <span
                    key={`s-${specialty}`}
                    className="rounded-full border border-hairline-2 px-3 py-1.5 text-xs font-medium text-ink-2"
                  >
                    {specialty}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Selected work — Apple Music/Spotify처럼 전체 목록보다 대표 작업을 먼저 보여준다. */}
      {highlights.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Selected work"
            title="대표 작업"
            description="이 아티스트를 가장 빠르게 이해할 수 있는 주요 크레딧입니다."
            count={highlights.length}
          />
          <div className="mt-6 max-w-4xl">
            <CareerGroup
              label="대표 경력"
              items={highlights}
              variant="carousel"
            />
          </div>
        </section>
      ) : null}

      {/* Portfolio file — downloadable PDF/JPG/PNG/MP4 */}
      {dancer.portfolio_file_url ? (
        <section className="px-5 pt-10 sm:px-8 lg:px-10">
          <a
            href={dancer.portfolio_file_url}
            target="_blank"
            rel="noopener noreferrer"
            download={dancer.portfolio_file_name ?? undefined}
            className="flex max-w-xl items-center gap-3 border-y border-hairline-2 py-4 transition-colors hover:bg-secondary/70"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
              ↓
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">
                {dancer.portfolio_file_name ?? "포트폴리오 파일"}
              </span>
              <span className="text-[11px] text-ink-2">
                {dancer.portfolio_file_size_bytes
                  ? formatFileSize(dancer.portfolio_file_size_bytes)
                  : ""}
                {dancer.portfolio_file_size_bytes && dancer.portfolio_file_mime
                  ? " · "
                  : ""}
                {prettyMime(dancer.portfolio_file_mime)}
              </span>
            </div>
            <span className="text-ink-2">→</span>
          </a>
        </section>
      ) : null}

      {photos.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Visual portfolio"
            title="갤러리"
            description="무대와 작업의 분위기를 보여주는 대표 이미지입니다."
            count={photos.length}
          />
          <div className="mt-6">
            <ProfileMediaGallery
              items={photos}
              name={dancer.stage_name}
              variant="photos"
            />
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Showreel"
            title="영상"
            description="페이지를 벗어나지 않고 주요 퍼포먼스 영상을 확인할 수 있습니다."
            count={videos.length}
          />
          <div className="mt-6">
            <ProfileMediaGallery
              items={videos}
              name={dancer.stage_name}
              variant="videos"
            />
          </div>
        </section>
      ) : null}

      {/* Credits — grouped by type, compact row layout */}
      <section className="px-5 pb-16 pt-12 sm:px-8 lg:px-10 lg:pt-16">
        <ProfileSectionHeading
          eyebrow="Full credits"
          title="전체 크레딧"
          description="분야별 경력을 연도순으로 정리했습니다."
          count={list.length}
        />
        {orderedTypes.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-2">
            {highlights.length > 0
              ? "대표 경력 외 추가된 경력이 없습니다."
              : "아직 공개된 경력이 없습니다."}
          </p>
        ) : (
          <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-2">
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

      <div className="mx-auto max-w-2xl pb-16">
        {/* 미claim 프로필 claim 후크: 도착한 캐스팅 제안이 있으면 강조 */}
        {isCuration && pendingProposalCount > 0 ? (
          <section className="mx-6 mt-6 rounded-2xl border border-primary/40 bg-primary/10 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">
              이 프로필로 캐스팅 제안 {pendingProposalCount}건이 도착했어요
            </p>
            <p className="mt-1 text-xs text-ink-2">
              본인 또는 매니저라면 권한을 신청하고 제안에 응답할 수 있어요. 아래에서 신청하세요.
            </p>
          </section>
        ) : null}

      {/* Owner edit entry — 본인(또는 매니저·관리자) 프로필이면 바로 수정 진입 */}
        {canEdit ? (
          <section className="mx-6 mt-6">
          <Link
            href={editHref}
            className="flex items-center gap-3 rounded-2xl bg-primary px-5 py-3.5 text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Pencil className="size-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">내 프로필 수정하기</span>
              <span className="mt-0.5 block text-xs text-primary-foreground/70">
                사진·소개·경력·영상을 수정하면 이 페이지에 바로 반영돼요
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-primary-foreground/60" aria-hidden />
          </Link>
          </section>
        ) : null}

      {/* 본인 프로필이면 공유 유도 카드 (카카오·인스타 공유 + 링크 복붙). 승인 무관 — URL 직접 접근 가능. */}
        {isOwner ? (
          <section className="mx-6 mt-6">
          <ProfileShareCard
            url={canonicalUrl}
            title={`${dancerDisplayName(dancer)} | 댄서 프로필`}
          />
          </section>
        ) : null}

      {/* Footer CTAs: claim / signup / create-your-own */}
        <ProfileFooterCTA
          dancerId={dancer.id}
          dancerName={dancer.stage_name}
          dancerCount={typeof dancerCount === "number" ? dancerCount : null}
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
          <section className="px-6 pb-16 pt-4">
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
      </div>

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
