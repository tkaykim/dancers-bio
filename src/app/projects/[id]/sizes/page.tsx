import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyProjectIdentifier } from "@/lib/projectId";
import { SizeSummary, type SizeRow } from "@/components/project/SizeSummary";

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

  // 확정자
  const { data: apps } = await admin
    .from("applications")
    .select("dancer_id, dancers!inner(id, stage_name, gender)")
    .eq("project_id", projectId)
    .eq("status", "accepted")
    .not("confirmed_at", "is", null)
    .is("archived_at", null);
  type A = { dancers: { id: string; stage_name: string; gender: string | null } };
  const list = (apps ?? []) as unknown as A[];
  const seen = new Set<string>();
  const dancers = list
    .map((a) => a.dancers)
    .filter((d) => d && !seen.has(d.id) && seen.add(d.id));

  const ids = dancers.map((d) => d.id);
  const privByD = new Map<
    string,
    { height: number | null; top: string | null; waist: string | null; length: string | null }
  >();
  if (ids.length > 0) {
    const { data: priv } = await admin
      .from("dancer_private_info")
      .select("dancer_id, height_cm, top_size, pants_waist_inch, pants_length_cm")
      .in("dancer_id", ids);
    for (const r of (priv ?? []) as Array<{
      dancer_id: string;
      height_cm: number | null;
      top_size: string | null;
      pants_waist_inch: string | null;
      pants_length_cm: string | null;
    }>) {
      privByD.set(r.dancer_id, {
        height: r.height_cm,
        top: r.top_size,
        waist: r.pants_waist_inch,
        length: r.pants_length_cm,
      });
    }
  }

  const rows: SizeRow[] = dancers
    .map((d) => {
      const p = privByD.get(d.id) ?? {
        height: null,
        top: null,
        waist: null,
        length: null,
      };
      const g = (d.gender ?? "").toLowerCase();
      return {
        name: d.stage_name ?? "댄서",
        gender: (g === "male" || g === "female" ? g : "other") as SizeRow["gender"],
        height: p.height,
        top: p.top,
        waist: p.waist,
        length: p.length,
        submitted: !!(p.top && p.waist && p.length),
      };
    })
    .sort(
      (a, b) =>
        a.gender.localeCompare(b.gender) ||
        Number(b.submitted) - Number(a.submitted) ||
        (b.height ?? 0) - (a.height ?? 0),
    );

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
