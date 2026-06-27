import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { classifyProjectIdentifier } from "@/lib/projectId";
import {
  ProjectEditForm,
  type ProjectEditInitial,
} from "@/components/project/ProjectEditForm";
import { DeleteProjectButton } from "@/components/project/DeleteProjectButton";

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) notFound();

  const me = await requireProfile();
  const supabase = await createClient();

  const baseQuery = supabase
    .from("projects")
    .select(
      `id, short_code, owner_id, title, description, visibility, status, category, genre_id,
       region_text, pay_amount, pay_type, recruitment_count,
       application_deadline, collect_applicant_fee, posted_by_label`,
    )
    .is("deleted_at", null);

  const { data: project } = await (
    identifier.kind === "uuid"
      ? baseQuery.eq("id", identifier.value)
      : baseQuery.eq("short_code", identifier.value)
  ).maybeSingle();

  if (!project) notFound();
  // 소유자·슈퍼관리자·공동관리자만 수정 화면 접근.
  if (!(await canManageProject(project.id as string))) notFound();
  // 삭제는 소유자·슈퍼관리자만.
  const canDelete = me.is_admin || project.owner_id === me.id;

  const { data: genres } = await supabase
    .from("genres")
    .select("id, label_ko")
    .order("sort_order");

  const initial: ProjectEditInitial = {
    id: project.id as string,
    short_code: project.short_code as string,
    title: project.title as string,
    description: project.description as string,
    visibility: project.visibility as "public" | "private",
    status: project.status as ProjectEditInitial["status"],
    category: (project.category as ProjectEditInitial["category"]) ?? null,
    genre_id: (project.genre_id as string | null) ?? null,
    region_text: (project.region_text as string | null) ?? null,
    pay_amount: (project.pay_amount as number | null) ?? null,
    pay_type: (project.pay_type as ProjectEditInitial["pay_type"]) ?? null,
    recruitment_count: project.recruitment_count as number,
    application_deadline:
      (project.application_deadline as string | null) ?? null,
    collect_applicant_fee: Boolean(project.collect_applicant_fee),
    posted_by_label: (project.posted_by_label as string | null) ?? null,
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href={`/projects/${initial.short_code}`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 공고 상세
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 공고 수정
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          캐스팅 공고 수정
        </h1>
      </header>

      <ProjectEditForm initial={initial} genres={genres ?? []} />

      {canDelete ? (
        <section className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-destructive">
            ↳ 위험 구역
          </p>
          <p className="text-sm text-ink-2">
            삭제하면 피드/검색에서 즉시 사라집니다.
          </p>
          <DeleteProjectButton projectId={initial.id} variant="destructive" />
        </section>
      ) : null}
    </div>
  );
}
