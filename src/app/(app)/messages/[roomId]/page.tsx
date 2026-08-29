import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { messagingEnabled } from "@/lib/messaging/flags";
import {
  ChatRoomView,
  type ThreadMessage,
  type ThreadResponse,
} from "@/components/messaging/ChatRoomView";
import { PushPrompt } from "@/components/layout/PushPrompt";

export const metadata: Metadata = { title: "대화 | deetz" };
export const dynamic = "force-dynamic";

// 대화방 페이지 — 댄서·운영자 공용(역할은 서버에서 판정).
// RLS 가 접근을 판정한다: 방이 안 읽히면 곧 권한 없음이다.
export default async function MessageRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  await requireUser();
  if (!messagingEnabled()) notFound();

  const { roomId } = await params;
  const supabase = await createClient();

  const { data: room } = await supabase
    .from("chat_rooms")
    .select(
      "id, project_id, direct_dancer_id, last_seq, staff_last_read_seq, closed_at, resolved_at, awaiting_staff_since, project:projects(id, title, short_code)",
    )
    .eq("id", roomId)
    .maybeSingle();
  if (!room) notFound();

  const project = Array.isArray(room.project) ? room.project[0] ?? null : room.project;
  const projectTitle = (project?.title as string | undefined) ?? "프로젝트";

  const { data: canManage } = await supabase.rpc("can_manage_project", {
    p_id: room.project_id,
  });
  const role: "member" | "staff" = canManage === true ? "staff" : "member";

  // 최근 80개 — 이후는 폴링이 이어받는다(스크롤 페이지네이션은 후속).
  const { data: recent } = await supabase
    .from("chat_messages")
    .select(
      "id, room_id, room_seq, sender_user_id, sender_role, kind, body, action, deleted_at, created_at",
    )
    .eq("room_id", roomId)
    .order("room_seq", { ascending: false })
    .limit(80);
  const messages = ((recent ?? []) as unknown as ThreadMessage[])
    .slice()
    .sort((a, b) => a.room_seq - b.room_seq)
    .map((m) => ({ ...m, body: m.deleted_at ? "" : m.body }));

  const actionIds = messages.filter((m) => m.kind === "action_request").map((m) => m.id);
  let responses: ThreadResponse[] = [];
  if (actionIds.length > 0) {
    const { data: resp } = await supabase
      .from("chat_message_responses")
      .select("message_id, dancer_id, choice, detail")
      .in("message_id", actionIds);
    responses = (resp ?? []) as ThreadResponse[];
  }

  let mutedUntil: string | null = null;
  let memberReadSeq: number | null = null;
  if (room.direct_dancer_id) {
    const { data: seat } = await supabase
      .from("chat_room_members")
      .select("muted_until, last_read_seq")
      .eq("room_id", roomId)
      .eq("dancer_id", room.direct_dancer_id)
      .maybeSingle();
    mutedUntil = (seat?.muted_until as string | null) ?? null;
    memberReadSeq = seat ? Number(seat.last_read_seq) : null;
  }

  // 헤더의 내 진행 상태 pill(멤버 화면 전용) — 지원서 상태를 대화방에서 바로 확인.
  let stagePill: string | null = null;
  if (role === "member" && room.direct_dancer_id) {
    const { data: app } = await supabase
      .from("applications")
      .select("status, passed_round, confirmed_at")
      .eq("project_id", room.project_id)
      .eq("dancer_id", room.direct_dancer_id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (app) {
      if (app.confirmed_at) stagePill = "최종 합격";
      else if (app.status === "accepted") stagePill = `${Math.max(1, Number(app.passed_round ?? 1))}차 합격`;
      else if (app.status === "pending") stagePill = "검토 중";
    }
  }

  let staffDancerName = "지원자";
  if (role === "staff" && room.direct_dancer_id) {
    const { data: dancer } = await supabase
      .from("dancers")
      .select("stage_name")
      .eq("id", room.direct_dancer_id)
      .maybeSingle();
    staffDancerName = (dancer?.stage_name as string | undefined) ?? "지원자";
  }

  return (
    <div className="flex h-[calc(100svh-0px)] flex-col lg:h-[calc(100svh-40px)]">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link
          href={role === "staff" ? `/projects/${room.project_id}/messages` : "/messages"}
          aria-label="목록으로"
          className="shrink-0 text-lg leading-none text-ink-2"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight">{projectTitle}</p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {role === "member" ? "운영팀" : staffDancerName}
            {stagePill ? ` · ${stagePill}` : ""}
          </p>
        </div>
        {role === "staff" ? (
          <Link
            href={`/projects/${room.project_id}/messages?room=${roomId}`}
            className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold text-ink-2"
          >
            콘솔에서 열기
          </Link>
        ) : null}
      </header>

      {role === "member" ? <PushPrompt /> : null}

      <div className="min-h-0 flex-1">
        <ChatRoomView
          roomId={roomId}
          role={role}
          myDancerId={role === "member" ? room.direct_dancer_id : null}
          projectTitle={projectTitle}
          counterpartLabel={role === "member" ? "운영팀" : staffDancerName}
          initialRoom={{
            id: room.id as string,
            lastSeq: Number(room.last_seq),
            staffLastReadSeq: Number(room.staff_last_read_seq),
            memberReadSeq,
            closed: !!room.closed_at,
            resolved: !!room.resolved_at,
            awaitingSince: room.awaiting_staff_since as string | null,
          }}
          initialMessages={messages}
          initialResponses={responses}
          mutedUntil={mutedUntil}
        />
      </div>
    </div>
  );
}
