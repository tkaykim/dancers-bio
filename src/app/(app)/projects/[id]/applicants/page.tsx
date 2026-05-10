import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { DecideButtons } from "@/components/project/DecideButtons";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/projects";

type Application = {
  id: string;
  status: keyof typeof APPLICATION_STATUS_LABELS;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  responded_at: string | null;
  applicant: { id: string; display_name: string; avatar_url: string | null } | null;
};

type Project = { id: string; owner_id: string; title: string };

const STATUS_COLOR: Record<string, string> = {
  pending: "text-ink-2",
  accepted: "text-ok",
  rejected: "text-destructive",
  withdrawn: "text-ink-3",
};

export default async function ApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id, title")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();
  const p = project as Project;
  if (p.owner_id !== user.id) notFound();

  const { data: rows } = await supabase
    .from("applications")
    .select(
      `id, status, source, cover_message, created_at, responded_at,
       applicant:profiles!applications_applicant_id_fkey ( id, display_name, avatar_url )`,
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as unknown as Application[];

  const pending = list.filter((a) => a.status === "pending");
  const decided = list.filter((a) => a.status !== "pending");

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href={`/projects/${id}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 프로젝트
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 지원자
        </p>
        <h1 className="text-xl font-bold tracking-tight leading-tight">
          {p.title}
        </h1>
        <p className="text-sm text-ink-2">총 {list.length}명</p>
      </header>

      {pending.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            대기 중 ({pending.length})
          </p>
          <ul className="flex flex-col gap-2">
            {pending.map((a) => (
              <ApplicantRow key={a.id} app={a} showActions />
            ))}
          </ul>
        </section>
      ) : null}

      {decided.length > 0 ? (
        <section className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            처리 완료 ({decided.length})
          </p>
          <ul className="flex flex-col gap-2">
            {decided.map((a) => (
              <ApplicantRow key={a.id} app={a} />
            ))}
          </ul>
        </section>
      ) : null}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          아직 지원자가 없습니다.
        </p>
      ) : null}
    </div>
  );
}

function ApplicantRow({
  app,
  showActions,
}: {
  app: Application;
  showActions?: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        {app.applicant?.avatar_url ? (
          <Image
            src={app.applicant.avatar_url}
            alt={app.applicant.display_name ?? "applicant"}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
            {(app.applicant?.display_name ?? "?")[0]}
          </div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {app.applicant?.display_name ?? "(알 수 없음)"}
          </p>
          <p className={`mt-0.5 text-[11px] ${STATUS_COLOR[app.status] ?? "text-ink-3"}`}>
            {app.source === "direct_proposal" ? "제안" : "지원"} ·{" "}
            {APPLICATION_STATUS_LABELS[app.status]}
          </p>
        </div>
      </div>
      {app.cover_message ? (
        <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs leading-relaxed text-ink-2">
          {app.cover_message}
        </p>
      ) : null}
      {showActions ? <DecideButtons applicationId={app.id} /> : null}
    </li>
  );
}
