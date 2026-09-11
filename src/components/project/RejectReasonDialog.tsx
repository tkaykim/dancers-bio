"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";

const PRESETS = [
  "프로필·포트폴리오가 부실해요",
  "모집 조건과 맞지 않아요",
  "이번 프로젝트와는 방향이 달라요",
];

export function RejectReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // reason=null 이면 사유 없이 거절
  onConfirm: (reason: string | null) => void;
  busy: boolean;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (open) setText("");
  }, [open]);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title="거절 사유"
      footer={<div className="grid grid-cols-2 gap-2">
        <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>취소</Button>
        <Button className="min-h-11 bg-destructive text-white hover:bg-destructive/90" disabled={busy} onClick={() => onConfirm(text.trim() || null)}>거절 확정</Button>
      </div>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          거절 사유를 남기면 나중에 왜 거절했는지 확인할 수 있어요. (선택)
        </p>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setText(p)}
              className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                text === p
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-ink-2 hover:bg-secondary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="직접 입력하거나 위 사유를 선택하세요…"
          className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base placeholder:text-ink-3"
        />

        <p className="text-xs leading-relaxed text-ink-3">사유를 비워 두면 사유 없이 거절합니다.</p>
      </div>
    </BottomSheet>
  );
}
