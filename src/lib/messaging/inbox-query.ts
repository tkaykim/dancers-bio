import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { previewText } from "./types";

// 댄서 메시지함 목록 빌더 — 페이지(SSR)와 폴링 route 가 같은 로직을 쓴다.
// 반드시 "세션 클라이언트"로 호출한다(RLS 가 실제 방어선).

export type InboxRoom = {
  roomId: string;
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  lastSeq: number;
  lastReadSeq: number;
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string;
  lastKind: string;
  mutedUntil: string | null;
  closed: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

export async function listMyDancerIds(supabase: AnyClient, userId: string): Promise<string[]> {
  const { data: mine } = await supabase.from("dancers").select("id").eq("profile_id", userId);
  const { data: managed } = await supabase
    .from("dancer_managers")
    .select("dancer_id")
    .eq("manager_id", userId);
  return [
    ...new Set([
      ...(mine ?? []).map((d: { id: string }) => d.id),
      ...(managed ?? []).map((d: { dancer_id: string }) => d.dancer_id),
    ]),
  ];
}

export async function listMemberInboxRooms(
  supabase: AnyClient,
  userId: string,
): Promise<InboxRoom[]> {
  const dancerIds = await listMyDancerIds(supabase, userId);
  if (dancerIds.length === 0) return [];

  const { data: seats } = await supabase
    .from("chat_room_members")
    .select(
      "room_id, dancer_id, last_read_seq, muted_until, room:chat_rooms!inner(id, project_id, last_seq, last_message_at, closed_at, archived_at, project:projects(id, title, status))",
    )
    .in("dancer_id", dancerIds)
    .is("removed_at", null);

  type SeatRow = {
    room_id: string;
    last_read_seq: number;
    muted_until: string | null;
    room: {
      id: string;
      project_id: string;
      last_seq: number;
      last_message_at: string | null;
      closed_at: string | null;
      archived_at: string | null;
      project:
        | { id: string; title: string | null; status: string | null }
        | Array<{ id: string; title: string | null; status: string | null }>
        | null;
    } | null;
  };

  const rows = ((seats ?? []) as unknown as SeatRow[])
    .map((s) => ({ ...s, room: Array.isArray(s.room) ? s.room[0] ?? null : s.room }))
    .filter((s) => s.room && !s.room.archived_at && Number(s.room.last_seq) > 0);

  const previews = await Promise.all(
    rows.map(async (s) => {
      const { data: msg } = await supabase
        .from("chat_messages")
        .select("body, kind, deleted_at")
        .eq("room_id", s.room_id)
        .eq("room_seq", Number(s.room!.last_seq))
        .maybeSingle();
      return msg ?? null;
    }),
  );

  const rooms: InboxRoom[] = rows.map((s, i) => {
    const project = Array.isArray(s.room!.project) ? s.room!.project[0] ?? null : s.room!.project;
    const msg = previews[i] as { body?: string; kind?: string; deleted_at?: string | null } | null;
    const rawPreview = msg?.deleted_at
      ? "삭제된 메시지"
      : msg?.kind === "action_request"
        ? `[응답 요청] ${msg?.body ?? ""}`
        : msg?.kind === "system"
          ? `(안내) ${msg?.body ?? ""}`
          : (msg?.body ?? "");
    return {
      roomId: s.room_id,
      projectId: s.room!.project_id,
      projectTitle: project?.title ?? "프로젝트",
      projectStatus: project?.status ?? "open",
      lastSeq: Number(s.room!.last_seq),
      lastReadSeq: Number(s.last_read_seq),
      unread: Math.max(0, Number(s.room!.last_seq) - Number(s.last_read_seq)),
      lastMessageAt: s.room!.last_message_at,
      lastPreview: previewText(rawPreview, 60),
      lastKind: (msg?.kind as string | undefined) ?? "text",
      mutedUntil: s.muted_until,
      closed: !!s.room!.closed_at,
    };
  });

  rooms.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return rooms;
}
