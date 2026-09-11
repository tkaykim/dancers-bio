import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CAREER_CATEGORY_ORDER } from "@/lib/validation/portfolio";
import { getLocale, serverT } from "@/lib/i18n/server";
import { translator, type Translator } from "@/lib/i18n/t";
import profileMessages from "@/lib/i18n/messages/profile";
import { CareerGroup } from "@/components/portfolio/CareerGroup";
import { ArtistProfileHero } from "@/components/profile/ArtistProfileHero";
import { ProfileMediaGallery } from "@/components/profile/ProfileMediaGallery";
import { ProfileSectionHeading } from "@/components/profile/ProfileSectionHeading";

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

type TeamRow = {
  id: string;
  team_name: string;
  korean_name: string | null;
  slug: string | null;
  bio: string | null;
  location: string | null;
  specialties: string[] | null;
  genres: string[] | null;
  profile_img: string | null;
  social_links: Record<string, string> | null;
  approval_status: "pending" | "approved" | "rejected";
  is_active: boolean;
  portfolio: { url?: string; thumbnail?: string; type?: string }[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEETZ_ORIGIN = "https://deetz.kr";

type ProfileT = Translator<typeof profileMessages>;

function teamDisplayName(team: TeamRow): string {
  return team.korean_name ? `${team.team_name} (${team.korean_name})` : team.team_name;
}

function teamCanonicalUrl(team: TeamRow): string {
  return `${DEETZ_ORIGIN}/t/${team.slug ?? team.id}`;
}

function teamDescription(team: TeamRow, t: ProfileT): string {
  const tags = [...(team.genres ?? []), ...(team.specialties ?? [])]
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  const name = teamDisplayName(team);
  return tags
    ? t("meta.team_description_tags", { name, tags })
    : t("meta.team_description", { name });
}

async function loadTeam(slugOrId: string) {
  const supabase = await createClient();
  const query = UUID_RE.test(slugOrId)
    ? supabase.from("teams").select("*").eq("id", slugOrId).maybeSingle()
    : supabase.from("teams").select("*").eq("slug", slugOrId).maybeSingle();
  const { data } = await query;
  return data as TeamRow | null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await loadTeam(slug);
  if (!team) return { title: { absolute: "deetz" } };
  const t = translator(profileMessages, await getLocale());
  const canonical = teamCanonicalUrl(team);
  const description = team.bio ?? teamDescription(team, t);
  const names = [team.team_name, team.korean_name].filter(Boolean) as string[];
  return {
    title: { absolute: t("meta.team_title", { name: teamDisplayName(team) }) },
    description,
    keywords: [
      ...names,
      ...names.map((name) => t("meta.kw_team", { name })),
      ...names.map((name) => t("meta.kw_team_booking", { name })),
      ...names.map((name) => t("meta.kw_team_show", { name })),
      ...t("meta.team_keywords").split(","),
      ...(team.genres ?? []),
      ...(team.specialties ?? []),
    ],
    alternates: {
      canonical,
    },
    robots:
      team.approval_status === "approved" && team.is_active
        ? undefined
        : { index: false, follow: false },
    openGraph: {
      title: t("meta.team_og_title", { name: teamDisplayName(team) }),
      description,
      url: canonical,
      siteName: "deetz",
      type: "profile",
      images: team.profile_img ? [{ url: team.profile_img }] : undefined,
    },
  };
}

export default async function PublicTeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await loadTeam(slug);
  if (!team) notFound();
  if (!team.is_active) notFound();

  const t = await serverT(profileMessages);
  const supabase = await createClient();
  const [{ data: careers }, { data: memberRows }] = await Promise.all([
    supabase
      .from("careers")
      .select("id, type, title, date, details, is_representative")
      .eq("team_id", team.id)
      .eq("is_public", true)
      .order("is_representative", { ascending: false })
      .order("date", { ascending: false }),
    supabase
      .from("team_members")
      .select(
        "id, dancer_id, display_name, sort_order, dancers:dancer_id(id, stage_name, slug, profile_img, profile_id, profiles:profile_id(display_name, avatar_url))",
      )
      .eq("team_id", team.id)
      .order("sort_order", { ascending: true }),
  ]);

  const list = (careers ?? []) as Career[];
  const social = (team.social_links ?? {}) as Record<string, string>;
  const canonicalUrl = teamCanonicalUrl(team);
  const sameAs = Object.values(social)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//i.test(value));
  const knowsAbout = Array.from(
    new Set([...(team.genres ?? []), ...(team.specialties ?? [])]),
  ).slice(0, 12);
  const teamJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${canonicalUrl}#team`,
    name: teamDisplayName(team),
    alternateName: [team.team_name, team.korean_name].filter(Boolean),
    url: canonicalUrl,
    image: team.profile_img ?? undefined,
    description: team.bio ?? teamDescription(team, t),
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
  const portfolio = (team.portfolio ?? []).filter((p) => p?.url) as Array<{
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
  type PublicDancerJoin = {
    id: string;
    stage_name: string | null;
    slug: string | null;
    profile_img: string | null;
    profile_id: string | null;
    profiles?: { display_name: string | null; avatar_url: string | null } | null;
  } | null;
  type MemberRowLite = { id: string; display_name: string | null; dancers?: PublicDancerJoin };
  const members = ((memberRows ?? []) as unknown as MemberRowLite[]).map((r) => {
    const d = r.dancers ?? null;
    return {
      id: r.id,
      profile_id: d?.profile_id ?? null,
      slug: d?.slug ?? null,
      label:
        d?.profiles?.display_name ??
        d?.stage_name ??
        r.display_name ??
        t("member.unnamed"),
      avatar_url: d?.profiles?.avatar_url ?? d?.profile_img ?? null,
    };
  });

  // Group careers by type
  const grouped = new Map<string, Career[]>();
  for (const c of list) {
    const arr = grouped.get(c.type) ?? [];
    arr.push(c);
    grouped.set(c.type, arr);
  }
  const orderedTypes = CAREER_CATEGORY_ORDER.filter((type) => grouped.has(type));
  const highlights = list.filter((career) => career.is_representative);
  const careerYears = list
    .map((career) => Number(career.date.slice(0, 4)))
    .filter(Number.isFinite);
  const yearsActive = careerYears.length
    ? Math.max(
        1,
        new Date().getFullYear() - Math.min(...careerYears) + 1,
      )
    : 0;
  const genres = team.genres ?? [];
  const genreSet = new Set(genres.map((genre) => genre.trim().toLowerCase()));
  const extraSpecialties = (team.specialties ?? []).filter(
    (specialty) => !genreSet.has(specialty.trim().toLowerCase()),
  );
  const descriptor = ["Dance crew", ...genres.slice(0, 2)].join(" · ");
  const teamJsonLdString = JSON.stringify(teamJsonLd).replace(
    /</g,
    "\\u003c",
  );

  return (
    <div className="relative mx-auto w-full max-w-[1180px] lg:px-8 lg:pt-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: teamJsonLdString }}
      />
      {/* Hero */}
      <ArtistProfileHero
        name={team.team_name}
        localName={team.korean_name}
        eyebrow="Dance crew portfolio"
        descriptor={descriptor}
        imageUrl={team.profile_img}
        imageAlt={team.team_name}
        imageMode="cover"
        social={social}
        canonicalUrl={canonicalUrl}
        shareTitle={t("hero.share_team", { name: teamDisplayName(team) })}
        backHref="/dancers?tab=teams"
        verified={team.approval_status === "approved"}
        verifiedLabel={t("hero.verified_team")}
        location={team.location}
        stats={[
          { value: members.length, label: t("hero.stat_members") },
          { value: list.length, label: t("hero.stat_credits") },
          { value: yearsActive || "—", label: t("hero.stat_years") },
        ]}
      />

      {team.bio || genres.length > 0 || extraSpecialties.length > 0 ? (
        <section className="border-b border-hairline-2 px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-2">
              Profile
            </p>
            {team.bio ? (
              <p
                className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-2 sm:text-lg"
                data-ugc
              >
                {team.bio}
              </p>
            ) : null}
            {genres.length > 0 || extraSpecialties.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2" data-ugc>
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

      {highlights.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Selected work"
            title={t("section.selected_work")}
            description={t("section.selected_work_desc_team")}
            count={highlights.length}
          />
          <div className="mt-6 max-w-4xl">
            <CareerGroup
              label={t("section.representative_careers")}
              items={highlights}
              variant="carousel"
            />
          </div>
        </section>
      ) : null}

      {/* Members */}
      {members.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Crew"
            title={t("section.members")}
            count={members.length}
          />
          <div className="scrollbar-none -mx-5 mt-6 flex gap-5 overflow-x-auto px-5 pb-2 sm:-mx-0 sm:flex-wrap sm:px-0">
            {members.map((m) => {
              const avatar = m.avatar_url ? (
                <Image
                  src={m.avatar_url}
                  alt={m.label}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-full object-cover ring-1 ring-hairline-2"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-lg font-semibold ring-1 ring-hairline-2">
                  {m.label === t("member.unnamed") ? "?" : m.label.charAt(0) || "?"}
                </div>
              );
              return (
                <div
                  key={m.id}
                  className="flex w-20 shrink-0 flex-col items-center gap-2"
                >
                  {m.slug ? (
                    <Link
                      href={`/d/${m.slug}`}
                      aria-label={t("member.profile_link", { name: m.label })}
                      className="block transition-opacity hover:opacity-80"
                    >
                      {avatar}
                    </Link>
                  ) : (
                    avatar
                  )}
                  <span
                    className="w-full truncate text-center text-sm font-medium text-ink-2"
                    data-ugc
                  >
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {photos.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Visual portfolio"
            title={t("section.gallery")}
            description={t("section.gallery_desc_team")}
            count={photos.length}
          />
          <div className="mt-6">
            <ProfileMediaGallery
              items={photos}
              name={team.team_name}
              variant="photos"
            />
          </div>
        </section>
      ) : null}

      {videos.length > 0 ? (
        <section className="px-5 pt-12 sm:px-8 lg:px-10 lg:pt-16">
          <ProfileSectionHeading
            eyebrow="Showreel"
            title={t("section.videos")}
            count={videos.length}
          />
          <div className="mt-6">
            <ProfileMediaGallery
              items={videos}
              name={team.team_name}
              variant="videos"
            />
          </div>
        </section>
      ) : null}

      <section className="px-5 pb-16 pt-12 sm:px-8 lg:px-10 lg:pt-16">
        <ProfileSectionHeading
          eyebrow="Full credits"
          title={t("section.credits")}
          description={t("section.credits_desc_team")}
          count={list.length}
        />
        {orderedTypes.length === 0 ? (
          <p className="mt-8 border-y border-dashed border-hairline-2 py-10 text-center text-sm text-ink-2">
            {t("credits.empty")}
          </p>
        ) : (
          <div className="mt-8 grid gap-x-10 gap-y-10 md:grid-cols-2">
            {orderedTypes.map((type) => {
              const items = grouped.get(type) ?? [];
              return (
                <CareerGroup
                  key={type}
                  label={t(`career_category.${type}`)}
                  items={items}
                  variant="row"
                />
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
