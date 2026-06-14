"use client";

import { useState, useTransition } from "react";
import { MapPin } from "lucide-react";
import {
  submitProjectScheduleResponsesAction,
  submitProjectScheduleResponsesByTokenAction,
} from "@/app/actions/project-schedules";

type Status = "available" | "partial" | "unavailable";
type Slot = { start: string; end: string; kind: "available" | "unavailable" };

export type SurveyItem = {
  id: string;
  label: string;
  whenText: string;
  location: string | null;
  note: string | null;
  // 기존 응답 프리필
  status: Status | null;
  timeSlots: Slot[] | null;
  responseNote: string | null;
};

type Answer = {
  status: Status | null;
  slots: Slot[];
  note: string;
};

const OPTIONS: { v: Status; label: string }[] = [
  { v: "available", label: "가능" },
  { v: "partial", label: "시간 일부" },
  { v: "unavailable", label: "불가" },
];

export function ProjectScheduleSurveyForm({
  code,
  token,
  responderName,
  items,
}: {
  // 둘 중 하나: code(로그인 설문) 또는 token(메일 개인 매직링크, 로그인 생략)
  code?: string;
  token?: string;
  responderName?: string | null;
  items: SurveyItem[];
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const init: Record<string, Answer> = {};
    for (const it of items) {
      init[it.id] = {
        status: it.status,
        slots:
          it.timeSlots && it.timeSlots.length > 0
            ? it.timeSlots
            : [{ start: "", end: "", kind: "available" }],
        note: it.responseNote ?? "",
      };
    }
    return init;
  });
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(id: string, p: Partial<Answer>) {
    setAnswers((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-base font-bold">응답 완료! 🙆</p>
        <p className="mt-1 text-sm text-ink-2">
          알려주셔서 감사합니다. 이 창은 닫으셔도 됩니다.
          <br />
          다시 들어오시면 언제든 수정할 수 있어요.
        </p>
      </div>
    );
  }

  function submit() {
    const payload = items
      .map((it) => {
        const a = answers[it.id];
        if (!a?.status) return null;
        return {
          schedule_id: it.id,
          status: a.status,
          time_slots:
            a.status === "partial"
              ? a.slots.filter((s) => s.start && s.end)
              : null,
          note: a.note.trim() || null,
        };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      setError("최소 한 개 일정의 가능 여부를 선택해 주세요.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("answers", JSON.stringify(payload));
    startTransition(async () => {
      let r;
      if (token) {
        fd.set("token", token);
        r = await submitProjectScheduleResponsesByTokenAction(fd);
      } else {
        fd.set("code", code ?? "");
        r = await submitProjectScheduleResponsesAction(fd);
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(true);
    });
  }

  const answeredCount = items.filter((it) => answers[it.id]?.status).length;

  return (
    <div className="flex flex-col gap-4">
      {responderName ? (
        <p className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-sm">
          <span className="font-semibold">{responderName}</span>님으로 응답합니다.
          {items.length > 1 ? (
            <span className="text-ink-3"> · 일정 {items.length}개</span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {items.map((it) => {
          const a = answers[it.id];
          return (
            <div
              key={it.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-bold">{it.label}</p>
                <p className="text-xs text-ink-2">{it.whenText}</p>
                {it.location ? (
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {it.location}
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {OPTIONS.map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => patch(it.id, { status: o.v })}
                    className={`rounded-xl border px-2 py-2.5 text-center text-sm font-semibold transition-colors ${
                      a?.status === o.v
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-secondary"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {a?.status === "partial" ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
                  <p className="text-xs font-medium text-ink-2">
                    가능/불가 시간대를 입력해 주세요
                  </p>
                  {a.slots.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="time"
                        value={s.start}
                        onChange={(e) =>
                          patch(it.id, {
                            slots: a.slots.map((x, j) =>
                              j === i ? { ...x, start: e.target.value } : x,
                            ),
                          })
                        }
                        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
                      />
                      <span className="text-ink-3">~</span>
                      <input
                        type="time"
                        value={s.end}
                        onChange={(e) =>
                          patch(it.id, {
                            slots: a.slots.map((x, j) =>
                              j === i ? { ...x, end: e.target.value } : x,
                            ),
                          })
                        }
                        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
                      />
                      <select
                        value={s.kind}
                        onChange={(e) =>
                          patch(it.id, {
                            slots: a.slots.map((x, j) =>
                              j === i
                                ? { ...x, kind: e.target.value as Slot["kind"] }
                                : x,
                            ),
                          })
                        }
                        className="h-9 rounded-lg border border-border bg-background px-1 text-xs"
                      >
                        <option value="available">가능</option>
                        <option value="unavailable">불가</option>
                      </select>
                      {a.slots.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            patch(it.id, {
                              slots: a.slots.filter((_, j) => j !== i),
                            })
                          }
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
                      patch(it.id, {
                        slots: [
                          ...a.slots,
                          { start: "", end: "", kind: "available" },
                        ],
                      })
                    }
                    className="self-start text-xs font-medium text-primary"
                  >
                    + 시간대 추가
                  </button>
                </div>
              ) : null}

              {a?.status ? (
                <input
                  value={a.note}
                  onChange={(e) => patch(it.id, { note: e.target.value })}
                  placeholder="메모 (선택)"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-ink-3"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="sticky bottom-4 h-12 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-lg disabled:opacity-50"
      >
        {pending
          ? "저장 중…"
          : `제출하기${
              items.length > 1 ? ` (${answeredCount}/${items.length})` : ""
            }`}
      </button>
    </div>
  );
}
