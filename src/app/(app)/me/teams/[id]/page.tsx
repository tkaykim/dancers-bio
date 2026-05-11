import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TeamProfileForm } from "@/components/team/TeamProfileForm";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
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
    <div className="mx-auto flex max-w-md flex-col gap-8 px-6 py-8 pb-40">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 팀 편집</p>
          <h1 className="text-2xl font-bold tracking-tight">{team.team_name}</h1>
          <Link href="/me/teams" className="text-xs text-ink-3 hover:text-foreground">
            ← 내 팀 목록
          </Link>
        </div>
        <Link
          href={publicHref}
          className="shrink-0 rounded-full border border-hairline-2 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-ink-2 hover:text-foreground"
        >
          공개 보기 →
        </Link>
      </header>

      <ApprovalBanner team={team} />

      <TeamProfileForm
        isCreate={false}
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
          social_instagram: social.instagram ?? "",
          social_youtube: social.youtube ?? "",
          social_tiktok: social.tiktok ?? "",
        }}
      />

      <Link
        href={`/me/teams/${team.id}/members`}
        className="group flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-secondary"
      >
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 멤버 관리</p>
          <span className="text-ink-3 transition-transform group-hover:translate-x-1">→</span>
        </div>
        <p className="text-lg font-bold leading-tight">팀원 추가·제거 / 팀장 이양 / 해체</p>
      </Link>
    </div>
  );
}

function ApprovalBanner({
  team,
}: {
  team: {
    approval_status: "pending" | "approved" | "rejected" | null;
    approval_reject_reason: string | null;
    is_active: boolean;
  };
}) {
  if (!team.is_active) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <span className="text-base">●</span>
        <span>해체된 팀입니다.</span>
      </div>
    );
  }
  const status = team.approval_status ?? "pending";
  if (status === "approved") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok">
        <span className="text-base">●</span>
        <span>공개 중 — 디렉토리에 노출되고 있습니다.</span>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <p className="font-semibold">거부됨 — 디렉토리에 노출되지 않습니다.</p>
        {team.approval_reject_reason ? (
          <p className="text-xs text-destructive/80">사유: {team.approval_reject_reason}</p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">
      <p className="font-semibold">심사 중</p>
      <p className="text-xs text-warn/80">관리자 승인 후 공개 디렉토리에 노출됩니다.</p>
    </div>
  );
}
