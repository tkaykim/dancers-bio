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
import {
  applyCastingBoardReviewAction,
  regenerateCastingReviewLinkAction,
} from "@/app/actions/casting-review";
import { markCastingCommentReadAction } from "@/app/actions/casting-comments";
import { AutoTextarea } from "@/components/casting/AutoTextarea";
import type {
  CandidateStatus,
  ClientDecision,
  ClientReviewSettings,
} from "@/lib/casting/review";

type Settings = {
  genderPriority?: "male" | "female" | null;
  requirePhoto?: boolean;
  minHeight?: number | null;
  note?: string | null; // 레거시 단일 공지
  notes?: string[]; // 공지 목록
  fields?: { height?: boolean; instagram?: boolean; career?: boolean; profile?: boolean };
  clientReview?: ClientReviewSettings;
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
  reviewUrl: string;
  isActive: boolean;
  expiresAt: string | null;
  reviewSubmittedAt: string | null;
  reviewSubmittedBy: string | null;
  decisionCounts: Record<ClientDecision, number>;
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
  // 클라이언트 대행 모드: 인스타·프로필 링크를 가려 중개 우회(직접 섭외)를 막는다.
  const [hideContact, setHideContact] = useState(
    board?.settings.clientReview?.enabled === true ||
      board?.settings.fields?.profile === false ||
      board?.settings.fields?.instagram === false,
  );
  const [clientReviewEnabled, setClientReviewEnabled] = useState(
    board?.settings.clientReview?.enabled === true,
  );
  const [candidateStatuses, setCandidateStatuses] = useState<CandidateStatus[]>(
    board?.settings.clientReview?.candidateStatuses?.length
      ? board.settings.clientReview.candidateStatuses
      : ["pending", "accepted", "confirmed"],
  );
  const [applySelectedAs, setApplySelectedAs] = useState<
    "accepted" | "confirmed"
  >(board?.settings.clientReview?.applySelectedAs === "confirmed" ? "confirmed" : "accepted");
  const [expiresAt, setExpiresAt] = useState(
    board?.expiresAt ? board.expiresAt.slice(0, 10) : "",
  );
  const [isActive, setIsActive] = useState(board?.isActive !== false);
  const [notes, setNotes] = useState<string[]>(
    board?.settings.notes && board.settings.notes.length
      ? board.settings.notes
      : board?.settings.note
        ? [board.settings.note]
        : [],
  );

  const shareUrl = board ? `https://deetz.kr/cast/${board.shareCode}` : "";
  const persistedReviewEnabled = board?.settings.clientReview?.enabled === true;
  const persistedApplySelectedAs =
    board?.settings.clientReview?.applySelectedAs === "confirmed"
      ? "confirmed"
      : "accepted";
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
    if (clientReviewEnabled && candidateStatuses.length === 0) {
      toast.error("검토 대상 상태를 한 개 이상 선택해 주세요.");
      return;
    }
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
        notes: notes.map((n) => n.trim()).filter(Boolean),
        note: null,
        sortBy: "height",
        fields: {
          ...(board.settings.fields ?? {}),
          instagram: !hideContact,
          profile: !hideContact,
        },
        clientReview: {
          enabled: clientReviewEnabled,
          candidateStatuses,
          applySelectedAs,
        },
      }),
    );
    fd.set("is_active", isActive ? "true" : "false");
    fd.set("expires_at", expiresAt);
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
      toast.success(`검토 대상 ${r.data?.count ?? 0}명과 동기화했습니다`);
      router.refresh();
    });
  }

  function toggleCandidateStatus(status: CandidateStatus) {
    setCandidateStatuses((current) =>
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    );
  }

  function applyClientSelection() {
    if (!board) return;
    const selected = board.decisionCounts.selected;
    if (selected < 1) {
      toast.error("클라이언트가 선택한 후보가 없습니다.");
      return;
    }
    const label = persistedApplySelectedAs === "confirmed" ? "확정" : "수락";
    if (!confirm(`클라이언트 선택 ${selected}명을 실제 ${label} 상태로 반영할까요?`)) {
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("board_id", board.id);
    start(async () => {
      const result = await applyCastingBoardReviewAction(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data?.updated ?? 0}명을 ${label} 처리했습니다.`);
      router.refresh();
    });
  }

  function regenerateReviewLink() {
    if (!board) return;
    if (!confirm("기존 클라이언트 검토 링크를 즉시 철회하고 새 링크를 만들까요?")) {
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("board_id", board.id);
    start(async () => {
      const result = await regenerateCastingReviewLinkAction(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("새 검토 링크를 발급했습니다.");
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

          {persistedReviewEnabled ? (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div>
                <p className="text-xs font-bold text-primary">클라이언트 검토 링크</p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  이 링크를 가진 사람만 대기자를 보고 선택 결과를 저장할 수 있습니다.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
                <code className="min-w-0 flex-1 truncate text-[10px] text-ink-2">
                  {board.reviewUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(board.reviewUrl);
                    toast.success("검토 링크를 복사했습니다.");
                  }}
                  className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
                >
                  복사
                </button>
                <a
                  href={board.reviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] text-ink-2"
                >
                  열기
                </a>
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                <ReviewCount label="선택" value={board.decisionCounts.selected} />
                <ReviewCount label="보류" value={board.decisionCounts.hold} />
                <ReviewCount label="제외" value={board.decisionCounts.excluded} />
                <ReviewCount label="미검토" value={board.decisionCounts.undecided} />
              </div>
              {board.reviewSubmittedAt ? (
                <p className="text-[10px] text-ink-3">
                  최근 저장 {new Date(board.reviewSubmittedAt).toLocaleString("ko-KR")}
                  {board.reviewSubmittedBy ? ` · ${board.reviewSubmittedBy}` : ""}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || board.decisionCounts.selected < 1}
                  onClick={applyClientSelection}
                  className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-45"
                >
                  선택자를 {persistedApplySelectedAs === "confirmed" ? "확정" : "수락"}으로 반영
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={regenerateReviewLink}
                  className="rounded-full border border-border px-3 py-1.5 text-[11px] text-ink-2 disabled:opacity-45"
                >
                  기존 링크 철회·재발급
                </button>
              </div>
              <p className="text-[10px] leading-relaxed text-ink-3">
                보류·제외는 자동 거절하지 않으며 지원자에게 메일도 발송하지 않습니다.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-xl border border-hairline-2 p-2.5 text-xs">
            <span className="text-ink-2">
              포함 인원 <b>{board.memberCount}</b>명{" "}
              <span className="text-ink-3">(설정 기준)</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={sync}
              className="rounded-full border border-border px-3 py-1 font-medium text-ink-2 hover:bg-secondary disabled:opacity-50"
            >
              검토 대상 동기화
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
            <label className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50/60 px-2.5 py-2 text-[11px] text-ink-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={hideContact}
                onChange={(e) => setHideContact(e.target.checked)}
              />
              <span>
                <b>직접 연락처 숨김</b> (대행 모드)
                <span className="mt-0.5 block text-ink-3">
                  인스타·프로필 링크를 가려 클라이언트의 직접 섭외(중개 우회)를 막습니다. 외부 발송 전 켜두는 것을 권장합니다.
                </span>
              </span>
            </label>
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3">
              <label className="flex items-start gap-2 text-[11px] text-ink-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={clientReviewEnabled}
                  onChange={(event) => {
                    setClientReviewEnabled(event.target.checked);
                    if (event.target.checked) setHideContact(true);
                  }}
                />
                <span>
                  <b>클라이언트 선택 기능</b>
                  <span className="mt-0.5 block text-ink-3">
                    로그인 없이 전용 링크에서 선택·보류·제외 결과를 저장합니다.
                  </span>
                </span>
              </label>
              {clientReviewEnabled ? (
                <>
                  {!persistedReviewEnabled ? (
                    <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
                      설정을 저장하면 전용 검토 링크가 활성화됩니다.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] text-ink-3">보드 포함:</span>
                    {(
                      [
                        ["pending", "대기자"],
                        ["accepted", "수락자"],
                        ["confirmed", "확정자"],
                      ] as const
                    ).map(([status, label]) => {
                      const active = candidateStatuses.includes(status);
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => toggleCandidateStatus(status)}
                          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${
                            active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-ink-3"
                          }`}
                        >
                          {active ? "✓ " : ""}{label}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-ink-2">
                    선택 결과 반영:
                    <select
                      value={applySelectedAs}
                      onChange={(event) =>
                        setApplySelectedAs(
                          event.target.value === "confirmed" ? "confirmed" : "accepted",
                        )
                      }
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      <option value="accepted">수락으로 반영</option>
                      <option value="confirmed">수락+확정으로 반영</option>
                    </select>
                  </label>
                </>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px] text-ink-2">
                  링크 만료일
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                  />
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-[11px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) => setIsActive(event.target.checked)}
                  />
                  링크 활성
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-ink-3">
                참고사항 / 공지 (클라이언트 화면 헤더 아래 표시 · 여러 개 등록 가능)
              </span>
              {notes.length === 0 ? (
                <p className="text-[11px] text-ink-3">등록된 공지가 없습니다.</p>
              ) : (
                notes.map((n, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AutoTextarea
                      value={n}
                      onChange={(e) =>
                        setNotes((prev) =>
                          prev.map((v, j) => (j === i ? e.target.value : v)),
                        )
                      }
                      placeholder={`공지 ${i + 1}`}
                      className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNotes((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="shrink-0 rounded-md border border-border px-2 py-1.5 text-[11px] text-ink-3 hover:bg-secondary"
                    >
                      삭제
                    </button>
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={() => setNotes((prev) => [...prev, ""])}
                className="self-start rounded-md border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:bg-secondary"
              >
                + 공지 추가
              </button>
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

function ReviewCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-2 text-ink-2">
      <span className="block text-ink-3">{label}</span>
      <b className="mt-0.5 block text-sm text-foreground">{value}</b>
    </div>
  );
}
