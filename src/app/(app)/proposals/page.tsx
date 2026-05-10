import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { ProposalActions } from "@/components/project/ProposalActions";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/projects";

type Row = {
  id: string;
  status: keyof typeof APPLICATION_STATUS_LABELS;
  cover_message: string | null;
  created_at: string;
  responded_at: string | null;
  contact_revealed_at: string | null;
  project: {
    id: string;
    title: string;
    description: string;
    visibility: "public" | "private";
    status: string;
    pay_amount: number | null;
    pay_type: string | null;
    application_deadline: string | null;
    owner_id: string;
  } | null;
};

function formatPay(p: { pay_amount: number | null; pay_type: string | null }) {
  if (!p.pay_amount && p.pay_type !== "negotiable") return "협의";
  if (!p.pay_amount) return "협의";
  return `₩ ${p.pay_amount.toLocaleString("ko-KR")}${p.pay_type === "per_session" ? " · 회차당" : ""}`;
}

export default async function ProposalsPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, cover_message, created_at, responded_at, contact_revealed_at,
       project:projects ( id, title, description, visibility, status, pay_amount, pay_type, application_deadline, owner_id )`,
    )
    .eq("applicant_id", user.id)
    .eq("source", "direct_proposal")
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Row[];

  // Fetch sender (project owner) profiles
  const ownerIds = Array.from(
    new Set(list.map((r) => r.project?.owner_id).filter((v): v is string => Boolean(v))),
  );
  const ownersMap = new Map<
    string,
    { id: string; display_name: string; avatar_url: string | null; phone: string | null }
  >();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, phone")
      .in("id", ownerIds);
    for (const o of owners ?? []) ownersMap.set(o.id, o);
  }

  const pending = list.filter((r) => r.status === "pending");
  const accepted = list.filter((r) => r.status === "accepted");
  const others = list.filter(
    (r) => r.status !== "pending" && r.status !== "accepted",
  );

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 받은 제안
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          Direct offers
        </h1>
        <p className="text-sm text-ink-2">총 {list.length}건</p>
      </header>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          아직 받은 제안이 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {pending.length > 0 ? (
            <Section title={`대기 중 (${pending.length})`}>
              {pending.map((r) => (
                <ProposalCard
                  key={r.id}
                  row={r}
                  owner={r.project ? ownersMap.get(r.project.owner_id) : undefined}
                  showActions
                />
              ))}
            </Section>
          ) : null}

          {accepted.length > 0 ? (
            <Section title={`수락 — 연락 진행 중 (${accepted.length})`}>
              {accepted.map((r) => (
                <ProposalCard
                  key={r.id}
                  row={r}
                  owner={r.project ? ownersMap.get(r.project.owner_id) : undefined}
                  showContact
                />
              ))}
            </Section>
          ) : null}

          {others.length > 0 ? (
            <Section title={`마감 (${others.length})`}>
              {others.map((r) => (
                <ProposalCard
                  key={r.id}
                  row={r}
                  owner={r.project ? ownersMap.get(r.project.owner_id) : undefined}
                />
              ))}
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-3">{title}</p>
      <ul className="flex flex-col gap-2">{children}</ul>
    </section>
  );
}

function ProposalCard({
  row,
  owner,
  showActions,
  showContact,
}: {
  row: Row;
  owner?: { id: string; display_name: string; avatar_url: string | null; phone: string | null };
  showActions?: boolean;
  showContact?: boolean;
}) {
  const project = row.project;
  if (!project) {
    return (
      <li className="rounded-xl border border-border bg-card p-3 text-sm text-ink-3">
        (삭제된 프로젝트)
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/projects/${project.id}`} className="flex-1">
          <div className="flex flex-wrap gap-1">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {project.visibility === "private" ? "비공개" : "공개"} 제안
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-2">
              {APPLICATION_STATUS_LABELS[row.status]}
            </span>
          </div>
          <h3 className="mt-2 text-base font-semibold leading-snug">
            {project.title}
          </h3>
          {owner ? (
            <p className="mt-1 text-xs text-ink-3">
              {owner.display_name}로부터
            </p>
          ) : null}
          <p className="mt-2 font-mono text-sm">{formatPay(project)}</p>
        </Link>
      </div>
      {row.cover_message ? (
        <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-ink-2">
          {row.cover_message}
        </p>
      ) : null}
      {showActions ? <ProposalActions applicationId={row.id} /> : null}
      {showContact ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
          <p className="font-semibold text-primary">연락 정보</p>
          <p className="mt-1 text-ink-2">
            {owner?.display_name ?? "(이름 없음)"}
            {owner?.phone ? ` · ${owner.phone}` : " · 전화번호 미등록"}
          </p>
          <p className="mt-1 text-[11px] text-ink-3">
            합의된 연락 채널을 통해 직접 일정·세부사항을 조율해 주세요.
          </p>
        </div>
      ) : null}
    </li>
  );
}
