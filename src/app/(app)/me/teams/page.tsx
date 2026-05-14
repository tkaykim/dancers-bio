import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export default async function MyTeamsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: ownDancers } = await supabase
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id);
  const ownDancerIds = (ownDancers ?? []).map((d) => d.id as string);
  if (ownDancerIds.length === 0) {
    redirect("/onboarding/create");
  }

  // Teams I lead
  const { data: ledTeams } = await supabase
    .from("teams")
    .select("id, team_name, slug, approval_status, is_active, profile_img")
    .eq("lead_profile_id", user.id)
    .order("created_at", { ascending: false });

  // Teams I'm a member of (but not leading).
  // team_members 는 dancer_id 컬럼만 가지므로 본인 소유 dancers 로 조회.
  const { data: memberRows } = await supabase
    .from("team_members")
    .select("team_id, teams!inner(id, team_name, slug, approval_status, is_active, profile_img, lead_profile_id)")
    .in("dancer_id", ownDancerIds);

  type TeamShape = {
    id: string;
    team_name: string;
    slug: string | null;
    approval_status: string;
    is_active: boolean;
    profile_img: string | null;
    lead_profile_id: string;
  };
  const memberTeams = (memberRows ?? [])
    .flatMap((row) => {
      const t = (row as unknown as { teams: TeamShape | TeamShape[] | null }).teams;
      if (!t) return [];
      return Array.isArray(t) ? t : [t];
    })
    .filter((t) => t && t.lead_profile_id !== user.id);

  return (
    <div className="flex flex-col gap-6 px-6 pb-10 pt-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">내 팀</h1>
        <Link
          href="/me/teams/new"
          className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold"
        >
          <Plus size={14} aria-hidden /> 팀 만들기
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">내가 팀장인 팀</h2>
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {(ledTeams ?? []).length === 0 ? (
            <EmptyRow text="팀장으로 활동 중인 팀이 없습니다." />
          ) : (
            (ledTeams ?? []).map((t) => (
              <TeamRow
                key={t.id}
                href={`/me/teams/${t.id}`}
                name={t.team_name}
                approvalStatus={t.approval_status as "pending" | "approved" | "rejected"}
                isActive={t.is_active}
                slug={t.slug}
              />
            ))
          )}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">소속 팀</h2>
        <ul className="overflow-hidden rounded-2xl border border-border bg-card">
          {memberTeams.length === 0 ? (
            <EmptyRow text="다른 팀의 멤버로 등록된 곳이 없습니다." />
          ) : (
            memberTeams.map((t) => (
              <TeamRow
                key={t.id}
                href={t.slug ? `/t/${t.slug}` : `/t/${t.id}`}
                name={t.team_name}
                approvalStatus={t.approval_status as "pending" | "approved" | "rejected"}
                isActive={t.is_active}
                slug={t.slug}
                memberOnly
              />
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function TeamRow({
  href,
  name,
  approvalStatus,
  isActive,
  slug,
  memberOnly,
}: {
  href: string;
  name: string;
  approvalStatus: "pending" | "approved" | "rejected";
  isActive: boolean;
  slug: string | null;
  memberOnly?: boolean;
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-4 py-4 transition-colors active:bg-secondary"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold">{name}</span>
          <span className="text-xs text-ink-3">
            {memberOnly ? "멤버" : "팀장"} ·{" "}
            {!isActive
              ? "비활성"
              : approvalStatus === "approved"
                ? "공개 중"
                : approvalStatus === "rejected"
                  ? "노출 거부됨"
                  : "심사 중"}
            {slug ? ` · /t/${slug}` : ""}
          </span>
        </div>
        <ChevronRight size={18} className="text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="px-4 py-4 text-sm text-ink-3">{text}</li>
  );
}
