"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  createScheduleAction,
  deleteScheduleAction,
  sendProjectScheduleRequestsAction,
  getScheduleRespondersAction,
} from "@/app/actions/project-schedules";

export type ScheduleRow = {
  id: string;
  label: string;
  whenText: string;
  location: string | null;
  available: number;
  partial: number;
  unavailable: number;
  responded: number;
};

const STATUS_LABEL: Record<string, string> = {
  available: "가능",
  partial: "시간 일부",
  unavailable: "불가",
};

export function SchedulePanel({
  projectId,
  targetCount,
  schedules,
  surveyUrl,
}: {
  projectId: string;
  targetCount: number;
  schedules: ScheduleRow[];
  surveyUrl: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [expand, setExpand] = useState<string | null>(null);
  const [responders, setResponders] = useState<
    Record<string, { name: string; status: string; note: string | null }[]>
  >({});

  // 새 일정 입력
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  function addSchedule() {
    if (!label.trim() || !date) {
      toast.error("일정 제목과 날짜를 입력해 주세요.");
      return;
    }
    // 시간 비우면 '시간 미정'(날짜만). 날짜는 항상 보냄(00:00 KST 기준 저장).
    const tbd = !start;
    const fd = new FormData();
    fd.set("project_id", projectId);
    fd.set("label", label.trim());
    fd.set("starts_at", `${date}T${start || "00:00"}:00+09:00`);
    if (!tbd && end) fd.set("ends_at", `${date}T${end}:00+09:00`);
    if (tbd) fd.set("time_tbd", "true");
    if (location.trim()) fd.set("location", location.trim());
    if (note.trim()) fd.set("note", note.trim());
    startTransition(async () => {
      const r = await createScheduleAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("일정을 추가했습니다");
      setLabel("");
      setDate("");
      setStart("");
      setEnd("");
      setLocation("");
      setNote("");
      setOpen(false);
      router.refresh();
    });
  }

  function sendAll() {
    if (schedules.length === 0) {
      toast.error("먼저 후보 일정을 추가해 주세요.");
      return;
    }
    if (
      !confirm(
        `전체 후보 일정(${schedules.length}개)의 참석 가능여부 요청 메일을 발송할까요?\n대상: 탈락 제외 지원자(대기+수락) ${targetCount}명 · 사람당 1통\n메일 버튼을 누르면 로그인 없이 전체 일정에 응답합니다.\n(발신 dancers.bio.kr@gmail.com)`,
      )
    )
      return;
    const fd = new FormData();
    fd.set("project_id", projectId);
    startTransition(async () => {
      const r = await sendProjectScheduleRequestsAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`발송 ${r.data?.sent ?? 0}건 (건너뜀 ${r.data?.skipped ?? 0})`);
    });
  }

  function remove(id: string) {
    if (!confirm("이 일정을 삭제할까요? (응답도 함께 삭제됩니다)")) return;
    const fd = new FormData();
    fd.set("schedule_id", id);
    fd.set("project_id", projectId);
    startTransition(async () => {
      const r = await deleteScheduleAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleExpand(id: string) {
    if (expand === id) {
      setExpand(null);
      return;
    }
    setExpand(id);
    if (!responders[id]) {
      getScheduleRespondersAction(id).then((r) => {
        if (r.ok && r.data) setResponders((p) => ({ ...p, [id]: r.data! }));
      });
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 일정 가능여부 ({schedules.length})
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
        >
          {open ? "닫기" : "+ 일정 추가"}
        </button>
      </div>

      {schedules.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-hairline-2 bg-secondary/30 p-2.5">
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
              {surveyUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(surveyUrl);
                toast.success("단톡방 공유 링크 복사됨 (전체 일정)");
              }}
              className="shrink-0 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground"
            >
              단톡방 링크 복사
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={sendAll}
            className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            ✉️ 요청 메일 발송 (대기·수락 {targetCount}명 · 사람당 전체 일정 1통)
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-2 rounded-xl border border-hairline-2 p-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="일정 제목 (예: 1차 오디션 겸 연습)"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-sm"
            />
            <span className="self-center text-ink-3">~</span>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-10 w-24 rounded-lg border border-border bg-background px-2 text-sm"
            />
          </div>
          <p className="-mt-1 text-[11px] text-ink-3">
            시간을 비우면 &apos;시간 미정&apos;(날짜만)으로 등록됩니다. 추가 시
            대기·수락 지원자에게 알림이 갑니다.
          </p>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="장소 (선택, 지원자에겐 비공개)"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="메모 (선택)"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={addSchedule}
            className="h-10 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            일정 추가
          </button>
        </div>
      ) : null}

      {schedules.length === 0 ? (
        <p className="text-xs text-ink-3">
          아직 등록된 일정이 없습니다. 후보 일정을 추가하고 지원자에게 가능여부를 받아보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedules.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-xl border border-border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <p className="text-sm font-semibold">{s.label}</p>
                  <p className="text-xs text-ink-2">{s.whenText}</p>
                  {s.location ? (
                    <p className="flex items-center gap-1 text-xs text-ink-3">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {s.location}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  className="shrink-0 text-[11px] text-ink-3 hover:text-destructive"
                >
                  삭제
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full bg-ok/15 px-2 py-0.5 font-medium text-ok">
                  가능 {s.available}
                </span>
                <span className="rounded-full bg-warn/15 px-2 py-0.5 font-medium text-warn">
                  일부 {s.partial}
                </span>
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                  불가 {s.unavailable}
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-ink-3">
                  미응답 {Math.max(0, targetCount - s.responded)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(s.id)}
                  className="rounded-full border border-border px-3 py-1 text-[11px] text-ink-2 hover:bg-secondary"
                >
                  {expand === s.id ? "명단 닫기" : "응답 명단"}
                </button>
              </div>

              {expand === s.id ? (
                <ul className="flex flex-col gap-1 border-t border-hairline-2 pt-2">
                  {(responders[s.id] ?? []).length === 0 ? (
                    <li className="text-[11px] text-ink-3">아직 응답이 없습니다.</li>
                  ) : (
                    (responders[s.id] ?? []).map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-medium">{r.name}</span>
                        <span className="text-ink-3">
                          {STATUS_LABEL[r.status] ?? r.status}
                          {r.note ? ` · ${r.note}` : ""}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
