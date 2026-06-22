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
    .select("id, team_name, slug, lead_profile_id")
    .eq("id", id)
    .maybeSingle();

  if (!team) notFound();
  if (team.lead_profile_id !== user.id) {
    redirect(`/me/teams/${team.id}`);
  }

  const { data: rows } = await supabase
    .from("team_members")
    .select(
      "id, dancer_id, display_name, joined_at, dancers:dancer_id(id, stage_name, slug, profile_img, profile_id, profiles:profile_id(display_name, avatar_url))",
    )
    .eq("team_id", team.id)
    .order("sort_order", { ascending: true })
    .order("joined_at", { ascending: true });

  type DancerJoin = {
    id: string;
    stage_name: string | null;
    slug: string | null;
    profile_img: string | null;
    profile_id: string | null;
    profiles?: { display_name: string | null; avatar_url: string | null } | null;
  } | null;

  const members: TeamMemberRow[] = (rows ?? []).map((r) => {
    const dancer = (r as unknown as { dancers?: DancerJoin }).dancers ?? null;
    return {
      id: r.id as string,
      dancer_id: (r.dancer_id as string | null) ?? null,
      dancer_profile_id: dancer?.profile_id ?? null,
      display_name: (r.display_name as string | null) ?? null,
      joined_at: r.joined_at as string,
      dancer_label: dancer?.profiles?.display_name ?? dancer?.stage_name ?? null,
      avatar_url: dancer?.profiles?.avatar_url ?? dancer?.profile_img ?? null,
      slug: dancer?.slug ?? null,
    };
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 멤버 관리</p>
        <h1 className="text-2xl font-bold tracking-tight">{team.team_name}</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={`/me/teams/${team.id}`} className="text-xs text-ink-3 hover:text-foreground">
            ← 팀 편집으로
          </Link>
          <Link
            href={`/t/${team.slug ?? team.id}`}
            className="text-xs font-medium text-ink-2 hover:text-foreground"
          >
            공개 페이지 보기 ↗
          </Link>
        </div>
      </header>

      <TeamMembersManager
        teamId={team.id}
        leadProfileId={team.lead_profile_id}
        members={members}
      />
    </div>
  );
}
