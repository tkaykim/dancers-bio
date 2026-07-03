import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyProjectIdentifier } from "@/lib/projectId";
import { getProjectSizeRows } from "@/lib/fit/size-rows";
import { SizeSummary } from "@/components/project/SizeSummary";

// 매 요청마다 최신 제출 반영 (캐시 없음).
export const dynamic = "force-dynamic";

// 의상 사이즈 취합 대시보드 + 리스트뷰. 확정자(confirmed_at) 대상. 관리자 전용.
export default async function ProjectSizesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const identifier = classifyProjectIdentifier(idParam);
  if (!identifier) notFound();

  await requireUser();
  const admin = createAdminClient();

  const pq = admin
    .from("projects")
    .select("id, short_code, title")
    .is("deleted_at", null);
  const { data: project } = await (identifier.kind === "uuid"
    ? pq.eq("id", identifier.value)
    : pq.eq("short_code", identifier.value)
  ).maybeSingle();
  if (!project) notFound();
  const projectId = project.id as string;
  if (!(await canManageProject(projectId))) notFound();

  const rows = await getProjectSizeRows(projectId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
      <Link
        href={`/projects/${project.short_code}/applicants`}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 지원자 콘솔
      </Link>
      <h1 className="text-xl font-bold leading-tight tracking-tight">
        의상 사이즈 취합
      </h1>
      <SizeSummary rows={rows} projectTitle={project.title as string} />
    </div>
  );
}
