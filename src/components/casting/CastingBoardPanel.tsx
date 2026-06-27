"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clapperboard } from "lucide-react";
import {
  createCastingBoardAction,
  updateCastingBoardAction,
  syncCastingBoardMembersAction,
  sendCastingBoardEmailAction,
} from "@/app/actions/project-casting";
import { markCastingCommentReadAction } from "@/app/actions/casting-comments";

type Settings = {
  genderPriority?: "male" | "female" | null;
  requirePhoto?: boolean;
  minHeight?: number | null;
  note?: string | null;
};

export type CastingBoardSend = {
  email: string;
  name: string | null;
  sentAt: string;
};

export type CastingBoardComment = {
  id: string;
  authorName: string | null;
  body: string;
  isRead: boolean;
  createdAt: string;
};

export type CastingBoardInfo = {
  id: string;
  shareCode: string;
  settings: Settings;
  memberCount: number;
  sends: CastingBoardSend[];
  comments: CastingBoardComment[];
};

export function CastingBoardPanel({
  projectId,
  board,
}: {
  projectId: string;
  board: CastingBoardInfo | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [toEmail, setToEmail] = useState("");
  const [toName, setToName] = useState("");
  const [msg, setMsg] = useState("");
  const [gp, setGp] = useState<Settings["genderPriority"]>(
    board?.settings.genderPriority ?? "male",
  );
  const [requirePhoto, setRequirePhoto] = useState(
    board?.settings.requirePhoto !== false,
  );
  const [minHeight, setMinHeight] = useState<string>(
    board?.settings.minHeight != null ? String(board.settings.minHeight) : "",
  );
  const [note, setNote] = useState<string>(board?.settings.note ?? "");

  const shareUrl = board ? `https://deetz.kr/cast/${board.shareCode}` : "";
  const unreadCount = board?.comments.filter((c) => !c.isRead).length ?? 0;

  function create() {
    const fd = new FormData();
    fd.set("project_id", projectId);
    start(async () => {
      const r = await createCastingBoardAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("캐스팅 보드를 만들었습니다");
      router.refresh();
    });
  }

  function saveSettings() {
    if (!board) return;
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("board_id", board.id);
    fd.set(
      "settings",
      JSON.stringify({
        ...board.settings,
        genderPriority: gp ?? null,
        requirePhoto,
        minHeight: minHeight.trim() ? Number(minHeight) : null,
        note: note.trim() || null,
        sortBy: "height",
      }),
    );
    start(async () => {
      const r = await updateCastingBoardAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("설정을 저장했습니다");
      router.refresh();
    });
  }

  function sync() {
    if (!board) return;
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("board_id", board.id);
    start(async () => {
      const r = await syncCastingBoardMembersAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`합격자 ${r.data?.count ?? 0}명과 동기화했습니다`);
      router.refresh();
    });
  }

  function toggleRead(commentId: string, isRead: boolean) {
    if (!board) return;
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("comment_id", commentId);
    fd.set("is_read", String(isRead));
    start(async () => {
      const r = await markCastingCommentReadAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function send() {
    if (!board) return;
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(toEmail.trim())) {
      toast.error("받는 사람 이메일을 정확히 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("board_id", board.id);
    fd.set("recipient_email", toEmail.trim());
    if (toName.trim()) fd.set("recipient_name", toName.trim());
    if (msg.trim()) fd.set("message", msg.trim());
    start(async () => {
      const r = await sendCastingBoardEmailAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.data?.sentTo}로 발송했습니다`);
      setToEmail("");
      setToName("");
      setMsg("");
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-ink-3">
          <Clapperboard className="size-3.5" />
          클라이언트 캐스팅 보드
        </p>
        <p className="mt-1 text-xs text-ink-3">
          합격자를 사진 카드로 정리해 클라이언트에게 링크로 공유합니다. (전화번호 제외)
        </p>
      </div>

      {!board ? (
        <button
          type="button"
          disabled={busy}
          onClick={create}
          className="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          캐스팅 보드 만들기
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-hairline-2 bg-secondary/30 p-2.5">
            <code className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
              {shareUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(shareUrl);
                toast.success("공유 링크 복사됨");
              }}
              className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
            >
              링크 복사
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] text-ink-2"
            >
              열기
            </a>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-hairline-2 p-2.5 text-xs">
            <span className="text-ink-2">
              포함 인원 <b>{board.memberCount}</b>명{" "}
              <span className="text-ink-3">(사진 있는 인원만 노출)</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={sync}
              className="rounded-full border border-border px-3 py-1 font-medium text-ink-2 hover:bg-secondary disabled:opacity-50"
            >
              합격자와 동기화
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-hairline-2 p-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-3">정렬 우선:</span>
              {([
                ["male", "남자 먼저"],
                ["female", "여자 먼저"],
                [null, "없음"],
              ] as const).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setGp(v)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                    gp === v
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-ink-3 hover:bg-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-ink-2">
              <input
                type="checkbox"
                checked={requirePhoto}
                onChange={(e) => setRequirePhoto(e.target.checked)}
              />
              사진 없는 인원 제외
            </label>
            <label className="flex items-center gap-2 text-[11px] text-ink-2">
              최소 키(cm):
              <input
                type="number"
                value={minHeight}
                onChange={(e) => setMinHeight(e.target.value)}
                placeholder="제한 없음"
                className="h-7 w-24 rounded-md border border-border bg-background px-2 text-xs"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-3">
                참고사항 / 공지 (클라이언트 화면 헤더 아래 표시)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="예) 남자 비율 요청 주셔서 100명 초과 모집했습니다. 바라클라바 착용 시 키 큰 여성도 덩치·팔 길이가 잘 나올 여지가 있어 함께 전달드립니다."
                className="resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={saveSettings}
              className="h-9 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              설정 저장
            </button>
          </div>

          {/* 클라이언트 코멘트 */}
          <div className="flex flex-col gap-2 rounded-xl border border-hairline-2 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-2">
              클라이언트 코멘트
              {unreadCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  새 {unreadCount}
                </span>
              ) : null}
            </p>
            {board.comments.length === 0 ? (
              <p className="text-[11px] text-ink-3">아직 받은 코멘트가 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {board.comments.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-lg border p-2.5 text-[12px] ${
                      c.isRead
                        ? "border-hairline-2 bg-secondary/30"
                        : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink-2">
                        {c.authorName || "익명"}
                      </span>
                      <span className="shrink-0 text-[10px] text-ink-3">
                        {new Date(c.createdAt).toLocaleString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-ink-2">{c.body}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => toggleRead(c.id, !c.isRead)}
                      className="mt-1.5 text-[10px] font-medium text-ink-3 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {c.isRead ? "안읽음으로 표시" : "읽음으로 표시"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 클라이언트에게 메일 발송 */}
          <div className="flex flex-col gap-2 rounded-xl border border-hairline-2 p-3">
            <p className="text-[11px] font-semibold text-ink-2">클라이언트에게 발송</p>
            <p className="text-[11px] text-ink-3">
              발송 전 위 “열기”로 내용을 검토하세요. deetz 메일로 보드 링크가 전달됩니다.
            </p>
            <input
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="받는 사람 이메일"
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
            />
            <input
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="받는 사람 이름 (선택)"
              className="h-9 rounded-md border border-border bg-background px-2 text-xs"
            />
            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={2}
              placeholder="인사말 (선택) — 비우면 기본 문구"
              className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={busy}
              onClick={send}
              className="h-9 rounded-lg bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              메일로 보내기
            </button>

            {board.sends.length > 0 ? (
              <div className="mt-1 border-t border-hairline-2 pt-2">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-ink-3">
                  발송 이력 ({board.sends.length})
                </p>
                <ul className="flex flex-col gap-0.5">
                  {board.sends.slice(0, 5).map((s, i) => (
                    <li key={i} className="flex justify-between gap-2 text-[11px] text-ink-2">
                      <span className="truncate">
                        {s.name ? `${s.name} · ` : ""}
                        {s.email}
                      </span>
                      <span className="shrink-0 text-ink-3">
                        {new Date(s.sentAt).toLocaleDateString("ko-KR", {
                          month: "numeric",
                          day: "numeric",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
