"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatListTime, usePolling } from "./poll";

// 댄서 메시지함. 1행 = 프로젝트 하나와의 대화(운영팀 1:1).
// 종료 프로젝트는 「지난 대화」로 접는다 — 삭제가 아니라 접힘.

type InboxRoom = {
  roomId: string;
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  unread: number;
  lastMessageAt: string | null;
  lastPreview: string;
  mutedUntil: string | null;
  closed: boolean;
};

type Filter = "all" | "unread" | "active";

export function MessagesInbox({ initialRooms }: { initialRooms: InboxRoom[] }) {
  const [rooms, setRooms] = useState<InboxRoom[]>(initialRooms);
  const [filter, setFilter] = useState<Filter>("all");
  const [showPast, setShowPast] = useState(false);

  usePolling(async () => {
    const res = await fetch("/api/messages/rooms", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { rooms?: InboxRoom[] };
    if (data.rooms) setRooms(data.rooms);
  }, 45_000);

  const isActiveProject = (r: InboxRoom) => r.projectStatus === "open" || r.projectStatus === "draft";

  const filtered = useMemo(() => {
    return rooms.filter((r) => {
      if (filter === "unread") return r.unread > 0;
      if (filter === "active") return isActiveProject(r);
      return true;
    });
  }, [rooms, filter]);

  const current = filtered.filter((r) => isActiveProject(r) || r.unread > 0);
  const past = filtered.filter((r) => !isActiveProject(r) && r.unread === 0);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "unread", label: "안읽음" },
    { key: "active", label: "진행 중" },
  ];

  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 pb-3">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors " +
              (filter === f.key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-ink-2 hover:bg-secondary")
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {rooms.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <p className="text-sm font-semibold">아직 메시지가 없어요</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
            지원한 공고의 운영팀 연락이 여기에 도착해요.
          </p>
          <Link
            href="/feed"
            className="mt-5 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
            공고 보러 가기
          </Link>
        </div>
      ) : (
        <ul>
          {current.map((r) => (
            <InboxRow key={r.roomId} room={r} />
          ))}
          {past.length > 0 ? (
            <li className="border-t border-border">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                className="w-full px-4 py-3 text-left text-[13px] text-ink-3"
              >
                지난 대화 {past.length}개 — {showPast ? "접기" : "펼치기"}
              </button>
              {showPast ? (
                <ul>
                  {past.map((r) => (
                    <InboxRow key={r.roomId} room={r} dim />
                  ))}
                </ul>
              ) : null}
            </li>
          ) : null}
          {current.length === 0 && past.length === 0 ? (
            <li className="px-4 py-10 text-center text-[13px] text-ink-3">
              조건에 맞는 대화가 없습니다.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function InboxRow({ room, dim = false }: { room: InboxRoom; dim?: boolean }) {
  // eslint-disable-next-line react-hooks/purity -- 뮤트 여부 표시는 현재 시각 의존
  const muted = !!room.mutedUntil && new Date(room.mutedUntil).getTime() > Date.now();
  return (
    <li className="border-b border-border">
      <Link href={`/messages/${room.roomId}`} className="block px-4 py-3 hover:bg-secondary/60">
        <div className="flex items-baseline gap-2">
          <span
            className={
              "min-w-0 flex-1 truncate text-[15px] leading-tight " +
              (room.unread > 0 ? "font-bold" : dim ? "font-medium text-ink-2" : "font-semibold")
            }
          >
            {room.projectTitle}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-ink-3" suppressHydrationWarning>
            {formatListTime(room.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] leading-relaxed text-ink-3">
            {room.closed ? "종료된 대화" : room.lastPreview || "대화를 시작해 보세요"}
          </span>
          {muted ? (
            <span className="shrink-0 text-[11px] text-ink-4" aria-label="알림 꺼짐">
              🔕
            </span>
          ) : null}
          {room.unread > 0 ? (
            <span className="inline-flex min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-5 text-white">
              {room.unread > 99 ? "99+" : room.unread}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
