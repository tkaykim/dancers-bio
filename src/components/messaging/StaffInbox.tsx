"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  addInternalNoteAction,
  markUnansweredAction,
  resolveThreadAction,
} from "@/app/actions/staff-messages";
import { slaTier } from "@/lib/messaging/types";
import {
  ChatRoomView,
  type ThreadMessage,
  type ThreadResponse,
  type ThreadRoomMeta,
} from "./ChatRoomView";
import { CampaignPanel, type CampaignRow } from "./CampaignPanel";
import { formatListTime, usePolling } from "./poll";

// 운영자 공동 인박스 — 좌: 스레드 목록(미답변 우선) / 중: 대화 / 우: 컨텍스트·내부 메모.
// "미답변"은 지원자 마지막 발화 기준(awaiting_staff_since)이고, 내부 메모·읽음은 해제하지 못한다.

export type StaffRoomRow = {
  roomId: string;
  dancerId: string | null;
  dancerName: string;
  lastSeq: number;
  staffUnread: number;
  awaitingSince: string | null;
  resolved: boolean;
  closed: boolean;
  lastMessageAt: string | null;
  lastPreview: string;
};

type Note = { id: string; author_user_id: string | null; body: string; created_at: string };

const SLA_DOT: Record<string, string> = {
  none: "bg-transparent",
  ok: "bg-zinc-400",
  warn: "bg-amber-500",
  late: "bg-red-500",
};

export function StaffInbox(props: {
  projectId: string;
  projectTitle: string;
  initialRooms: StaffRoomRow[];
  initialCampaigns: CampaignRow[];
  initialRoomId: string | null;
}) {
  const [rooms, setRooms] = useState<StaffRoomRow[]>(props.initialRooms);
  const [tab, setTab] = useState<"threads" | "campaigns">("threads");
  const [filter, setFilter] = useState<"awaiting" | "all">("awaiting");
  const [selectedId, setSelectedId] = useState<string | null>(props.initialRoomId);
  const [thread, setThread] = useState<{
    room: ThreadRoomMeta;
    messages: ThreadMessage[];
    responses: ThreadResponse[];
    notes: Note[];
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [meta, setMeta] = useState<ThreadRoomMeta | null>(null);

  usePolling(async () => {
    const res = await fetch(`/api/messages/staff-rooms/${props.projectId}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { rooms?: StaffRoomRow[] };
    if (data.rooms) setRooms(data.rooms);
  }, 30_000);

  const loadThread = useCallback(async (roomId: string) => {
    const res = await fetch(`/api/messages/rooms/${roomId}?after_seq=0`, { cache: "no-store" });
    if (!res.ok) {
      toast.error("대화를 불러오지 못했습니다.");
      return;
    }
    const data = (await res.json()) as {
      room: ThreadRoomMeta;
      messages: ThreadMessage[];
      responses: ThreadResponse[];
      notes: Note[];
    };
    // 이전 방 데이터는 교체 시점까지 유지(로딩 플래시 방지) — 렌더는 room.id 일치로 가드한다.
    setThread(data);
    setMeta(data.room);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch 후 반영되는 비동기 로딩(동기 setState 아님)
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  const selectedRow = rooms.find((r) => r.roomId === selectedId) ?? null;

  // eslint-disable-next-line react-hooks/purity -- 경과 시간 표시는 현재 시각 의존(리렌더마다 갱신이 의도)
  const awaitingHours = meta?.awaitingSince ? Math.max(1, Math.floor((Date.now() - new Date(meta.awaitingSince).getTime()) / 3_600_000)) : null;

  const visibleRooms = useMemo(() => {
    const sorted = [...rooms].sort((a, b) => {
      const aw = a.awaitingSince ? 0 : 1;
      const bw = b.awaitingSince ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
    });
    return filter === "awaiting" ? sorted.filter((r) => r.awaitingSince) : sorted;
  }, [rooms, filter]);

  const awaitingCount = rooms.filter((r) => r.awaitingSince).length;

  const doResolve = useCallback(async () => {
    if (!selectedId) return;
    const result = await resolveThreadAction({ roomId: selectedId });
    if (!result.ok) return void toast.error(result.error);
    toast.success("처리 완료로 표시했습니다. 지원자가 답장하면 자동으로 다시 열립니다.");
    setRooms((prev) =>
      prev.map((r) =>
        r.roomId === selectedId ? { ...r, awaitingSince: null, resolved: true } : r,
      ),
    );
  }, [selectedId]);

  const doMarkUnanswered = useCallback(async () => {
    if (!selectedId) return;
    const result = await markUnansweredAction({ roomId: selectedId });
    if (!result.ok) return void toast.error(result.error);
    setRooms((prev) =>
      prev.map((r) =>
        r.roomId === selectedId
          ? { ...r, awaitingSince: new Date().toISOString(), resolved: false }
          : r,
      ),
    );
  }, [selectedId]);

  const addNote = useCallback(async () => {
    if (!selectedId || !noteDraft.trim()) return;
    const result = await addInternalNoteAction({ roomId: selectedId, body: noteDraft.trim() });
    if (!result.ok) return void toast.error(result.error);
    setThread((prev) =>
      prev
        ? {
            ...prev,
            notes: [
              ...prev.notes,
              {
                id: result.data!.id,
                author_user_id: null,
                body: noteDraft.trim(),
                created_at: result.data!.createdAt,
              },
            ],
          }
        : prev,
    );
    setNoteDraft("");
  }, [selectedId, noteDraft]);

  return (
    <div className="flex h-[calc(100svh-120px)] min-h-[480px] flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)_280px]">
      {/* 좌: 목록 */}
      <aside
        className={
          "min-h-0 border-border lg:border-r " + (selectedId && tab === "threads" ? "hidden lg:block" : "")
        }
      >
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
          <button
            type="button"
            onClick={() => setTab("threads")}
            className={
              "rounded-md px-2.5 py-1 text-[13px] font-bold " +
              (tab === "threads" ? "bg-foreground text-background" : "text-ink-2")
            }
          >
            대화 {awaitingCount > 0 ? `· 미답변 ${awaitingCount}` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("campaigns")}
            className={
              "rounded-md px-2.5 py-1 text-[13px] font-bold " +
              (tab === "campaigns" ? "bg-foreground text-background" : "text-ink-2")
            }
          >
            일괄 발송
          </button>
        </div>

        {tab === "threads" ? (
          <>
            <div className="flex gap-1.5 border-b border-border px-3 py-2">
              {(
                [
                  { key: "awaiting", label: `미답변 ${awaitingCount}` },
                  { key: "all", label: "전체" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={
                    "rounded-full border px-2.5 py-0.5 text-[12px] font-semibold " +
                    (filter === f.key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-ink-3")
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
            <ul className="min-h-0 overflow-y-auto" style={{ maxHeight: "calc(100% - 88px)" }}>
              {visibleRooms.length === 0 ? (
                <li className="px-4 py-8 text-center text-[13px] text-ink-3">
                  {filter === "awaiting" ? "미답변 대화가 없습니다 👍" : "대화가 없습니다."}
                </li>
              ) : null}
              {visibleRooms.map((r) => {
                const tier = slaTier(r.awaitingSince);
                return (
                  <li key={r.roomId} className="border-b border-border">
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.roomId)}
                      className={
                        "block w-full px-3 py-2.5 text-left hover:bg-secondary/60 " +
                        (selectedId === r.roomId ? "bg-secondary" : "")
                      }
                    >
                      <div className="flex items-baseline gap-2">
                        <span
                          aria-hidden
                          className={`h-2 w-2 shrink-0 self-center rounded-full ${SLA_DOT[tier]}`}
                        />
                        <span
                          className={
                            "min-w-0 flex-1 truncate text-[14px] " +
                            (r.staffUnread > 0 ? "font-bold" : "font-semibold")
                          }
                        >
                          {r.dancerName}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-ink-3">
                          {formatListTime(r.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 pl-4">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
                          {r.closed ? "종료됨" : r.resolved ? "처리 완료" : r.lastPreview}
                        </span>
                        {r.staffUnread > 0 ? (
                          <span className="inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white">
                            {r.staffUnread > 99 ? "99+" : r.staffUnread}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="px-4 py-4 text-[12px] leading-relaxed text-ink-3 lg:hidden">
            오른쪽 화면에서 일괄 발송을 관리합니다.
          </p>
        )}
      </aside>

      {/* 중: 대화 or 캠페인 */}
      <section className={"min-h-0 flex-1 " + (!selectedId && tab === "threads" ? "hidden lg:block" : "")}>
        {tab === "campaigns" ? (
          <CampaignPanel
            projectId={props.projectId}
            projectTitle={props.projectTitle}
            initialCampaigns={props.initialCampaigns}
          />
        ) : selectedId && thread && thread.room.id === selectedId ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-ink-2 lg:hidden"
                aria-label="목록으로"
              >
                ←
              </button>
              <p className="min-w-0 flex-1 truncate text-[14px] font-bold">
                {selectedRow?.dancerName ?? "대화"}
              </p>
              {meta?.awaitingSince ? (
                <button
                  type="button"
                  onClick={() => void doResolve()}
                  className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold"
                >
                  처리 완료
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void doMarkUnanswered()}
                  className="rounded-md border border-border px-2.5 py-1 text-[12px] font-semibold text-ink-3"
                >
                  미답변으로 표시
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ChatRoomView
                key={selectedId}
                roomId={selectedId}
                role="staff"
                projectTitle={props.projectTitle}
                counterpartLabel={selectedRow?.dancerName ?? "지원자"}
                initialRoom={thread.room}
                initialMessages={thread.messages}
                initialResponses={thread.responses}
                onRoomMeta={setMeta}
              />
            </div>
          </div>
        ) : (
          <p className="hidden px-6 py-16 text-center text-[13px] text-ink-3 lg:block">
            왼쪽에서 대화를 선택하세요.
          </p>
        )}
      </section>

      {/* 우: 컨텍스트 + 내부 메모 */}
      <aside className="hidden min-h-0 overflow-y-auto border-l border-border px-4 py-4 lg:block">
        {selectedRow ? (
          <>
            <p className="text-[13px] font-bold">{selectedRow.dancerName}</p>
            <div className="mt-2 space-y-1 text-[12px] text-ink-3">
              {awaitingHours != null ? (
                <p>미답변 — {awaitingHours}시간 경과</p>
              ) : (
                <p>{meta?.resolved ? "처리 완료" : "대기 없음"}</p>
              )}
            </div>
            <Link
              href={`/projects/${props.projectId}/applicants`}
              className="mt-3 inline-block rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold text-ink-2"
            >
              지원자 콘솔에서 보기 →
            </Link>

            <div className="mt-6 border-t border-border pt-4">
              <p className="text-[12px] font-bold text-ink-2">내부 메모</p>
              <p className="mt-0.5 text-[11px] text-ink-4">
                지원자에게 보이지 않고, 미답변 상태를 바꾸지 않습니다.
              </p>
              <ul className="mt-2.5 space-y-2">
                {(thread?.notes ?? []).map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-2 text-[12px] leading-relaxed text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
                  >
                    <p className="whitespace-pre-wrap break-words">{n.body}</p>
                    <p className="mt-1 text-[10px] opacity-60">{formatListTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={2}
                placeholder="메모 남기기…"
                className="mt-2.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-[12px] outline-none focus:border-foreground"
              />
              <button
                type="button"
                onClick={() => void addNote()}
                disabled={!noteDraft.trim()}
                className="mt-1.5 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-bold text-background disabled:opacity-40"
              >
                메모 저장
              </button>
            </div>
          </>
        ) : (
          <p className="text-[12px] text-ink-3">대화를 선택하면 지원자 정보가 표시됩니다.</p>
        )}
      </aside>
    </div>
  );
}
