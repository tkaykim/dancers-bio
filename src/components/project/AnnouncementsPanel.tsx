"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, Megaphone } from "lucide-react";
import { toast } from "sonner";
import {
  createAnnouncementAction,
  updateAnnouncementAction,
  deleteAnnouncementAction,
} from "@/app/actions/project-announcements";

export type AnnouncementRow = {
  id: string;
  title: string | null;
  body: string;
  audiences: string[];
  pinned: boolean;
  created_at: string;
};

const AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "public", label: "전체에게" },
  { value: "pending", label: "대기자" },
  { value: "accepted", label: "수락자" },
  { value: "rejected", label: "탈락자" },
];
const AUDIENCE_LABEL: Record<string, string> = Object.fromEntries(
  AUDIENCE_OPTIONS.map((o) => [o.value, o.label]),
);

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(d);
}

export function AnnouncementsPanel({
  projectId,
  shortCode,
  announcements,
}: {
  projectId: string;
  shortCode: string;
  announcements: AnnouncementRow[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audiences, setAudiences] = useState<string[]>(["accepted"]);
  const [pinned, setPinned] = useState(false);

  const shareUrl = `https://deetz.kr/n/${shortCode}`;

  function reset() {
    setEditId(null);
    setTitle("");
    setBody("");
    setAudiences(["accepted"]);
    setPinned(false);
    setOpen(false);
  }

  function toggleAudience(value: string) {
    setAudiences((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value],
    );
  }

  function startEdit(a: AnnouncementRow) {
    setEditId(a.id);
    setTitle(a.title ?? "");
    setBody(a.body);
    setAudiences(a.audiences.length ? a.audiences : ["accepted"]);
    setPinned(a.pinned);
    setOpen(true);
  }

  function submit() {
    if (!body.trim()) {
      toast.error("공지 내용을 입력해 주세요.");
      return;
    }
    if (audiences.length === 0) {
      toast.error("열람 대상을 한 개 이상 선택해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("project_id", projectId);
    if (editId) fd.set("announcement_id", editId);
    if (title.trim()) fd.set("title", title.trim());
    fd.set("body", body.trim());
    audiences.forEach((a) => fd.append("audiences", a));
    fd.set("pinned", pinned ? "true" : "false");
    startTransition(async () => {
      const r = editId
        ? await updateAnnouncementAction(fd)
        : await createAnnouncementAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editId ? "공지를 수정했습니다" : "공지를 등록했습니다");
      reset();
      router.refresh();
    });
  }

  function togglePin(a: AnnouncementRow) {
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("announcement_id", a.id);
    fd.set("body", a.body);
    if (a.title) fd.set("title", a.title);
    a.audiences.forEach((x) => fd.append("audiences", x));
    fd.set("pinned", a.pinned ? "false" : "true");
    startTransition(async () => {
      const r = await updateAnnouncementAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("이 공지를 삭제할까요?")) return;
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("announcement_id", id);
    startTransition(async () => {
      const r = await deleteAnnouncementAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-ink-3">
            <Megaphone className="size-3.5" />
            공지사항 ({announcements.length})
          </p>
          <p className="mt-1 text-xs text-ink-3">
            열람 대상을 골라 공지하면, 대상에 맞는 지원자만 봅니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (open ? reset() : setOpen(true))}
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          {open ? "닫기" : "+ 공지 작성"}
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-hairline-2 bg-secondary/30 p-2.5">
        <code className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
          {shareUrl}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(shareUrl);
            toast.success("공지 링크 복사됨 (전체에게 공지만 노출)");
          }}
          className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
        >
          링크 복사
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-2 rounded-xl border border-hairline-2 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="공지 내용"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-ink-3">열람 대상:</span>
            {AUDIENCE_OPTIONS.map((o) => {
              const on = audiences.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggleAudience(o.value)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                    on
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-ink-3 hover:bg-secondary"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {o.label}
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-ink-2">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            상단 고정
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {editId ? "공지 수정" : "공지 등록"}
          </button>
        </div>
      ) : null}

      {announcements.length === 0 ? (
        <p className="text-xs text-ink-3">아직 등록된 공지가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {announcements.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-2 rounded-xl border border-border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <div className="flex items-center gap-1.5">
                    {a.pinned ? (
                      <Pin className="size-3.5 shrink-0 text-primary" />
                    ) : null}
                    {a.title ? (
                      <p className="text-sm font-semibold">{a.title}</p>
                    ) : null}
                    <span className="text-[11px] text-ink-3">
                      {formatWhen(a.created_at)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-ink-2">
                    {a.body}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {a.audiences.map((x) => (
                  <span
                    key={x}
                    className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-ink-2"
                  >
                    {AUDIENCE_LABEL[x] ?? x}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => togglePin(a)}
                  className="rounded-full border border-border px-3 py-1 text-ink-2 hover:bg-secondary disabled:opacity-50"
                >
                  {a.pinned ? "고정 해제" : "상단 고정"}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(a)}
                  className="rounded-full border border-border px-3 py-1 text-ink-2 hover:bg-secondary"
                >
                  수정
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(a.id)}
                  className="rounded-full border border-border px-3 py-1 text-ink-3 hover:text-destructive disabled:opacity-50"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
