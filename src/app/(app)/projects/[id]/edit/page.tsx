import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  ProjectEditForm,
  type ProjectEditInitial,
} from "@/components/project/ProjectEditForm";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";
import type { SESSION_TYPE_LABELS } from "@/lib/validation/projects";

type SessionRow = {
  session_type: keyof typeof SESSION_TYPE_LABELS;
  starts_at: string;
  location_name: string | null;
  role_notes: string | null;
};

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: project }, { data: viewerProfile }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        `id, owner_id, title, description, visibility, status, genre_id,
         region_text, pay_amount, pay_type, recruitment_count,
         allow_team_apply, application_deadline`,
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
  ]);

  if (!project) notFound();
  const isAdmin = !!viewerProfile?.is_admin;
  if (project.owner_id !== user.id && !isAdmin) notFound();

  const [{ data: sessions }, { data: genres }] = await Promise.all([
    supabase
      .from("project_sessions")
      .select(
        "session_type, starts_at, location_name, role_notes, sort_order",
      )
      .eq("project_id", id)
      .order("sort_order")
      .order("starts_at"),
    supabase.from("genres").select("id, label_ko").order("sort_order"),
  ]);

  const initial: ProjectEditInitial = {
    id: project.id as string,
    title: project.title as string,
    description: project.description as string,
    visibility: project.visibility as "public" | "private",
    status: project.status as ProjectEditInitial["status"],
    genre_id: (project.genre_id as string | null) ?? null,
    region_text: (project.region_text as string | null) ?? null,
    pay_amount: (project.pay_amount as number | null) ?? null,
    pay_type: (project.pay_type as ProjectEditInitial["pay_type"]) ?? null,
    recruitment_count: project.recruitment_count as number,
    allow_team_apply: !!project.allow_team_apply,
    application_deadline: (project.application_deadline as string | null) ?? null,
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href={`/projects/${id}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 공고 상세
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 공고 수정</p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          캐스팅 공고 수정
        </h1>
      </header>

      <ProjectEditForm
        initial={initial}
        initialSessions={(sessions ?? []) as SessionRow[]}
        genres={genres ?? []}
      />

      <section className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-destructive">
          ↳ 위험 구역
        </p>
        <p className="text-sm text-ink-2">
          삭제하면 피드/검색에서 즉시 사라집니다.
        </p>
        <DeleteProjectButton projectId={id} variant="destructive" />
      </section>
    </div>
  );
}
