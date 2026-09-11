import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { RespondProposalButtons } from "@/components/project/RespondProposalButtons";
import { serverT } from "@/lib/i18n/server";
import type { KeyOf, Translator } from "@/lib/i18n/t";
import applications from "@/lib/i18n/messages/applications";

export const dynamic = "force-dynamic";

type T = Translator<typeof applications>;

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

const STATUS_KEYS: Record<string, KeyOf<typeof applications>> = {
  pending: "proposals.status.pending",
  accepted: "proposals.status.accepted",
  declined: "proposals.status.declined",
  rejected: "proposals.status.rejected",
  withdrawn: "proposals.status.withdrawn",
  expired: "proposals.status.expired",
};

function statusLabel(t: T, status: string): string {
  const key = STATUS_KEYS[status];
  return key ? t(key) : status;
}

/** 문장 안의 이용자 작성 조각만 감싼다(언어마다 어순이 달라 문장을 쪼개지 않는다). */
function wrapUgc(text: string, part: string): ReactNode {
  const at = part ? text.indexOf(part) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span data-ugc="">{part}</span>
      {text.slice(at + part.length)}
    </>
  );
}

export default async function ProposalsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const t = await serverT(applications);

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
  const teamIds = (myTeams ?? []).map((team) => team.id as string);

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
      ownerMap.set(o.id as string, (o.display_name as string) ?? "");
    }
  }

  const pending = proposals.filter((p) => p.status === "pending");
  const resolved = proposals.filter((p) => p.status !== "pending");

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-2xl px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("proposals.title")}</h1>
      <p className="mt-1 text-sm text-ink-3">{t("proposals.subtitle")}</p>

      {proposals.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">{t("proposals.empty")}</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {pending.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">
                {t("proposals.section.pending", { count: pending.length })}
              </h2>
              {pending.map((p) => (
                <ProposalCard
                  key={p.id}
                  t={t}
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
                {t("proposals.section.resolved", { count: resolved.length })}
              </h2>
              {resolved.map((p) => (
                <ProposalCard
                  key={p.id}
                  t={t}
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
  t,
  proposal,
  project,
  ownerName,
  respondable = false,
}: {
  t: T;
  proposal: ProposalRow;
  project?: { title: string; owner_id: string; posted_by_label: string | null };
  ownerName?: string;
  respondable?: boolean;
}) {
  // 개설자가 직접 쓴 표기(posted_by_label·display_name)가 있으면 그 값이 이용자 작성 글이다.
  const writtenName = project?.posted_by_label || ownerName || null;
  const proposer = writtenName ?? t("proposals.card.owner_fallback");
  const fromLine = t("proposals.card.from", { name: proposer });
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/projects/${proposal.project_id}`}
            className="block truncate text-sm font-semibold hover:underline"
            data-ugc={project?.title ? "" : undefined}
          >
            {project?.title ?? t("proposals.card.project_fallback")}
          </Link>
          <p className="mt-0.5 text-xs text-ink-3">
            {writtenName ? wrapUgc(fromLine, writtenName) : fromLine}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-hairline-2 px-2.5 py-0.5 text-[11px] font-medium text-ink-2">
          {statusLabel(t, proposal.status)}
        </span>
      </div>

      {proposal.cover_message ? (
        <p
          className="mt-3 whitespace-pre-wrap rounded-xl bg-secondary/50 px-3 py-2 text-sm text-ink-2"
          data-ugc=""
        >
          {proposal.cover_message}
        </p>
      ) : null}

      {respondable ? (
        <div className="mt-4">
          <RespondProposalButtons applicationId={proposal.id} />
        </div>
      ) : proposal.status === "accepted" ? (
        <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
          {t("proposals.card.accepted_note")}
        </p>
      ) : null}
    </div>
  );
}
