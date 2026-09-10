"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { openDancerThreadAction } from "@/app/actions/staff-messages";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ChatRoomView, type ThreadMessage, type ThreadResponse, type ThreadRoomMeta } from "./ChatRoomView";
import { useMessageViewport } from "./MessageViewport";

type Project = { id: string; title: string };
type Thread = { room: ThreadRoomMeta; messages: ThreadMessage[]; responses: ThreadResponse[] };

export function MessageDancerButton({ dancerId, dancerName, projectId, projects = [] }: {
  dancerId: string; dancerName: string; projectId?: string; projects?: Project[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(projectId ?? "");
  const [thread, setThread] = useState<Thread | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const viewport = useMessageViewport();
  if (process.env.NEXT_PUBLIC_MESSAGING_ENABLED !== "true") return null;

  async function load(id: string) {
    const version = ++request.current;
    setSelected(id);
    setThread(null);
    setBusy(true);
    setError(null);
    try {
      const result = await openDancerThreadAction({ projectId: id, dancerId });
      if (!result.ok) throw new Error(result.error);
      if (!result.data) throw new Error("대화를 열지 못했습니다.");
      const response = await fetch(`/api/messages/rooms/${result.data.roomId}?after_seq=0`, { cache: "no-store" });
      if (!response.ok) throw new Error("대화를 불러오지 못했습니다. 다시 시도해 주세요.");
      const data = await response.json() as Thread;
      if (!data.room) throw new Error("대화를 불러오지 못했습니다.");
      if (version === request.current) setThread(data);
    } catch (cause) {
      if (version === request.current) setError(cause instanceof Error ? cause.message : "연결을 확인하고 다시 시도해 주세요.");
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  return <>
    <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-foreground px-5 text-sm font-semibold text-background"
      onClick={() => { setOpen(true); const id = projectId ?? (projects.length === 1 ? projects[0].id : ""); if (id) void load(id); }}>
      <MessageCircle size={16} aria-hidden />메시지 보내기
    </button>
    <BottomSheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) { request.current++; setSelected(projectId ?? ""); setThread(null); setBusy(false); setError(null); } }}
      title={`${dancerName} · 메시지`} className="h-[85dvh] max-h-[90dvh] sm:w-[600px]"
      style={viewport?.mobile ? { height: viewport.height * .9, maxHeight: viewport.height * .9, bottom: viewport.bottom } : undefined}
      contentClassName="flex flex-col overflow-hidden p-0">
      {!projectId && !thread ? <div className="shrink-0 border-b border-border p-4">
        <label htmlFor={`message-project-${dancerId}`} className="mb-2 block text-sm font-semibold">어떤 프로젝트로 연락할까요?</label>
        <select id={`message-project-${dancerId}`} value={selected} disabled={busy}
          onChange={(e) => { if (e.target.value) void load(e.target.value); }}
          className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base">
          <option value="">프로젝트 선택</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        <p className="mt-2 text-xs leading-relaxed text-ink-3">선택한 프로젝트 운영팀 명의로 대화합니다.</p>
      </div> : null}
      {busy ? <p role="status" className="p-6 text-center text-sm text-ink-3">대화를 불러오는 중…</p> : null}
      {error ? <div role="alert" className="p-4 text-sm"><p>{error}</p><button type="button" onClick={() => void load(selected)} className="mt-3 min-h-11 rounded-lg border px-4">다시 시도</button></div> : null}
      {thread ? <>
        <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-3">{projects.find((p) => p.id === selected)?.title ?? "프로젝트 운영팀"}</p>
          <Link href={`/projects/${selected}/messages?room=${thread.room.id}`} className="shrink-0 whitespace-nowrap py-2 text-xs underline">메시지함</Link>
        </div>
        <div className="min-h-0 flex-1"><ChatRoomView key={thread.room.id} roomId={thread.room.id} role="staff"
          projectTitle={projects.find((p) => p.id === selected)?.title ?? "프로젝트"} counterpartLabel={dancerName}
          initialRoom={thread.room} initialMessages={thread.messages} initialResponses={thread.responses} /></div>
      </> : null}
    </BottomSheet>
  </>;
}
