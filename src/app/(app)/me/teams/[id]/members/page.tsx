import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { TeamMembersManager, type TeamMemberRow } from "@/components/team/TeamMembersManager";

export default async function TeamMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, team_name, lead_profile_id")
    .eq("id", id)
    .maybeSingle();

  if (!team) notFound();
  if (team.lead_profile_id !== user.id) {
    redirect(`/me/teams/${team.id}`);
  }

  const { data: rows } = await supabase
    .from("team_members")
    .select(
      "id, profile_id, display_name, joined_at, profiles:profile_id(display_name)",
    )
    .eq("team_id", team.id)
    .order("sort_order", { ascending: true })
    .order("joined_at", { ascending: true });

  const members: TeamMemberRow[] = (rows ?? []).map((r) => {
    const profile = (r as unknown as { profiles?: { display_name: string } | null }).profiles ?? null;
    return {
      id: r.id as string,
      profile_id: (r.profile_id as string | null) ?? null,
      display_name: (r.display_name as string | null) ?? null,
      joined_at: r.joined_at as string,
      profile_display_name: profile?.display_name ?? null,
    };
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 멤버 관리</p>
        <h1 className="text-2xl font-bold tracking-tight">{team.team_name}</h1>
        <Link href={`/me/teams/${team.id}`} className="text-xs text-ink-3 hover:text-foreground">
          ← 팀 편집으로
        </Link>
      </header>

      <TeamMembersManager
        teamId={team.id}
        leadProfileId={team.lead_profile_id}
        members={members}
      />
    </div>
  );
}
