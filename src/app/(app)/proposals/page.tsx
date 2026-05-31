import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { RespondProposalButtons } from "@/components/project/RespondProposalButtons";

export const dynamic = "force-dynamic";

type ProposalRow = {
  id: string;
  project_id: string;
  dancer_id: string | null;
  team_id: string | null;
  applicant_id: string | null;
  status: string;
  cover_message: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "응답 대기",
  accepted: "수락함",
  declined: "거절함",
  rejected: "거절함",
  withdrawn: "철회됨",
  expired: "만료됨",
};

export default async function ProposalsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // 내가 응답 주체가 되는 대상(댄서/팀) 수집
  const [{ data: ownDancers }, { data: managed }, { data: myTeams }] =
    await Promise.all([
      supabase.from("dancers").select("id").eq("profile_id", user.id),
      supabase
        .from("dancer_managers")
        .select("dancer_id")
        .eq("manager_id", user.id),
      supabase.from("teams").select("id, name").eq("lead_profile_id", user.id),
    ]);

  const dancerIds = Array.from(
    new Set([
      ...((ownDancers ?? []).map((d) => d.id as string)),
      ...((managed ?? []).map((m) => m.dancer_id as string)),
    ]),
  );
  const teamIds = (myTeams ?? []).map((t) => t.id as string);

  const orParts: string[] = [`applicant_id.eq.${user.id}`];
  if (dancerIds.length) orParts.push(`dancer_id.in.(${dancerIds.join(",")})`);
  if (teamIds.length) orParts.push(`team_id.in.(${teamIds.join(",")})`);

  let proposals: ProposalRow[] = [];
  {
    const { data } = await supabase
      .from("applications")
      .select(
        "id, project_id, dancer_id, team_id, applicant_id, status, cover_message, created_at",
      )
      .eq("source", "direct_proposal")
      .or(orParts.join(","))
      .order("created_at", { ascending: false });
    proposals = (data ?? []) as ProposalRow[];
  }

  // 프로젝트 + 개설자 표시 정보
  const projectIds = Array.from(new Set(proposals.map((p) => p.project_id)));
  const projectMap = new Map<
    string,
    { title: string; owner_id: string; posted_by_label: string | null }
  >();
  if (projectIds.length) {
    const { data: projects } = await supabase
      .from("projects")
      .select("id, title, owner_id, posted_by_label")
      .in("id", projectIds);
    for (const p of projects ?? []) {
      projectMap.set(p.id as string, {
        title: p.title as string,
        owner_id: p.owner_id as string,
        posted_by_label: (p.posted_by_label as string | null) ?? null,
      });
    }
  }

  const ownerIds = Array.from(
    new Set([...projectMap.values()].map((p) => p.owner_id)),
  );
  const ownerMap = new Map<string, string>();
  if (ownerIds.length) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ownerIds);
    for (const o of owners ?? []) {
      ownerMap.set(o.id as string, (o.display_name as string) ?? "프로젝트 개설자");
    }
  }

  const pending = proposals.filter((p) => p.status === "pending");
  const resolved = proposals.filter((p) => p.status !== "pending");

  return (
    <div className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">받은 제안</h1>
      <p className="mt-1 text-sm text-ink-3">
        나에게 도착한 캐스팅 제안을 확인하고 응답하세요.
      </p>

      {proposals.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">아직 받은 제안이 없습니다.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {pending.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
                응답 대기 {pending.length}
              </h2>
              {pending.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  project={projectMap.get(p.project_id)}
                  ownerName={
                    projectMap.get(p.project_id)
                      ? ownerMap.get(projectMap.get(p.project_id)!.owner_id)
                      : undefined
                  }
                  respondable
                />
              ))}
            </section>
          ) : null}

          {resolved.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
                처리됨 {resolved.length}
              </h2>
              {resolved.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  project={projectMap.get(p.project_id)}
                  ownerName={
                    projectMap.get(p.project_id)
                      ? ownerMap.get(projectMap.get(p.project_id)!.owner_id)
                      : undefined
                  }
                />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  proposal,
  project,
  ownerName,
  respondable = false,
}: {
  proposal: ProposalRow;
  project?: { title: string; owner_id: string; posted_by_label: string | null };
  ownerName?: string;
  respondable?: boolean;
}) {
  const proposer = project?.posted_by_label || ownerName || "프로젝트 개설자";
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/projects/${proposal.project_id}`}
            className="block truncate text-sm font-semibold hover:underline"
          >
            {project?.title ?? "프로젝트"}
          </Link>
          <p className="mt-0.5 text-xs text-ink-3">{proposer} 님의 제안</p>
        </div>
        <span className="shrink-0 rounded-full border border-hairline-2 px-2.5 py-0.5 text-[11px] font-medium text-ink-2">
          {STATUS_LABEL[proposal.status] ?? proposal.status}
        </span>
      </div>

      {proposal.cover_message ? (
        <p className="mt-3 whitespace-pre-wrap rounded-xl bg-secondary/50 px-3 py-2 text-sm text-ink-2">
          {proposal.cover_message}
        </p>
      ) : null}

      {respondable ? (
        <div className="mt-4">
          <RespondProposalButtons applicationId={proposal.id} />
        </div>
      ) : proposal.status === "accepted" ? (
        <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
          수락했습니다 · 프로젝트 페이지에서 상세를 확인하세요.
        </p>
      ) : null}
    </div>
  );
}
