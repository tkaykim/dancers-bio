import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { intakeDb } from "@/lib/project-intake/db";

export default async function ReviewIngestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = intakeDb();
  const { data: job } = await db
    .from("project_intake_jobs")
    .select("id,result,project_id")
    .eq("id", id)
    .maybeSingle();
  if (job?.project_id) redirect(`/projects/${job.project_id}/edit`);
  if (job?.result?.project) redirect(`/projects/new?intake=${id}`);
  if (job) redirect(`/admin/projects/intake?focus=${id}`);
  const { data: old } = await db
    .from("project_ingestions")
    .select("published_project_id,merged_into_project_id")
    .eq("id", id)
    .maybeSingle();
  if (!old) notFound();
  if (old.published_project_id || old.merged_into_project_id)
    redirect(
      `/projects/${old.published_project_id || old.merged_into_project_id}/edit`,
    );
  redirect(`/admin/projects/intake?source=${id}`);
}
