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
  portfolio: { url?: string; thumbnail?: string }[] | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!team) return { title: "Cue" };
  return {
    title: `${team.team_name} · Cue`,
    description: team.bio ?? `${team.team_name} 댄스팀 포트폴리오`,
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

  const supabase = await createClient();
  const [{ data: careers }, { data: memberRows }, viewer, viewerProfile, { data: teamLead }] = await Promise.all([
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
        "id, dancer_id, display_name, sort_order, dancers:dancer_id(id, stage_name, profile_img, profile_id, profiles:profile_id(display_name, avatar_url))",
      )
      .eq("team_id", team.id)
      .order("sort_order", { ascending: true }),
    getUser(),
    getProfile(),
    supabase.from("teams").select("lead_profile_id").eq("id", team.id).maybeSingle(),
  ]);

  const teamLeadId = teamLead?.lead_profile_id as string | undefined;
  void teamLeadId;
  // Lite MVP: direct_proposal OFF.
  const canPropose = false;

  let myProjects: Array<{ id: string; title: string; visibility: "public" | "private"; status: string; allow_team_apply: boolean }> = [];
  if (canPropose) {
    const { data: mp } = await supabase
      .from("projects")
      .select("id, title, visibility, status, allow_team_apply")
      .eq("owner_id", viewer!.id)
      .is("deleted_at", null)
      .in("status", ["draft", "open"])
      .eq("allow_team_apply", true)
      .order("created_at", { ascending: false })
      .limit(20);
    myProjects = (mp ?? []) as typeof myProjects;
  }

  const list = (careers ?? []) as Career[];
  const social = (team.social_links ?? {}) as Record<string, string>;
  const portfolio = (team.portfolio ?? []).filter((p) => p?.url) as Array<{
    url: string;
    thumbnail?: string;
  }>;
  type PublicDancerJoin = {
    id: string;
    stage_name: string | null;
    profile_img: string | null;
    profile_id: string | null;
    profiles?: { display_name: string | null; avatar_url: string | null } | null;
  } | null;
  const members = (memberRows ?? []).map((r) => {
    const d = (r as unknown as { dancers?: PublicDancerJoin }).dancers ?? null;
    return {
      id: r.id as string,
      profile_id: d?.profile_id ?? null,
      label:
        d?.profiles?.display_name ??
        d?.stage_name ??
        (r.display_name as string | null) ??
        "(이름 없음)",
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
  const TYPE_ORDER = ["choreo", "broadcast", "performance", "judge", "award", "workshop", "battle", "other"];
  const orderedTypes = TYPE_ORDER.filter((t) => grouped.has(t));

  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* Back button (top-left, over hero) */}
      <Link
        href="/dancers?tab=teams"
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
        {team.profile_img ? (
          <Image
            src={team.profile_img}
            alt={team.team_name}
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
            <span className="rounded-full border border-hairline-2 bg-card/60 px-2.5 py-0.5 text-[11px] font-medium text-ink-2 backdrop-blur">
              팀
            </span>
            {team.location ? (
              <span className="rounded-full border border-hairline-2 bg-card/60 px-2.5 py-0.5 text-[11px] font-medium text-ink-2 backdrop-blur">
                {team.location}
              </span>
            ) : null}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight leading-none">
            {team.team_name}
          </h1>
          <p className="text-sm font-medium text-ink-2">
            {(team.genres ?? []).slice(0, 3).join(" · ")}
            {team.korean_name ? ` · ${team.korean_name}` : ""}
          </p>
        </div>
      </div>

      {/* Bio */}
      {team.bio ? (
        <section className="px-6 pt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">↳ About</h2>
          <p className="mt-3 whitespace-pre-wrap text-base leading-relaxed text-ink-2">{team.bio}</p>
        </section>
      ) : null}

      {/* Tags */}
      {(team.specialties?.length || team.genres?.length) ? (
        <section className="flex flex-wrap gap-1.5 px-6 pt-6">
          {(team.genres ?? []).map((g) => (
            <span
              key={`g-${g}`}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {g}
            </span>
          ))}
          {(team.specialties ?? []).map((s) => (
            <span
              key={`s-${s}`}
              className="rounded-full border border-border px-3 py-1 text-xs text-ink-2"
            >
              {s}
            </span>
          ))}
        </section>
      ) : null}

      {/* Members */}
      {members.length > 0 ? (
        <section className="px-6 pt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">↳ Members</h2>
            <span className="font-mono text-[11px] text-ink-3">{members.length}</span>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                {m.avatar_url ? (
                  <Image
                    src={m.avatar_url}
                    alt={m.label}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                    {m.label[0]}
                  </div>
                )}
                <span className="truncate text-sm font-medium">{m.label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Reel */}
      {portfolio.length > 0 ? (
        <section className="pt-8">
          <div className="flex items-center justify-between px-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">↳ Reel</h2>
            <span className="font-mono text-[11px] text-ink-3">{portfolio.length}</span>
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

      {/* Credits */}
      <section className="px-6 pb-16 pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-3">↳ Credits</h2>
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
                    <span className="font-mono text-[11px] font-normal text-ink-3">{items.length}</span>
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
                            {video ? <VideoThumbnail url={video.url} alt={c.title} /> : null}
                            <div className="flex items-center gap-2 font-mono text-[11px] text-ink-3">
                              <span>{c.date}</span>
                              {c.is_representative ? (
                                <span className="text-primary">★ 대표</span>
                              ) : null}
                            </div>
                            <div className="text-sm font-medium leading-snug">{c.title}</div>
                            {c.details?.role ? (
                              <div className="text-xs text-ink-3">{c.details.role}</div>
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
            target={{ kind: "team", team_id: team.id, name: team.team_name }}
            myProjects={myProjects}
          />
        </section>
      ) : null}

      {/* Sticky social */}
      {Object.keys(social).length > 0 ? (
        <div className="fixed bottom-0 left-1/2 z-30 mb-4 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 gap-2 rounded-full border border-hairline-2 bg-background/80 p-1.5 backdrop-blur">
          {social.instagram ? <SocialPill href={social.instagram} label="Instagram" /> : null}
          {social.youtube ? <SocialPill href={social.youtube} label="YouTube" /> : null}
          {social.tiktok ? <SocialPill href={social.tiktok} label="TikTok" /> : null}
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
