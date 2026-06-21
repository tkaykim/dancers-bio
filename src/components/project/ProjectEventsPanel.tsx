"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, ExternalLink, Printer, QrCode, Users } from "lucide-react";
import { toast } from "sonner";
import {
  createProjectEventAction,
  seedEventParticipantsFromAcceptedAction,
} from "@/app/actions/project-events";

export type ProjectEventRow = {
  id: string;
  name: string;
  event_type: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  status: string;
  ops_code: string;
  public_pass_code: string;
  participantCount: number;
  checkedInCount: number;
  finalistCount: number;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  audition: "오디션",
  rehearsal: "연습",
  shoot: "촬영",
  meeting: "미팅",
  fitting: "피팅",
  other: "기타",
};

function formatEventWhen(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "일정 미정";
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return "일정 미정";
  const dateText = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
  const startText = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
  if (!endsAt) return `${dateText} ${startText}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${dateText} ${startText}`;
  const endText = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(end);
  return `${dateText} ${startText}~${endText}`;
}

export function ProjectEventsPanel({
  projectId,
  events,
}: {
  projectId: string;
  events: ProjectEventRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const origin =
    typeof window === "undefined" ? "https://deetz.kr" : window.location.origin;

  function createEvent(formData: FormData) {
    formData.set("project_id", projectId);
    if (date) {
      formData.set("starts_at", `${date}T${start || "00:00"}:00+09:00`);
      if (end) formData.set("ends_at", `${date}T${end}:00+09:00`);
    }
    startTransition(async () => {
      const result = await createProjectEventAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("운영일정을 만들었습니다");
      setOpen(false);
      setDate("");
      setStart("");
      setEnd("");
      router.refresh();
    });
  }

  function seedParticipants(eventId: string) {
    setBusyId(eventId);
    const fd = new FormData();
    fd.set("event_id", eventId);
    seedEventParticipantsFromAcceptedAction(fd).then((result) => {
      setBusyId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const data = result.data;
      toast.success(
        data
          ? `참가자 ${data.inserted}명 추가했습니다`
          : "참가자 명단을 갱신했습니다",
      );
      router.refresh();
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("복사했습니다");
    } catch {
      toast.error("복사하지 못했습니다");
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
            ↳ 운영일정 ({events.length})
          </p>
          <p className="mt-1 text-xs text-ink-3">
            오디션·연습·촬영일별 출석, 번호표, 현장 상태를 분리해서 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
        >
          <CalendarClock className="size-3.5" />
          일정
        </button>
      </div>

      {open ? (
        <form
          action={createEvent}
          className="grid gap-2 rounded-xl border border-hairline-2 bg-background p-3 sm:grid-cols-[1fr_120px]"
        >
          <input
            name="name"
            required
            maxLength={120}
            placeholder="예: 1차 오디션, 7/13 연습"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          />
          <select
            name="event_type"
            defaultValue="rehearsal"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          >
            <option value="audition">오디션</option>
            <option value="rehearsal">연습</option>
            <option value="shoot">촬영</option>
            <option value="fitting">피팅</option>
            <option value="meeting">미팅</option>
            <option value="other">기타</option>
          </select>
          <div className="grid gap-2 sm:col-span-2 sm:grid-cols-[1fr_100px_100px]">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            />
            <input
              type="time"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            />
            <input
              type="time"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            />
          </div>
          <input
            name="location"
            maxLength={200}
            placeholder="장소"
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm sm:col-span-2"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2"
          >
            {pending ? "생성 중..." : "운영일정 만들기"}
          </button>
        </form>
      ) : null}

      {events.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline-2 p-5 text-center text-sm text-ink-3">
          아직 운영일정이 없습니다. 이벤트를 만들면 수락된 지원자를 참가자로 전환할 수 있습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => {
            const opsUrl = `${origin}/ops/events/${event.ops_code}`;
            const labelsUrl = `${opsUrl}/labels`;
            const passesUrl = `${opsUrl}/passes`;
            return (
              <li key={event.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold">{event.name}</p>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-ink-2">
                          {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-ink-3">
                          {event.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-2">
                        {formatEventWhen(event.starts_at, event.ends_at)}
                      </p>
                      {event.location ? (
                        <p className="mt-0.5 truncate text-xs text-ink-3">
                          {event.location}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={busyId === event.id}
                      onClick={() => seedParticipants(event.id)}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2.5 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                      <Users className="size-3.5" />
                      수락자 반영
                    </button>
                  </div>

                  <div className="grid grid-cols-3 rounded-lg border border-hairline-2 bg-background text-center text-xs">
                    <div className="p-2">
                      <p className="text-ink-3">참가자</p>
                      <p className="font-semibold">{event.participantCount}</p>
                    </div>
                    <div className="border-x border-hairline-2 p-2">
                      <p className="text-ink-3">출석</p>
                      <p className="font-semibold">{event.checkedInCount}</p>
                    </div>
                    <div className="p-2">
                      <p className="text-ink-3">최종/보류</p>
                      <p className="font-semibold">{event.finalistCount}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs lg:grid-cols-3">
                    <EventToolLink
                      label="운영판"
                      href={opsUrl}
                      onCopy={() => copy(opsUrl)}
                      icon={<ExternalLink className="size-3.5" />}
                    />
                    <EventToolLink
                      label="번호표 라벨"
                      href={labelsUrl}
                      onCopy={() => copy(labelsUrl)}
                      icon={<Printer className="size-3.5" />}
                    />
                    <EventToolLink
                      label="QR 패스"
                      href={passesUrl}
                      onCopy={() => copy(passesUrl)}
                      icon={<QrCode className="size-3.5" />}
                    />
                  </div>

                  <div className="hidden items-center gap-2 rounded-lg border border-hairline-2 bg-background px-2 py-2 text-xs">
                    <code className="min-w-0 flex-1 truncate text-ink-2">
                      {opsUrl}
                    </code>
                    <button
                      type="button"
                      onClick={() => copy(opsUrl)}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
                      aria-label="운영 링크 복사"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <a
                      href={opsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
                      aria-label="운영 링크 열기"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function EventToolLink({
  label,
  href,
  icon,
  onCopy,
}: {
  label: string;
  href: string;
  icon: ReactNode;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-hairline-2 bg-background px-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-ink-3">
          {label}
        </p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs font-medium text-foreground hover:underline"
        >
          {href.replace(/^https?:\/\//, "")}
        </a>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
        aria-label={`${label} 복사`}
      >
        <Copy className="size-3.5" />
      </button>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
        aria-label={`${label} 열기`}
      >
        {icon}
      </a>
    </div>
  );
}
