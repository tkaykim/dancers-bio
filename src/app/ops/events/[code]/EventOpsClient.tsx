"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";
import { updateEventParticipantOpsAction } from "@/app/actions/project-events";

export type EventOpsEvent = {
  id: string;
  ops_code: string;
  name: string;
  event_type: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  status: string;
  public_pass_code: string;
};

export type EventOpsProject = {
  title: string | null;
  short_code: string | null;
};

export type EventOpsParticipant = {
  id: string;
  bib_code: string | null;
  attendance_status: string;
  onsite_status: string;
  checked_in_at: string | null;
  eliminated_at: string | null;
  settlement_eligible: boolean;
  note: string;
  updated_at: string;
  dancer: {
    id: string;
    stage_name: string;
    korean_name: string | null;
    slug: string | null;
    profile_img: string | null;
  } | null;
  channel: {
    name: string;
  } | null;
};

const ATTENDANCE_LABELS: Record<string, string> = {
  all: "전체",
  not_arrived: "미도착",
  checked_in: "출석",
  no_show: "노쇼",
  self_withdrawn: "자체포기",
};

const ONSITE_LABELS: Record<string, string> = {
  all: "전체",
  waiting: "대기",
  watching: "진행중",
  hold: "보류",
  eliminated: "탈락",
  finalist: "최종",
  self_withdrawn: "자체포기",
};

const ATTENDANCE_OPTIONS = ["not_arrived", "checked_in", "no_show", "self_withdrawn"];
const ONSITE_OPTIONS = ["waiting", "watching", "hold", "eliminated", "finalist", "self_withdrawn"];

function formatWhen(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "일정 미정";
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return "일정 미정";
  const dateText = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(start);
  const startText = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(start);
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

function updatedText(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function bibSortValue(value: string | null) {
  if (!value) return 99999;
  const match = /^([A-Z])-([0-9]+)$/.exec(value);
  if (!match) return 99998;
  return (match[1].charCodeAt(0) - 65) * 100 + Number(match[2]);
}

function attendanceClass(value: string) {
  if (value === "checked_in") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "no_show" || value === "self_withdrawn") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function onsiteClass(value: string) {
  if (value === "finalist") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "hold") return "border-sky-200 bg-sky-50 text-sky-700";
  if (value === "eliminated" || value === "self_withdrawn") return "border-red-200 bg-red-50 text-red-700";
  if (value === "watching") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function participantName(row: EventOpsParticipant) {
  return row.dancer?.stage_name ?? row.dancer?.korean_name ?? "(이름 없음)";
}

export function EventOpsClient({
  event,
  project,
  participants: initialParticipants,
}: {
  event: EventOpsEvent;
  project: EventOpsProject | null;
  participants: EventOpsParticipant[];
}) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [query, setQuery] = useState("");
  const [attendance, setAttendance] = useState("all");
  const [onsite, setOnsite] = useState("all");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const stats = useMemo(() => {
    return participants.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.attendance_status as keyof typeof acc] =
          Number(acc[row.attendance_status as keyof typeof acc] ?? 0) + 1;
        acc[row.onsite_status as keyof typeof acc] =
          Number(acc[row.onsite_status as keyof typeof acc] ?? 0) + 1;
        if (row.settlement_eligible) acc.settlementEligible += 1;
        return acc;
      },
      {
        total: 0,
        not_arrived: 0,
        checked_in: 0,
        no_show: 0,
        self_withdrawn: 0,
        waiting: 0,
        watching: 0,
        hold: 0,
        eliminated: 0,
        finalist: 0,
        settlementEligible: 0,
      },
    );
  }, [participants]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return participants
      .filter((row) => {
        if (attendance !== "all" && row.attendance_status !== attendance) return false;
        if (onsite !== "all" && row.onsite_status !== onsite) return false;
        if (!q) return true;
        const text = normalize(
          [
            row.bib_code ?? "",
            participantName(row),
            row.dancer?.korean_name ?? "",
            row.channel?.name ?? "",
            row.note ?? "",
          ].join(" "),
        );
        return text.includes(q);
      })
      .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));
  }, [attendance, onsite, participants, query]);

  function patchParticipant(id: string, patch: Partial<EventOpsParticipant>) {
    setParticipants((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  function updateParticipant(
    row: EventOpsParticipant,
    nextAttendance = row.attendance_status,
    nextOnsite = row.onsite_status,
    nextNote = row.note,
  ) {
    const previous = participants;
    const now = new Date().toISOString();
    const optimistic = {
      attendance_status: nextAttendance,
      onsite_status: nextOnsite,
      note: nextNote,
      checked_in_at:
        nextAttendance === "checked_in" ? row.checked_in_at ?? now : null,
      eliminated_at:
        nextOnsite === "eliminated" || nextOnsite === "self_withdrawn"
          ? row.eliminated_at ?? now
          : null,
      updated_at: now,
    };
    patchParticipant(row.id, optimistic);
    setBusy((prev) => ({ ...prev, [row.id]: true }));

    const fd = new FormData();
    fd.set("ops_code", event.ops_code);
    fd.set("participant_id", row.id);
    fd.set("attendance_status", nextAttendance);
    fd.set("onsite_status", nextOnsite);
    fd.set("note", nextNote);

    startTransition(async () => {
      const result = await updateEventParticipantOpsAction(fd);
      setBusy((prev) => ({ ...prev, [row.id]: false }));
      if (!result.ok) {
        setParticipants(previous);
        toast.error(result.error);
        return;
      }
      if (!result.data) {
        setParticipants(previous);
        toast.error("상태 저장 결과를 확인하지 못했습니다.");
        return;
      }
      patchParticipant(row.id, result.data);
    });
  }

  const projectHref = project?.short_code
    ? `/projects/${project.short_code}/applicants`
    : "/feed";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8">
      <Link
        href={projectHref}
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 프로젝트 관리
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-primary">
          범용 이벤트 운영판
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
        <p className="text-sm text-ink-2">
          {project?.title ?? "프로젝트"} · {formatWhen(event.starts_at, event.ends_at)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </header>

      <section className="grid gap-2 sm:grid-cols-5">
        <Stat label="참가자" value={stats.total} />
        <Stat label="출석" value={stats.checked_in} />
        <Stat label="보류" value={stats.hold} />
        <Stat label="탈락" value={stats.eliminated + stats.self_withdrawn} />
        <Stat label="정산대상" value={stats.settlementEligible} />
      </section>

      <section className="sticky top-0 z-20 flex flex-col gap-2 border border-border bg-background/95 p-2 backdrop-blur lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="번호, 이름, 채널, 메모 검색"
            className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm outline-none focus:border-primary/50"
          />
        </div>
        <Filter
          label="출석"
          value={attendance}
          onChange={setAttendance}
          labels={ATTENDANCE_LABELS}
          options={["all", ...ATTENDANCE_OPTIONS]}
        />
        <Filter
          label="현장"
          value={onsite}
          onChange={setOnsite}
          labels={ONSITE_LABELS}
          options={["all", ...ONSITE_OPTIONS]}
        />
      </section>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          조건에 맞는 참가자가 없습니다.
        </p>
      ) : (
        <section className="overflow-x-auto border border-border bg-card">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-secondary text-left text-xs text-ink-3">
              <tr>
                <th className="w-24 px-3 py-2">번호</th>
                <th className="px-3 py-2">참가자</th>
                <th className="w-36 px-3 py-2">채널</th>
                <th className="w-32 px-3 py-2">출석</th>
                <th className="w-32 px-3 py-2">현장</th>
                <th className="px-3 py-2">메모</th>
                <th className="w-24 px-3 py-2">체크인</th>
                <th className="w-24 px-3 py-2">수정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const name = participantName(row);
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <span className="inline-flex h-10 min-w-20 items-center justify-center rounded-md border border-foreground bg-foreground px-2 text-lg font-extrabold text-background">
                        {row.bib_code ?? "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        {row.dancer?.profile_img ? (
                          <Image
                            src={row.dancer.profile_img}
                            alt={name}
                            width={40}
                            height={40}
                            className="size-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                            {name[0] ?? "?"}
                          </div>
                        )}
                        <div className="min-w-0">
                          {row.dancer?.slug || row.dancer?.id ? (
                            <Link
                              href={`/d/${row.dancer.slug ?? row.dancer.id}`}
                              target="_blank"
                              className="inline-flex max-w-[220px] items-center gap-1 truncate font-semibold hover:underline"
                            >
                              <span className="truncate">{name}</span>
                              <ExternalLink size={12} className="shrink-0" />
                            </Link>
                          ) : (
                            <p className="truncate font-semibold">{name}</p>
                          )}
                          {row.dancer?.korean_name && row.dancer.korean_name !== name ? (
                            <p className="truncate text-xs text-ink-3">
                              {row.dancer.korean_name}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-2">
                      {row.channel?.name ?? "-"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.attendance_status}
                        disabled={busy[row.id]}
                        onChange={(event) =>
                          updateParticipant(row, event.target.value, row.onsite_status, row.note)
                        }
                        className={`h-8 w-28 rounded-full border px-2 text-xs font-semibold outline-none disabled:opacity-50 ${attendanceClass(row.attendance_status)}`}
                      >
                        {ATTENDANCE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {ATTENDANCE_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.onsite_status}
                        disabled={busy[row.id]}
                        onChange={(event) =>
                          updateParticipant(row, row.attendance_status, event.target.value, row.note)
                        }
                        className={`h-8 w-28 rounded-full border px-2 text-xs font-semibold outline-none disabled:opacity-50 ${onsiteClass(row.onsite_status)}`}
                      >
                        {ONSITE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {ONSITE_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.note}
                        disabled={busy[row.id]}
                        onChange={(event) => patchParticipant(row.id, { note: event.target.value })}
                        onBlur={(event) =>
                          updateParticipant(row, row.attendance_status, row.onsite_status, event.target.value)
                        }
                        placeholder="메모"
                        className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-3">
                      {updatedText(row.checked_in_at)}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-3">
                      {updatedText(row.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  labels,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  labels: Record<string, string>;
  options: string[];
}) {
  return (
    <label className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-3">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}
