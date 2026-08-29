"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  markThreadReadAction,
  muteThreadAction,
  sendDancerMessageAction,
  submitActionResponseAction,
} from "@/app/actions/messages";
import { sendStaffMessageAction } from "@/app/actions/staff-messages";
import { formatMessageTime, newClientMessageId, usePolling } from "./poll";

// 대화방 본체 — 댄서(member)·운영자(staff) 공용.
// 읽음 표시는 워터마크(seq) 대비 계산: member 는 "운영팀 읽음", staff 는 상대 "읽음".

export type ThreadMessage = {
  id: string;
  room_seq: number;
  sender_role: "team" | "member" | "system";
  kind: "text" | "notice" | "action_request" | "system";
  body: string;
  action: {
    choices: string[];
    deadline?: string | null;
    detail_required_for?: string[];
  } | null;
  deleted_at: string | null;
  created_at: string;
};

export type ThreadResponse = {
  message_id: string;
  dancer_id: string;
  choice: string;
  detail: string | null;
};

export type ThreadRoomMeta = {
  id: string;
  lastSeq: number;
  staffLastReadSeq: number;
  memberReadSeq: number | null;
  closed: boolean;
  resolved: boolean;
  awaitingSince: string | null;
};

type PendingMessage = {
  clientMessageId: string;
  body: string;
  createdAt: string;
  failed?: boolean;
};

export function ChatRoomView(props: {
  roomId: string;
  role: "member" | "staff";
  myDancerId?: string | null;
  projectTitle: string;
  counterpartLabel: string; // member 화면: "운영팀" / staff 화면: 댄서 이름
  initialRoom: ThreadRoomMeta;
  initialMessages: ThreadMessage[];
  initialResponses: ThreadResponse[];
  mutedUntil?: string | null;
  /** staff 전용: 방 메타 변화(미답변 등)를 부모(콘솔)에 알린다. */
  onRoomMeta?: (meta: ThreadRoomMeta) => void;
}) {
  const { roomId, role } = props;
  const [room, setRoom] = useState<ThreadRoomMeta>(props.initialRoom);
  const [messages, setMessages] = useState<ThreadMessage[]>(props.initialMessages);
  const [responses, setResponses] = useState<ThreadResponse[]>(props.initialResponses);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(
    () => !!props.mutedUntil && new Date(props.mutedUntil).getTime() > Date.now(),
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSeqRef = useRef<number>(props.initialRoom.lastSeq);
  const readSeqRef = useRef<number>(0);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const markRead = useCallback(
    async (upToSeq: number) => {
      if (upToSeq <= readSeqRef.current) return;
      readSeqRef.current = upToSeq;
      await markThreadReadAction({ roomId, upToSeq });
    },
    [roomId],
  );

  // 진입 시 읽음 처리.
  useEffect(() => {
    if (document.visibilityState === "visible") void markRead(props.initialRoom.lastSeq);
  }, [markRead, props.initialRoom.lastSeq]);

  const fetchNew = useCallback(async () => {
    const res = await fetch(
      `/api/messages/rooms/${roomId}?after_seq=${lastSeqRef.current}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error("poll failed");
    const data = (await res.json()) as {
      room?: ThreadRoomMeta;
      messages?: ThreadMessage[];
      responses?: ThreadResponse[];
    };
    if (data.room) {
      setRoom(data.room);
      props.onRoomMeta?.(data.room);
    }
    if (data.messages && data.messages.length > 0) {
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        const fresh = data.messages!.filter((m) => !known.has(m.id));
        if (fresh.length === 0) return prev;
        return [...prev, ...fresh].sort((a, b) => a.room_seq - b.room_seq);
      });
      const maxSeq = Math.max(...data.messages.map((m) => m.room_seq));
      lastSeqRef.current = Math.max(lastSeqRef.current, maxSeq);
      // 내가 보낸 pending 이 확정 도착하면 지운다.
      setPending((prev) => prev.filter(() => false));
      if (document.visibilityState === "visible") void markRead(lastSeqRef.current);
      setTimeout(scrollToBottom, 30);
    }
    if (data.responses && data.responses.length > 0) {
      setResponses((prev) => {
        const map = new Map(prev.map((r) => [`${r.message_id}:${r.dancer_id}`, r]));
        for (const r of data.responses!) map.set(`${r.message_id}:${r.dancer_id}`, r);
        return [...map.values()];
      });
    }
  }, [roomId, markRead, scrollToBottom, props]);

  usePolling(fetchNew, 7_000);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    const clientMessageId = newClientMessageId();
    setSending(true);
    setDraft("");
    setPending((prev) => [
      ...prev,
      { clientMessageId, body, createdAt: new Date().toISOString() },
    ]);
    setTimeout(scrollToBottom, 30);

    const action = role === "staff" ? sendStaffMessageAction : sendDancerMessageAction;
    const result = await action({ roomId, body, clientMessageId });
    setSending(false);
    // 전송 후에도 포커스는 입력창에 유지한다(접근성 관례).
    inputRef.current?.focus();

    if (!result.ok) {
      setPending((prev) => prev.filter((p) => p.clientMessageId !== clientMessageId));
      setDraft(body);
      toast.error(result.error);
      return;
    }
    const sent = result.data!;
    lastSeqRef.current = Math.max(lastSeqRef.current, sent.roomSeq);
    readSeqRef.current = Math.max(readSeqRef.current, sent.roomSeq);
    setPending((prev) => prev.filter((p) => p.clientMessageId !== clientMessageId));
    setMessages((prev) => {
      if (prev.some((m) => m.id === sent.id)) return prev;
      return [
        ...prev,
        {
          id: sent.id,
          room_seq: sent.roomSeq,
          sender_role: (role === "staff" ? "team" : "member") as ThreadMessage["sender_role"],
          kind: "text" as ThreadMessage["kind"],
          body,
          action: null,
          deleted_at: null,
          created_at: sent.createdAt,
        },
      ].sort((a, b) => a.room_seq - b.room_seq);
    });
    setRoom((prev) => ({ ...prev, lastSeq: Math.max(prev.lastSeq, sent.roomSeq) }));
    setTimeout(scrollToBottom, 30);
  }, [draft, sending, role, roomId, scrollToBottom]);

  const toggleMute = useCallback(async () => {
    const next = !muted;
    setMuted(next);
    const result = await muteThreadAction({ roomId, hours: next ? -1 : null });
    if (!result.ok) {
      setMuted(!next);
      toast.error(result.error);
    }
  }, [muted, roomId]);

  const respond = useCallback(
    async (messageId: string, choice: string, detail?: string) => {
      const result = await submitActionResponseAction({ messageId, choice, detail });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      if (props.myDancerId) {
        setResponses((prev) => {
          const rest = prev.filter(
            (r) => !(r.message_id === messageId && r.dancer_id === props.myDancerId),
          );
          return [
            ...rest,
            { message_id: messageId, dancer_id: props.myDancerId!, choice, detail: detail ?? null },
          ];
        });
      }
      toast.success("응답이 저장되었습니다.");
      return true;
    },
    [props.myDancerId],
  );

  const notices = messages.filter((m) => m.kind === "notice" && !m.deleted_at);
  const latestNotice = notices.length > 0 ? notices[notices.length - 1] : null;
  const mineRole = role === "staff" ? "team" : "member";
  const lastMineSeq = [...messages, ...[]]
    .filter((m) => m.sender_role === mineRole)
    .reduce((max, m) => Math.max(max, m.room_seq), 0);
  const counterReadSeq = role === "member" ? room.staffLastReadSeq : (room.memberReadSeq ?? 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {role === "member" ? (
        <div className="border-b border-border bg-secondary/50 px-4 py-2 text-[12px] leading-relaxed text-ink-3">
          운영팀 답변은 영업일 기준 24시간 안에 드려요. (운영시간 평일 10–19시)
        </div>
      ) : null}
      {latestNotice ? (
        <div className="border-b border-border px-4 py-2 text-[12px] text-ink-2">
          <span className="mr-1.5 font-bold">고정</span>
          <span className="text-ink-3">
            {latestNotice.body.slice(0, 60)}
            {latestNotice.body.length > 60 ? "…" : ""}
          </span>
        </div>
      ) : null}

      <div
        ref={listRef}
        role="log"
        aria-label="대화 내용"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && pending.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-ink-3">
            {role === "member"
              ? "운영팀에 궁금한 점을 남겨보세요."
              : "지원자에게 첫 메시지를 보내보세요."}
          </p>
        ) : null}

        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            mine={m.sender_role === mineRole}
            role={role}
            myDancerId={props.myDancerId ?? null}
            responses={responses.filter((r) => r.message_id === m.id)}
            readByCounterpart={m.room_seq <= counterReadSeq}
            isLastMine={m.room_seq === lastMineSeq}
            counterpartLabel={props.counterpartLabel}
            onRespond={respond}
          />
        ))}
        {pending.map((p) => (
          <div key={p.clientMessageId} className="mb-2 flex justify-end">
            <div className="max-w-[82%] rounded-lg bg-foreground/70 px-3 py-2 text-[14px] leading-relaxed text-background">
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
              <p className="mt-1 text-right text-[10px] opacity-70">전송 중…</p>
            </div>
          </div>
        ))}
      </div>

      {room.closed && role === "member" ? (
        <div className="border-t border-border px-4 py-4 text-center text-[13px] text-ink-3">
          이 대화는 종료되었습니다. 문의는 contact@deetz.kr 로 보내주세요.
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="메시지 입력…"
              aria-label="메시지 입력"
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2.5 text-[14px] leading-relaxed outline-none focus:border-foreground"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || draft.trim().length === 0}
              className="h-[42px] shrink-0 rounded-md bg-foreground px-4 text-sm font-bold text-background disabled:opacity-40"
            >
              보내기
            </button>
          </div>
          {role === "member" ? (
            <div className="mt-1.5 flex justify-end">
              <button
                type="button"
                onClick={() => void toggleMute()}
                className="text-[11px] text-ink-4 underline-offset-2 hover:underline"
              >
                {muted ? "알림 켜기" : "알림 끄기"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MessageRow(props: {
  message: ThreadMessage;
  mine: boolean;
  role: "member" | "staff";
  myDancerId: string | null;
  responses: ThreadResponse[];
  readByCounterpart: boolean;
  isLastMine: boolean;
  counterpartLabel: string;
  onRespond: (messageId: string, choice: string, detail?: string) => Promise<boolean>;
}) {
  const { message: m, mine } = props;
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [detail, setDetail] = useState("");

  if (m.kind === "system") {
    return (
      // 시간 문자열은 서버(UTC)·클라이언트(KST)가 달라 hydration 경고가 난다 — 클라 값이 정답.
      <p className="my-3 text-center text-[11px] text-ink-4" suppressHydrationWarning>
        {m.body} · {formatMessageTime(m.created_at)}
      </p>
    );
  }

  if (m.deleted_at) {
    return (
      <div className={`mb-2 flex ${mine ? "justify-end" : "justify-start"}`}>
        <p className="rounded-lg bg-secondary px-3 py-2 text-[13px] italic text-ink-4">
          삭제된 메시지입니다
        </p>
      </div>
    );
  }

  const myResponse = props.myDancerId
    ? props.responses.find((r) => r.dancer_id === props.myDancerId) ?? null
    : props.responses[0] ?? null;
  const deadlinePassed =
    // eslint-disable-next-line react-hooks/purity -- 기한 경과 표시는 현재 시각 의존(리렌더마다 갱신되는 게 의도)
    !!m.action?.deadline && new Date(m.action.deadline).getTime() < Date.now();

  const bubbleBase = "max-w-[82%] rounded-lg px-3 py-2 text-[14px] leading-relaxed";
  const bubbleTone = mine
    ? "bg-foreground text-background"
    : "border border-border bg-card text-foreground";

  return (
    <div className={`mb-2 flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {!mine ? (
        <span className="mb-0.5 px-1 text-[11px] text-ink-3">{props.counterpartLabel}</span>
      ) : null}
      <div className={`${bubbleBase} ${bubbleTone}`}>
        {m.kind === "notice" ? (
          <p className="mb-1 text-[11px] font-bold opacity-70">공지</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{linkify(m.body)}</p>

        {m.kind === "action_request" && m.action ? (
          <div className="mt-2.5 border-t border-current/15 pt-2.5">
            <p className="text-[12px] font-bold">응답 요청</p>
            {m.action.deadline ? (
              <p className="mt-0.5 text-[11px] opacity-70">
                기한 {new Date(m.action.deadline).toLocaleString("ko-KR")}
              </p>
            ) : null}
            {props.role === "member" ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.action.choices.map((choice) => {
                  const selected = myResponse?.choice === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      disabled={deadlinePassed}
                      onClick={() => {
                        const needsDetail = (m.action?.detail_required_for ?? []).includes(choice);
                        if (needsDetail) {
                          setDetailFor(choice);
                          setDetail(myResponse?.detail ?? "");
                        } else {
                          setDetailFor(null);
                          void props.onRespond(m.id, choice);
                        }
                      }}
                      className={
                        "rounded-md border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40 " +
                        (selected
                          ? "border-transparent bg-background text-foreground"
                          : "border-current/30 hover:bg-current/10")
                      }
                    >
                      {choice}
                      {selected ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-1.5 text-[12px] opacity-80">
                {myResponse ? `응답: ${myResponse.choice}` : "아직 응답 없음"}
                {myResponse?.detail ? ` — ${myResponse.detail}` : ""}
              </p>
            )}
            {deadlinePassed && props.role === "member" ? (
              <p className="mt-1.5 text-[11px] opacity-70">
                기한이 지났습니다. 변경이 필요하면 메시지로 알려주세요.
              </p>
            ) : null}
            {detailFor ? (
              <div className="mt-2">
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={2}
                  placeholder="상세 내용을 적어주세요 (예: 9/9만 참여 가능)"
                  className="w-full rounded-md border border-current/30 bg-transparent px-2.5 py-2 text-[13px] outline-none"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!detail.trim()) return;
                      const ok = await props.onRespond(m.id, detailFor, detail.trim());
                      if (ok) setDetailFor(null);
                    }}
                    className="rounded-md bg-background px-3 py-1 text-[12px] font-bold text-foreground"
                  >
                    응답 저장
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailFor(null)}
                    className="px-2 py-1 text-[12px] opacity-70"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : null}
            {props.role === "member" && myResponse && !detailFor ? (
              <p className="mt-1.5 text-[11px] opacity-70">
                {deadlinePassed ? "" : "기한 전에는 선택을 변경할 수 있어요."}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <span className="mt-0.5 px-1 text-[10px] text-ink-4" suppressHydrationWarning>
        {formatMessageTime(m.created_at)}
        {mine && props.isLastMine && props.readByCounterpart
          ? props.role === "member"
            ? " · 운영팀 읽음"
            : " · 읽음"
          : ""}
      </span>
    </div>
  );
}

// 안전한 링크 렌더 — 정규식으로 잡은 http/https URL 만 앵커로 바꾼다.
// 본문은 항상 React 텍스트 노드라 XSS 여지가 없다(dangerouslySetInnerHTML 미사용).
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

function linkify(body: string): React.ReactNode {
  const parts = body.split(URL_RE);
  if (parts.length === 1) return body;
  return parts.map((part, i) => {
    if (i % 2 === 1 && /^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="underline underline-offset-2"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
