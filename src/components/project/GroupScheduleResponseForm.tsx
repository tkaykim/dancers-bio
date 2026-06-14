"use client";

import { useState, useTransition } from "react";
import { submitGroupScheduleResponseAuthedAction } from "@/app/actions/project-schedules";

type Status = "available" | "partial" | "unavailable";
type Slot = { start: string; end: string; kind: "available" | "unavailable" };

export function GroupScheduleResponseForm({
  token,
  responderName,
}: {
  token: string;
  responderName?: string | null;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [slots, setSlots] = useState<Slot[]>([
    { start: "", end: "", kind: "available" },
  ]);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-base font-bold">응답 완료! 🙆</p>
        <p className="mt-1 text-sm text-ink-2">
          알려주셔서 감사합니다. 이 창은 닫으셔도 됩니다.
        </p>
      </div>
    );
  }

  const OPTIONS: { v: Status; label: string; desc: string }[] = [
    { v: "available", label: "가능", desc: "전체 가능" },
    { v: "partial", label: "시간 일부", desc: "특정 시간만" },
    { v: "unavailable", label: "불가", desc: "참석 어려움" },
  ];

  function submit() {
    if (!status) {
      setError("참석 가능 여부를 선택해 주세요.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("status", status);
    if (status === "partial")
      fd.set("time_slots", JSON.stringify(slots.filter((s) => s.start && s.end)));
    if (note.trim()) fd.set("note", note.trim());
    startTransition(async () => {
      const r = await submitGroupScheduleResponseAuthedAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {responderName ? (
        <p className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
          <span className="font-semibold">{responderName}</span>님으로 응답합니다.
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setStatus(o.v)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors ${
              status === o.v
                ? "border-primary bg-primary/10"
                : "border-border hover:bg-secondary"
            }`}
          >
            <span className="text-sm font-bold">{o.label}</span>
            <span className="text-[10px] leading-tight text-ink-3">{o.desc}</span>
          </button>
        ))}
      </div>

      {status === "partial" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
          <p className="text-xs font-medium text-ink-2">
            가능/불가 시간대를 입력해 주세요
          </p>
          {slots.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="time"
                value={s.start}
                onChange={(e) =>
                  setSlots((p) =>
                    p.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                  )
                }
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <span className="text-ink-3">~</span>
              <input
                type="time"
                value={s.end}
                onChange={(e) =>
                  setSlots((p) =>
                    p.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                  )
                }
                className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <select
                value={s.kind}
                onChange={(e) =>
                  setSlots((p) =>
                    p.map((x, j) =>
                      j === i ? { ...x, kind: e.target.value as Slot["kind"] } : x,
                    ),
                  )
                }
                className="h-9 rounded-lg border border-border bg-background px-1 text-xs"
              >
                <option value="available">가능</option>
                <option value="unavailable">불가</option>
              </select>
              {slots.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setSlots((p) => p.filter((_, j) => j !== i))}
                  className="px-1.5 text-ink-3 hover:text-destructive"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setSlots((p) => [...p, { start: "", end: "", kind: "available" }])
            }
            className="self-start text-xs font-medium text-primary"
          >
            + 시간대 추가
          </button>
        </div>
      ) : null}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="전달할 메모 (선택)"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-ink-3"
      />

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="h-12 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "저장 중…" : "제출하기"}
      </button>
    </div>
  );
}
