import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function RecruitmentChannelEntryPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const shareCode = (code ?? "").trim();
  if (!shareCode) notFound();

  const admin = createAdminClient();
  const { data: channel } = await admin
    .from("recruitment_channels")
    .select("project_id, legacy_project_id, share_code, status")
    .eq("share_code", shareCode)
    .maybeSingle();

  if (!channel || channel.status !== "active") notFound();
  const targetProjectId =
    ((channel.legacy_project_id as string | null) ?? null) ||
    (channel.project_id as string);

  const { data: project } = await admin
    .from("projects")
    .select("short_code, deleted_at")
    .eq("id", targetProjectId)
    .maybeSingle();

  if (!project || project.deleted_at) notFound();

  redirect(`/projects/${project.short_code}?channel=${encodeURIComponent(shareCode)}`);
}
