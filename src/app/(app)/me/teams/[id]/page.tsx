import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TeamProfileForm } from "@/components/team/TeamProfileForm";
import { extractSocialHandle } from "@/lib/utils/social";
import { serverT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n/t";
import me from "@/lib/i18n/messages/me";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const t = await serverT(me);
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select(
      "id, team_name, korean_name, slug, bio, location, specialties, genres, profile_img, social_links, lead_profile_id, approval_status, approval_reject_reason, is_active",
    )
    .eq("id", id)
    .maybeSingle();

  if (!team) notFound();
  if (team.lead_profile_id !== user.id) {
    // Non-leads can view the public page only
    redirect(team.slug ? `/t/${team.slug}` : `/t/${team.id}`);
  }

  const social = (team.social_links ?? {}) as Record<string, string>;
  const publicHref = `/t/${team.slug ?? team.id}`;

  return (
    <div className="mx-auto flex max-w-md flex-col lg:max-w-2xl gap-8 px-6 py-8 pb-40">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ {t("team_edit.eyebrow")}
          </p>
          <h1 data-ugc className="text-2xl font-bold tracking-tight">{team.team_name}</h1>
          <Link href="/me/teams" className="text-xs text-ink-3 hover:text-foreground">
            ← {t("team_edit.back")}
          </Link>
        </div>
        <Link
          href={publicHref}
          className="shrink-0 rounded-full border border-hairline-2 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink-2 hover:text-foreground"
        >
          {t("team_edit.view_public")} →
        </Link>
      </header>

      <ApprovalBanner team={team} t={t} />

      <TeamProfileForm
        isCreate={false}
        userId={user.id}
        teamId={team.id}
        currentProfileImg={team.profile_img ?? null}
        defaultValues={{
          team_name: team.team_name ?? "",
          korean_name: team.korean_name ?? "",
          slug: team.slug ?? "",
          bio: team.bio ?? "",
          location: team.location ?? "",
          specialties: (team.specialties as string[] | null) ?? [],
          genres: (team.genres as string[] | null) ?? [],
          social_instagram: extractSocialHandle(social.instagram),
          social_youtube: extractSocialHandle(social.youtube),
          social_tiktok: extractSocialHandle(social.tiktok),
        }}
      />

      <Link
        href={`/me/teams/${team.id}/members`}
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ {t("team_edit.members_eyebrow")}
          </p>
          <span className="text-ink-3 transition-transform group-hover:translate-x-1">→</span>
        </div>
        <p className="text-lg font-bold leading-tight">{t("team_edit.members_title")}</p>
      </Link>
    </div>
  );
}

function ApprovalBanner({
  team,
  t,
}: {
  team: {
    approval_status: "pending" | "approved" | "rejected" | null;
    approval_reject_reason: string | null;
    is_active: boolean;
  };
  t: Translator<typeof me>;
}) {
  if (!team.is_active) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <span className="text-base">●</span>
        <span>{t("team_edit.disbanded")}</span>
      </div>
    );
  }
  const status = team.approval_status ?? "pending";
  if (status === "approved") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
        <span className="text-base">●</span>
        <span>{t("team_edit.approval_approved")}</span>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <p className="font-semibold">{t("team_edit.approval_rejected_title")}</p>
        {team.approval_reject_reason ? (
          <p data-ugc className="text-xs text-destructive/80">
            {t("team_edit.approval_reject_reason", {
              reason: team.approval_reject_reason,
            })}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
      <p className="font-semibold">{t("team_edit.approval_pending_title")}</p>
      <p className="text-xs text-warn/80">{t("team_edit.approval_pending_note")}</p>
    </div>
  );
}
