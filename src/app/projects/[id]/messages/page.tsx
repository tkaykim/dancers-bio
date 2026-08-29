import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canManageProject, requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";
import { listCampaignsWithStats } from "@/lib/messaging/campaigns";
import { openDancerThreadAction } from "@/app/actions/staff-messages";
import { StaffInbox } from "@/components/messaging/StaffInbox";

export const metadata: Metadata = { title: "메시지 콘솔 | deetz" };
export const dynamic = "force-dynamic";

// 운영자 공동 인박스 + 일괄 발송(캠페인).
export default async function ProjectMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ room?: string; dancer?: string }>;
}) {
  await requireUser();
  if (!messagingEnabled()) notFound();

  const { id: projectId } = await params;
  const query = await searchParams;

  if (!(await canManageProject(projectId))) {
    redirect(`/projects/${projectId}`);
  }

  // 지원자 콘솔에서 "메시지 보내기"로 들어온 경우 — 방을 만들고 그 방을 연다.
  if (query.dancer && !query.room) {
    const opened = await openDancerThreadAction({ projectId, dancerId: query.dancer });
    if (opened.ok && opened.data) {
      redirect(`/projects/${projectId}/messages?room=${opened.data.roomId}`);
    }
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound();

  const campaigns = await listCampaignsWithStats(projectId);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="border-b border-border px-4 py-4">
        <h1 className="text-xl font-bold tracking-tight">{project.title as string}</h1>
        <p className="mt-0.5 text-[12px] text-ink-3">
          메시지 콘솔 — 답장은 프로젝트 운영팀 명의로 나갑니다.
        </p>
      </div>
      <StaffInbox
        projectId={projectId}
        projectTitle={project.title as string}
        initialRooms={[]}
        initialCampaigns={campaigns}
        initialRoomId={query.room ?? null}
      />
    </div>
  );
}
