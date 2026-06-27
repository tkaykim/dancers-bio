"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateCastingBoardNotesAction } from "@/app/actions/project-casting";

// 공개 보드(/cast)에서 관리자/매니저에게만 보이는 인라인 공지 편집기.
export function BoardNotesEditor({
  boardId,
  initialNotes,
}: {
  boardId: string;
  initialNotes: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState<string[]>(initialNotes);
  const [busy, start] = useTransition();

  function save() {
    const fd = new FormData();
    fd.set("board_id", boardId);
    fd.set("notes", JSON.stringify(notes.map((n) => n.trim()).filter(Boolean)));
    start(async () => {
      const r = await updateCastingBoardNotesAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("공지를 저장했습니다");
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setNotes(initialNotes);
    setEditing(false);
  }

  // 보기 모드: 관리자에게는 우상단에 "공지 편집" 버튼이 붙은 참고사항 카드.
  if (!editing) {
    return (
      <div className="relative mt-4 rounded-2xl border border-dashed border-primary/40 bg-secondary/40 px-4 py-3.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
            참고사항{" "}
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-normal text-primary">
              관리자
            </span>
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:bg-secondary"
          >
            <Pencil className="size-3" />
            공지 편집
          </button>
        </div>
        {initialNotes.length === 0 ? (
          <p className="text-sm text-ink-3">
            등록된 공지가 없습니다. “공지 편집”으로 추가하세요. (이 영역은 관리자에게만 보입니다)
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {initialNotes.map((n, i) => (
              <p
                key={i}
                className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border [&:not(:first-child)]:pt-3"
              >
                {n}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 편집 모드.
  return (
    <div className="mt-4 rounded-2xl border border-primary/50 bg-secondary/40 px-4 py-3.5">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-3">
        공지 편집 (여러 개 등록 가능)
      </p>
      <div className="flex flex-col gap-2">
        {notes.length === 0 ? (
          <p className="text-[12px] text-ink-3">아래 “공지 추가”로 시작하세요.</p>
        ) : (
          notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <textarea
                value={n}
                onChange={(e) =>
                  setNotes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                rows={2}
                placeholder={`공지 ${i + 1}`}
                className="flex-1 resize-none rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={() => setNotes((prev) => prev.filter((_, j) => j !== i))}
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
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="h-9 rounded-lg border border-border px-4 text-xs font-medium text-ink-2 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}
