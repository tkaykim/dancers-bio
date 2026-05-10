import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getUser } from "@/lib/auth/guard";
import { CAREER_CATEGORY_LABELS } from "@/lib/validation/portfolio";
import { VideoThumbnail } from "@/components/portfolio/VideoEmbed";
import { parseVideoUrl } from "@/lib/utils/video";
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
  portfolio: { url?: string; thumbnail?: string }[] | null;
  profile_id: string | null;
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
  if (!dancer) return { title: "Cue" };
  return {
    title: `${dancer.stage_name} · Cue`,
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

  // For "send proposal" CTA: viewer must be authed, can_create_project, dancer must have a profile_id, not self.
  const canPropose =
    Boolean(viewer) &&
    Boolean(viewerProfile?.can_create_project || viewerProfile?.is_admin) &&
    Boolean(dancer.profile_id) &&
    dancer.profile_id !== viewer?.id;

  let myProjects: Array<{ id: string; title: string; visibility: "public" | "private"; status: string }> = [];
  if (canPropose) {
    const { data: mp } = await supabase
      .from("projects")
      .select("id, title, visibility, status")
      .eq("owner_id", viewer!.id)
      .is("deleted_at", null)
      .in("status", ["draft", "open"])
      .order("created_at", { ascending: false })
      .limit(20);
    myProjects = (mp ?? []) as typeof myProjects;
  }

  const list = (careers ?? []) as Career[];
  const social = (dancer.social_links ?? {}) as Record<string, string>;
  const portfolio = (dancer.portfolio ?? []).filter((p) => p?.url) as Array<{
    url: string;
    thumbnail?: string;
  }>;
  const yearsOnPlatform = list.length
    ? new Date().getFullYear() - Math.min(...list.map((c) => Number(c.date.slice(0, 4))))
    : 0;

  // Group careers by type for the credits section
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
    <div className="mx-auto w-full max-w-2xl">
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
                radial-gradient(ellipse at 30% 30%, rgba(217,255,60,0.18), transparent 55%),
                repeating-linear-gradient(135deg, rgba(255,250,235,0.05) 0 12px, rgba(255,250,235,0.10) 12px 24px)
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
          <h1 className="text-4xl font-extrabold tracking-tight leading-none tracking-tight">
            {dancer.stage_name}
          </h1>
          <p className="text-sm font-medium text-ink-2">
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
            {portfolio.map((item, i) => (
              <Link
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener"
                className="block w-40 shrink-0"
              >
                <VideoThumbnail url={item.url} className="!h-56 !w-full" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Credits — grouped by type */}
      <section className="px-6 pb-16 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">
          ↳ Credits
        </h2>
        {orderedTypes.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-hairline-2 p-6 text-center text-sm text-ink-3">
            아직 공개된 경력이 없습니다.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-8">
            {orderedTypes.map((type) => {
              const items = grouped.get(type) ?? [];
              return (
                <div key={type}>
                  <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
                    {CAREER_CATEGORY_LABELS[type as keyof typeof CAREER_CATEGORY_LABELS] ?? type}
                    <span className="font-mono text-[11px] font-normal text-ink-3">
                      {items.length}
                    </span>
                  </h3>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {items.map((c) => {
                      const video = parseVideoUrl(c.details?.link);
                      const Card = video?.url ? "a" : "div";
                      const cardProps = video?.url
                        ? { href: video.url, target: "_blank" as const, rel: "noopener" }
                        : {};
                      return (
                        <li key={c.id}>
                          <Card
                            {...cardProps}
                            className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
                          >
                            {video ? (
                              <VideoThumbnail url={video.url} alt={c.title} />
                            ) : null}
                            <div className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
                              <span>{c.date}</span>
                              {c.is_representative ? (
                                <span className="text-primary">★ 대표</span>
                              ) : null}
                            </div>
                            <div className="text-sm font-medium leading-snug">
                              {c.title}
                            </div>
                            {c.details?.role ? (
                              <div className="text-xs text-ink-3">
                                {c.details.role}
                              </div>
                            ) : null}
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Send proposal — only for authenticated client-mode viewers */}
      {canPropose ? (
        <section className="px-6 pb-32 pt-4">
          <SendProposalDialog
            dancerProfileId={dancer.profile_id!}
            dancerName={dancer.stage_name}
            myProjects={myProjects}
          />
        </section>
      ) : null}

      {/* Sticky social CTA — only shown when there are links */}
      {Object.keys(social).length > 0 ? (
        <div className="fixed bottom-0 left-1/2 z-30 mb-4 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 gap-2 rounded-full border border-hairline-2 bg-background/80 p-1.5 backdrop-blur">
          {social.instagram ? (
            <SocialPill href={social.instagram} label="Instagram" />
          ) : null}
          {social.youtube ? (
            <SocialPill href={social.youtube} label="YouTube" />
          ) : null}
          {social.tiktok ? (
            <SocialPill href={social.tiktok} label="TikTok" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SocialPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener"
      className="flex flex-1 items-center justify-center rounded-full px-4 py-2 text-xs font-medium text-ink-2 hover:text-foreground"
    >
      {label} ↗
    </Link>
  );
}
