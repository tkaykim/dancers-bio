"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  updateEventOutreachTaskAction,
  updateEventParticipantGenderAction,
  updateEventParticipantOpsAction,
} from "@/app/actions/project-events";
import { extractEventQrCandidates } from "@/lib/ops/event-qr";

type OpsMode = "contact" | "onsite";
export type OutreachStatus =
  | "pending"
  | "no_answer"
  | "unavailable"
  | "available"
  | "do_not_contact"
  | "done";
type AttendanceStatus = "not_arrived" | "checked_in" | "no_show" | "self_withdrawn";
type OnsiteStatus =
  | "waiting"
  | "watching"
  | "hold"
  | "eliminated"
  | "finalist"
  | "self_withdrawn";
type ContactMethod = "phone" | "email" | "instagram" | "kakao" | "other";
type CameraStatus = "idle" | "starting" | "scanning" | "error";

type NativeBarcodeDetector = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
};

type NativeBarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => NativeBarcodeDetector;

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
  application_id: string | null;
  dancer_id: string;
  pass_token: string;
  bib_code: string | null;
  attendance_status: AttendanceStatus;
  onsite_status: OnsiteStatus;
  checked_in_at: string | null;
  eliminated_at: string | null;
  settlement_eligible: boolean;
  note: string;
  updated_at: string;
  outreach_task_id: string | null;
  outreach_status: OutreachStatus;
  contact_method: string;
  last_contacted_at: string | null;
  outreach_note: string;
  contact_phone: string | null;
  contact_email: string | null;
  contact_instagram: string | null;
  dancer: {
    id: string;
    profile_id?: string | null;
    stage_name: string | null;
    korean_name: string | null;
    slug: string | null;
    profile_img: string | null;
    gender?: string | null;
    social_links?: Record<string, string> | null;
  } | null;
  channel: {
    name: string;
  } | null;
};

const CONTACT_STATUSES: Array<{ key: OutreachStatus | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "pending", label: "미처리" },
  { key: "no_answer", label: "연락안받음" },
  { key: "unavailable", label: "진행불가" },
  { key: "available", label: "진행가능" },
  { key: "do_not_contact", label: "연락금지" },
  { key: "done", label: "완료" },
];

const ATTENDANCE_OPTIONS: Array<{ key: AttendanceStatus | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "not_arrived", label: "미도착" },
  { key: "checked_in", label: "출석" },
  { key: "no_show", label: "노쇼" },
  { key: "self_withdrawn", label: "자체포기" },
];

const ONSITE_OPTIONS: Array<{ key: OnsiteStatus | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "waiting", label: "대기" },
  { key: "watching", label: "진행중" },
  { key: "hold", label: "보류" },
  { key: "eliminated", label: "탈락" },
  { key: "finalist", label: "최종" },
  { key: "self_withdrawn", label: "자체포기" },
];

const CONTACT_METHODS: Array<{ key: ContactMethod; label: string }> = [
  { key: "phone", label: "전화" },
  { key: "email", label: "이메일" },
  { key: "instagram", label: "인스타그램" },
  { key: "kakao", label: "카카오" },
  { key: "other", label: "기타" },
];

const GENDER_OPTIONS: Array<{ key: "all" | "male" | "female"; label: string }> = [
  { key: "all", label: "전체 성별" },
  { key: "male", label: "남" },
  { key: "female", label: "여" },
];

// 회의용 보기 프리셋 — 클라이언트 미팅에서 빠르게 거르는 조합 (원본 회의용 보기 적응)
const CONTACT_PRESETS: Array<{
  label: string;
  status: OutreachStatus | "all";
  gender: "all" | "male" | "female";
}> = [
  { label: "전체", status: "all", gender: "all" },
  { label: "진행가능", status: "available", gender: "all" },
  { label: "진행가능·남", status: "available", gender: "male" },
  { label: "진행불가", status: "unavailable", gender: "all" },
  { label: "진행불가·남", status: "unavailable", gender: "male" },
  { label: "미처리", status: "pending", gender: "all" },
];

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
  const timeFormat = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
  const startText = timeFormat.format(start);
  if (!endsAt) return `${dateText} ${startText}`;
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return `${dateText} ${startText}`;
  return `${dateText} ${startText}~${timeFormat.format(end)}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalize(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function bibSortValue(value: string | null) {
  if (!value) return 99999;
  const match = /^([A-Z])-([0-9]+)$/i.exec(value);
  if (!match) return 99998;
  return (match[1].toUpperCase().charCodeAt(0) - 65) * 100 + Number(match[2]);
}

function participantName(row: EventOpsParticipant) {
  return row.dancer?.stage_name || row.dancer?.korean_name || "이름 없음";
}

function realName(row: EventOpsParticipant) {
  return row.dancer?.korean_name || "";
}

function genderLabel(value: string | null | undefined) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기입";
}

function instagramLabel(value: string | null) {
  if (!value) return "";
  return value
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/\/$/, "")
    .replace(/^@/, "");
}

function phoneHref(value: string) {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

function searchText(row: EventOpsParticipant) {
  return normalize(
    [
      row.bib_code ?? "",
      participantName(row),
      realName(row),
      row.channel?.name ?? "",
      row.contact_phone ?? "",
      row.contact_email ?? "",
      instagramLabel(row.contact_instagram),
      row.note,
      row.outreach_note,
    ].join(" "),
  );
}

function findByScanValue(rows: EventOpsParticipant[], value: string) {
  const candidates = new Set(
    extractEventQrCandidates(value).map((candidate) => candidate.toLowerCase()),
  );
  const direct = rows.find((row) =>
    [row.pass_token, row.id, row.bib_code ?? ""]
      .filter(Boolean)
      .some((candidate) => candidates.has(candidate.toLowerCase())),
  );
  if (direct) return direct;
  const q = normalize(value);
  if (!q) return null;
  return rows.find((row) => searchText(row).includes(q)) ?? null;
}

function statusClass(value: string) {
  if (["available", "checked_in", "finalist", "done"].includes(value)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["no_answer", "watching"].includes(value)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (["hold"].includes(value)) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (["unavailable", "do_not_contact", "no_show", "eliminated", "self_withdrawn"].includes(value)) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
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
  const router = useRouter();
  const [participants, setParticipants] = useState(initialParticipants);
  const [mode, setMode] = useState<OpsMode>("contact");
  const [query, setQuery] = useState("");
  const [contactStatus, setContactStatus] = useState<OutreachStatus | "all">("all");
  const [attendance, setAttendance] = useState<AttendanceStatus | "all">("all");
  const [onsite, setOnsite] = useState<OnsiteStatus | "all">("all");
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [profileRow, setProfileRow] = useState<EventOpsParticipant | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [, startTransition] = useTransition();

  // 서버에서 새 데이터가 오면 동기화 (자동 새로고침 후). 입력/저장 중이면 위에서 건너뜀.
  useEffect(() => {
    setParticipants(initialParticipants);
  }, [initialParticipants]);

  // 7초 자동 새로고침 — 다른 운영자의 변경을 실시간 반영. 입력/저장 중에는 건너뜀.
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      const active = document.activeElement;
      const typing =
        active instanceof HTMLElement &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName);
      const saving = Object.values(busy).some(Boolean);
      if (!typing && !saving) router.refresh();
    }, 7000);
    return () => clearInterval(timer);
  }, [autoRefresh, busy, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "onsite") setMode("onsite");
  }, []);

  function switchMode(nextMode: OpsMode) {
    setMode(nextMode);
    const url = new URL(window.location.href);
    if (nextMode === "onsite") url.searchParams.set("mode", "onsite");
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url.toString());
  }

  function patchParticipant(id: string, patch: Partial<EventOpsParticipant>) {
    setParticipants((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  const stats = useMemo(() => {
    return participants.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.outreach_status] += 1;
        acc[row.attendance_status] += 1;
        acc[row.onsite_status] += 1;
        if (row.bib_code) acc.bibAssigned += 1;
        if (row.settlement_eligible) acc.settlementEligible += 1;
        const g = row.dancer?.gender;
        if (g === "male") acc.male += 1;
        else if (g === "female") acc.female += 1;
        if (row.outreach_status === "available" || row.outreach_status === "done") {
          if (g === "male") acc.availableMale += 1;
          else if (g === "female") acc.availableFemale += 1;
          else acc.availableEtc += 1;
        }
        return acc;
      },
      {
        total: 0,
        bibAssigned: 0,
        male: 0,
        female: 0,
        availableMale: 0,
        availableFemale: 0,
        availableEtc: 0,
        pending: 0,
        no_answer: 0,
        unavailable: 0,
        available: 0,
        do_not_contact: 0,
        done: 0,
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

  const matchGender = useCallback(
    (row: EventOpsParticipant) => gender === "all" || row.dancer?.gender === gender,
    [gender],
  );

  const contactRows = useMemo(() => {
    const q = normalize(query);
    return participants
      .filter((row) => {
        if (contactStatus !== "all" && row.outreach_status !== contactStatus) return false;
        if (!matchGender(row)) return false;
        return !q || searchText(row).includes(q);
      })
      .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));
  }, [contactStatus, matchGender, participants, query]);

  const onsiteRows = useMemo(() => {
    const q = normalize(query);
    return participants
      .filter((row) => {
        if (attendance !== "all" && row.attendance_status !== attendance) return false;
        if (onsite !== "all" && row.onsite_status !== onsite) return false;
        if (!matchGender(row)) return false;
        return !q || searchText(row).includes(q);
      })
      .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));
  }, [attendance, matchGender, onsite, participants, query]);

  function updateOutreach(
    row: EventOpsParticipant,
    nextStatus = row.outreach_status,
    nextMethod = row.contact_method,
    nextNote = row.outreach_note,
  ) {
    if (!row.outreach_task_id) {
      toast.error("연락 태스크가 없습니다.");
      return;
    }
    const previous = participants;
    patchParticipant(row.id, {
      outreach_status: nextStatus,
      contact_method: nextMethod,
      outreach_note: nextNote,
      last_contacted_at: nextStatus === "pending" ? null : new Date().toISOString(),
    });
    setBusy((prev) => ({ ...prev, [`contact:${row.id}`]: true }));

    const fd = new FormData();
    fd.set("ops_code", event.ops_code);
    fd.set("task_id", row.outreach_task_id);
    fd.set("status", nextStatus);
    fd.set("contact_method", nextMethod);
    fd.set("result_note", nextNote);

    startTransition(async () => {
      const result = await updateEventOutreachTaskAction(fd);
      setBusy((prev) => ({ ...prev, [`contact:${row.id}`]: false }));
      if (!result.ok || !result.data) {
        setParticipants(previous);
        toast.error(result.ok ? "연락 상태 저장 결과를 확인하지 못했습니다." : result.error);
        return;
      }
      patchParticipant(row.id, {
        outreach_status: result.data.status as OutreachStatus,
        contact_method: result.data.contact_method,
        last_contacted_at: result.data.last_contacted_at,
        outreach_note: result.data.result_note,
        updated_at: result.data.updated_at,
      });
    });
  }

  function updateGender(
    row: EventOpsParticipant,
    nextGender: "male" | "female" | null,
  ) {
    if (!row.dancer) return;
    const previous = participants;
    setParticipants((prev) =>
      prev.map((r) =>
        r.id === row.id && r.dancer
          ? { ...r, dancer: { ...r.dancer, gender: nextGender } }
          : r,
      ),
    );
    setBusy((prev) => ({ ...prev, [`gender:${row.id}`]: true }));
    const fd = new FormData();
    fd.set("ops_code", event.ops_code);
    fd.set("participant_id", row.id);
    fd.set("gender", nextGender ?? "");
    startTransition(async () => {
      const result = await updateEventParticipantGenderAction(fd);
      setBusy((prev) => ({ ...prev, [`gender:${row.id}`]: false }));
      if (!result.ok) {
        setParticipants(previous);
        toast.error(result.error);
      }
    });
  }

  const updateParticipant = useCallback(
    (
      row: EventOpsParticipant,
      nextAttendance: AttendanceStatus = row.attendance_status,
      nextOnsite: OnsiteStatus = row.onsite_status,
      nextNote = row.note,
    ) => {
      const previous = participants;
      const now = new Date().toISOString();
      patchParticipant(row.id, {
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
      });
      setBusy((prev) => ({ ...prev, [`onsite:${row.id}`]: true }));

      const fd = new FormData();
      fd.set("ops_code", event.ops_code);
      fd.set("participant_id", row.id);
      fd.set("attendance_status", nextAttendance);
      fd.set("onsite_status", nextOnsite);
      fd.set("note", nextNote);

      startTransition(async () => {
        const result = await updateEventParticipantOpsAction(fd);
        setBusy((prev) => ({ ...prev, [`onsite:${row.id}`]: false }));
        if (!result.ok || !result.data) {
          setParticipants(previous);
          toast.error(result.ok ? "현장 상태 저장 결과를 확인하지 못했습니다." : result.error);
          return;
        }
        patchParticipant(row.id, {
          attendance_status: result.data.attendance_status as AttendanceStatus,
          onsite_status: result.data.onsite_status as OnsiteStatus,
          checked_in_at: result.data.checked_in_at,
          eliminated_at: result.data.eliminated_at,
          note: result.data.note,
          updated_at: result.data.updated_at,
        });
      });
    },
    [event.ops_code, participants],
  );

  const projectHref = project?.short_code
    ? `/projects/${project.short_code}/applicants`
    : "/feed";
  const rows = mode === "contact" ? contactRows : onsiteRows;

  return (
    <main className="min-h-svh bg-[#f7f7f4] text-[#17140f]">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-black/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              href={projectHref}
              className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45 hover:text-black"
            >
              프로젝트 관리
            </Link>
            <h1 className="mt-2 text-2xl font-black tracking-tight">{event.name}</h1>
            <p className="mt-1 text-sm text-black/60">
              {project?.title ?? "프로젝트"} · {formatWhen(event.starts_at, event.ends_at)}
              {event.location ? ` · ${event.location}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToolLink href={`/ops/events/${event.ops_code}/labels`} label="번호표 라벨" />
            <ToolLink href={`/ops/events/${event.ops_code}/passes`} label="QR 패스" />
            <ToolLink href={`/ops/events/${event.ops_code}/poster`} label="입구 QR 포스터" />
            <ToolLink href={`/ops/events/${event.ops_code}/pass`} label="셀프 접수" />
          </div>
        </header>

        {mode === "onsite" ? (
          <section className="grid grid-cols-4 gap-2 lg:grid-cols-8">
            <Stat label="번호표" value={stats.bibAssigned} tone="good" />
            <Stat label="출석" value={stats.checked_in} tone="good" />
            <Stat label="미도착" value={stats.not_arrived} />
            <Stat label="노쇼" value={stats.no_show} tone="bad" />
            <Stat label="대기" value={stats.waiting} />
            <Stat label="보류" value={stats.hold} />
            <Stat label="탈락" value={stats.eliminated} tone="bad" />
            <Stat label="최종후보" value={stats.finalist} tone="good" />
          </section>
        ) : (
          <section className="grid grid-cols-3 gap-2 lg:grid-cols-6">
            <Stat
              label="진행가능 확보"
              value={stats.available + stats.done}
              tone="good"
              sub={`남 ${stats.availableMale} · 여 ${stats.availableFemale}${stats.availableEtc ? ` · 기타 ${stats.availableEtc}` : ""}`}
            />
            <Stat label="전체" value={stats.total} sub={`남 ${stats.male} · 여 ${stats.female}`} />
            <Stat label="미처리" value={stats.pending} />
            <Stat label="연락안받음" value={stats.no_answer} />
            <Stat label="진행불가" value={stats.unavailable} tone="bad" />
            <Stat label="연락금지" value={stats.do_not_contact} tone="bad" />
          </section>
        )}

        <section className="flex flex-col gap-2 border border-black/10 bg-white p-2 lg:flex-row lg:items-center">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#f0eee8] p-1 text-sm font-bold lg:w-64">
            <button
              type="button"
              onClick={() => switchMode("contact")}
              className={`h-9 rounded-md ${mode === "contact" ? "bg-black text-white" : "text-black/55 hover:bg-white/70"}`}
            >
              연락 운영
            </button>
            <button
              type="button"
              onClick={() => switchMode("onsite")}
              className={`h-9 rounded-md ${mode === "onsite" ? "bg-black text-white" : "text-black/55 hover:bg-white/70"}`}
            >
              현장 운영
            </button>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="번호표, 활동명, 본명, 채널, 연락처 검색"
            className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-[#f7f7f4] px-3 text-sm outline-none focus:border-black/30"
          />
          {mode === "contact" ? (
            <Filter
              value={contactStatus}
              onChange={(value) => setContactStatus(value as OutreachStatus | "all")}
              options={CONTACT_STATUSES}
            />
          ) : (
            <>
              <Filter
                value={attendance}
                onChange={(value) => setAttendance(value as AttendanceStatus | "all")}
                options={ATTENDANCE_OPTIONS}
              />
              <Filter
                value={onsite}
                onChange={(value) => setOnsite(value as OnsiteStatus | "all")}
                options={ONSITE_OPTIONS}
              />
            </>
          )}
          <Filter
            value={gender}
            onChange={(value) => setGender(value as "all" | "male" | "female")}
            options={GENDER_OPTIONS}
          />
          <button
            type="button"
            onClick={() => setAutoRefresh((value) => !value)}
            title="7초마다 다른 운영자의 변경을 자동 반영"
            className={`h-9 shrink-0 rounded-lg border px-3 text-xs font-bold ${
              autoRefresh
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-black/10 bg-white text-black/45"
            }`}
          >
            {autoRefresh ? "● 자동 새로고침" : "○ 자동 새로고침"}
          </button>
        </section>

        {mode === "contact" ? (
          <section className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold text-black/40">회의용 보기</span>
            {CONTACT_PRESETS.map((preset) => {
              const active = contactStatus === preset.status && gender === preset.gender;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setContactStatus(preset.status);
                    setGender(preset.gender);
                  }}
                  className={`h-8 rounded-full border px-3 text-xs font-bold ${
                    active
                      ? "border-black bg-black text-white"
                      : "border-black/10 bg-white text-black/55 hover:bg-black/5"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </section>
        ) : null}

        {mode === "onsite" ? (
          <>
            <OnsiteGuide />
            <QrPanel
              rows={participants}
              updateParticipant={updateParticipant}
              setQuery={setQuery}
            />
          </>
        ) : null}

        {rows.length === 0 ? (
          <div className="border border-dashed border-black/15 bg-white p-8 text-center text-sm font-bold text-black/45">
            조건에 맞는 대상이 없습니다.
          </div>
        ) : mode === "contact" ? (
          <ContactTable
            rows={contactRows}
            busy={busy}
            patchParticipant={patchParticipant}
            updateOutreach={updateOutreach}
            updateGender={updateGender}
            onOpenProfile={setProfileRow}
          />
        ) : (
          <OnsiteTable
            rows={onsiteRows}
            busy={busy}
            patchParticipant={patchParticipant}
            updateParticipant={updateParticipant}
            onOpenProfile={setProfileRow}
          />
        )}
      </div>
      {profileRow ? (
        <ProfileSheet row={profileRow} onClose={() => setProfileRow(null)} />
      ) : null}
    </main>
  );
}

function OnsiteGuide() {
  return (
    <section className="border border-black/10 bg-white p-3 text-xs font-bold text-black/55">
      <p className="text-black/70">현장 운영 순서</p>
      <ol className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <li>① 도착 → 출석을 <b className="text-emerald-700">출석</b>으로</li>
        <li>② 옷의 번호표와 운영판 번호 일치 확인</li>
        <li>③ 클라이언트 제외 인원 → <b className="text-red-600">탈락</b></li>
        <li>④ 판단 보류 → <b className="text-sky-700">보류</b>, 남길 인원 → <b className="text-emerald-700">최종</b></li>
      </ol>
      <p className="mt-1.5 text-black/45">
        ※ 진행불가였던 인원은 <b>연락 운영</b>에서 상태를{" "}
        <b className="text-emerald-700">진행가능</b>으로 바꾸면 번호표·QR 대상에 자동 포함됩니다.
      </p>
    </section>
  );
}

function QrPanel({
  rows,
  updateParticipant,
  setQuery,
}: {
  rows: EventOpsParticipant[];
  updateParticipant: (row: EventOpsParticipant, attendance?: AttendanceStatus, onsite?: OnsiteStatus, note?: string) => void;
  setQuery: (value: string) => void;
}) {
  const [manual, setManual] = useState("");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<{ row: EventOpsParticipant; already: boolean } | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; ts: number }>({ value: "", ts: 0 });

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const handleValue = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      // 같은 값 2초 내 재인식 무시 (연속 스캔 중복 방지)
      const now = Date.now();
      if (lastScanRef.current.value === trimmed && now - lastScanRef.current.ts < 2000) return;
      lastScanRef.current = { value: trimmed, ts: now };

      // 테스트 QR: 명단 변경 없이 스캐너 동작만 확인 (예: TEST:ODH)
      if (/^test:/i.test(trimmed)) {
        const label = trimmed.slice(5).toUpperCase() || "TEST";
        setTestMsg(`테스트 QR 인식됨 (${label}) — 명단은 변경되지 않습니다`);
        setScanError(null);
        setResult(null);
        navigator.vibrate?.(60);
        toast.success(`테스트 QR 인식: ${label}`);
        return;
      }

      const row = findByScanValue(rows, trimmed);
      if (!row) {
        setScanError("운영 명단에서 QR 대상을 찾지 못했습니다.");
        setResult(null);
        setTestMsg(null);
        toast.error("운영 명단에서 대상을 찾지 못했습니다.");
        return;
      }
      setScanError(null);
      setTestMsg(null);
      setQuery(row.bib_code ?? participantName(row));
      navigator.vibrate?.(120);
      const already = row.attendance_status === "checked_in";
      if (!already) updateParticipant(row, "checked_in", row.onsite_status, row.note);
      setResult({ row, already });
      toast.success(
        `${row.bib_code ?? "-"} ${participantName(row)} ${already ? "이미 출석" : "출석 처리"}`,
      );
    },
    [rows, setQuery, updateParticipant],
  );

  async function startCamera() {
    const BarcodeDetectorCtor = (window as unknown as {
      BarcodeDetector?: NativeBarcodeDetectorCtor;
    }).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
      setCameraStatus("error");
      setScanError("이 브라우저는 기본 QR 스캔을 지원하지 않습니다. 수동 입력을 사용해 주세요.");
      return;
    }

    try {
      setCameraStatus("starting");
      setScanError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      setCameraStatus("scanning");

      const tick = async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue;
          if (value) handleValue(value);
        } catch {
          setScanError("QR을 읽는 중 문제가 발생했습니다.");
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch {
      setCameraStatus("error");
      setScanError("카메라를 열지 못했습니다. 권한을 허용하거나 수동 입력을 사용해 주세요.");
    }
  }

  return (
    <section className="border border-black/10 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-black/40">
            QR 체크인
          </p>
          <h2 className="mt-1 text-lg font-black">스캔 또는 수동 입력</h2>
          <p className="mt-1 text-sm text-black/55">
            참가자 QR, 번호표, 이름을 인식해 출석 처리합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && manual.trim()) handleValue(manual.trim());
            }}
            placeholder="QR 값, 번호표, 이름"
            className="h-10 rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-black/30"
          />
          <button
            type="button"
            onClick={() => manual.trim() && handleValue(manual.trim())}
            className="h-10 rounded-lg bg-black px-3 text-sm font-bold text-white"
          >
            수동 체크인
          </button>
          {cameraStatus === "idle" || cameraStatus === "error" ? (
            <button
              type="button"
              onClick={startCamera}
              className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm font-bold"
            >
              스캔 시작
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm font-bold"
            >
              스캔 종료
            </button>
          )}
        </div>
      </div>
      {cameraStatus !== "idle" ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-black bg-black">
          <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
          <p className="border-t border-white/15 px-3 py-2 text-xs font-bold text-white/70">
            {cameraStatus === "starting" ? "카메라 준비 중" : "QR을 화면 중앙에 맞춰 주세요."}
          </p>
        </div>
      ) : null}
      {result ? (
        <div
          className={`mt-3 flex items-center gap-3 rounded-lg border p-3 ${
            result.already ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"
          }`}
        >
          <Bib code={result.row.bib_code} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-black">{participantName(result.row)}</p>
            <p className="truncate text-xs font-bold text-black/55">
              {realName(result.row) ? `${realName(result.row)} · ` : ""}
              {genderLabel(result.row.dancer?.gender)} · {result.row.channel?.name ?? "-"}
            </p>
            <p className={`text-xs font-black ${result.already ? "text-amber-700" : "text-emerald-700"}`}>
              {result.already ? "이미 출석 처리된 인원입니다" : "출석 처리 완료"}
            </p>
          </div>
          {result.row.dancer?.slug || result.row.dancer?.id ? (
            <Link
              href={`/d/${result.row.dancer.slug ?? result.row.dancer.id}`}
              target="_blank"
              className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold hover:bg-black/5"
            >
              프로필
            </Link>
          ) : null}
        </div>
      ) : null}
      {testMsg ? <p className="mt-2 text-sm font-bold text-sky-700">{testMsg}</p> : null}
      {scanError ? <p className="mt-2 text-sm font-bold text-red-600">{scanError}</p> : null}
    </section>
  );
}

function ContactTable({
  rows,
  busy,
  patchParticipant,
  updateOutreach,
  updateGender,
  onOpenProfile,
}: {
  rows: EventOpsParticipant[];
  busy: Record<string, boolean>;
  patchParticipant: (id: string, patch: Partial<EventOpsParticipant>) => void;
  updateOutreach: (row: EventOpsParticipant, status?: OutreachStatus, method?: string, note?: string) => void;
  updateGender: (row: EventOpsParticipant, gender: "male" | "female" | null) => void;
  onOpenProfile: (row: EventOpsParticipant) => void;
}) {
  return (
    <section className="overflow-x-auto border border-black/10 bg-white">
      <table className="w-full min-w-[1180px] border-collapse text-sm">
        <thead className="bg-[#f0eee8] text-left text-xs text-black/55">
          <tr>
            <th className="w-24 px-3 py-2">번호</th>
            <th className="px-3 py-2">대상</th>
            <th className="w-36 px-3 py-2">채널</th>
            <th className="w-20 px-3 py-2">성별</th>
            <th className="w-48 px-3 py-2">연락처</th>
            <th className="w-36 px-3 py-2">상태</th>
            <th className="w-28 px-3 py-2">방법</th>
            <th className="px-3 py-2">메모</th>
            <th className="w-24 px-3 py-2">최근 연락</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isBusy = !!busy[`contact:${row.id}`];
            return (
              <tr key={row.id} className="border-t border-black/10 align-top">
                <td className="px-3 py-2"><Bib code={row.bib_code} /></td>
                <td className="px-3 py-2"><Person row={row} onOpenProfile={onOpenProfile} /></td>
                <td className="px-3 py-2 text-xs font-bold text-black/55">{row.channel?.name ?? "-"}</td>
                <td className="px-3 py-2">
                  <select
                    value={row.dancer?.gender ?? ""}
                    disabled={!!busy[`gender:${row.id}`] || !row.dancer}
                    onChange={(event) =>
                      updateGender(
                        row,
                        (event.target.value || null) as "male" | "female" | null,
                      )
                    }
                    className="h-8 w-16 rounded-md border border-black/10 px-1 text-xs font-bold disabled:opacity-50"
                  >
                    <option value="">미기입</option>
                    <option value="male">남</option>
                    <option value="female">여</option>
                  </select>
                </td>
                <td className="px-3 py-2"><ContactLinks row={row} /></td>
                <td className="px-3 py-2">
                  <select
                    value={row.outreach_status}
                    disabled={isBusy || !row.outreach_task_id}
                    onChange={(event) =>
                      updateOutreach(row, event.target.value as OutreachStatus, row.contact_method, row.outreach_note)
                    }
                    className={`h-8 w-32 rounded-full border px-2 text-xs font-bold disabled:opacity-50 ${statusClass(row.outreach_status)}`}
                  >
                    {CONTACT_STATUSES.filter((option) => option.key !== "all").map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.contact_method}
                    disabled={isBusy || !row.outreach_task_id}
                    onChange={(event) =>
                      updateOutreach(row, row.outreach_status, event.target.value, row.outreach_note)
                    }
                    className="h-8 w-24 rounded-md border border-black/10 px-2 text-xs font-bold disabled:opacity-50"
                  >
                    {CONTACT_METHODS.map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.outreach_note}
                    disabled={isBusy || !row.outreach_task_id}
                    onChange={(event) => patchParticipant(row.id, { outreach_note: event.target.value })}
                    onBlur={(event) =>
                      updateOutreach(row, row.outreach_status, row.contact_method, event.target.value)
                    }
                    placeholder="연락 결과 메모"
                    className="h-8 w-full rounded-md border border-black/10 px-2 text-xs outline-none focus:border-black/30 disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-2 text-xs font-bold text-black/45">
                  {formatTime(row.last_contacted_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function OnsiteTable({
  rows,
  busy,
  patchParticipant,
  updateParticipant,
  onOpenProfile,
}: {
  rows: EventOpsParticipant[];
  busy: Record<string, boolean>;
  patchParticipant: (id: string, patch: Partial<EventOpsParticipant>) => void;
  updateParticipant: (row: EventOpsParticipant, attendance?: AttendanceStatus, onsite?: OnsiteStatus, note?: string) => void;
  onOpenProfile: (row: EventOpsParticipant) => void;
}) {
  return (
    <section className="overflow-x-auto border border-black/10 bg-white">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead className="bg-[#f0eee8] text-left text-xs text-black/55">
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
          {rows.map((row) => {
            const isBusy = !!busy[`onsite:${row.id}`];
            return (
              <tr key={row.id} className="border-t border-black/10 align-top">
                <td className="px-3 py-2"><Bib code={row.bib_code} /></td>
                <td className="px-3 py-2"><Person row={row} onOpenProfile={onOpenProfile} /></td>
                <td className="px-3 py-2 text-xs font-bold text-black/55">{row.channel?.name ?? "-"}</td>
                <td className="px-3 py-2">
                  <select
                    value={row.attendance_status}
                    disabled={isBusy}
                    onChange={(event) =>
                      updateParticipant(row, event.target.value as AttendanceStatus, row.onsite_status, row.note)
                    }
                    className={`h-8 w-28 rounded-full border px-2 text-xs font-bold disabled:opacity-50 ${statusClass(row.attendance_status)}`}
                  >
                    {ATTENDANCE_OPTIONS.filter((option) => option.key !== "all").map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={row.onsite_status}
                    disabled={isBusy}
                    onChange={(event) =>
                      updateParticipant(row, row.attendance_status, event.target.value as OnsiteStatus, row.note)
                    }
                    className={`h-8 w-28 rounded-full border px-2 text-xs font-bold disabled:opacity-50 ${statusClass(row.onsite_status)}`}
                  >
                    {ONSITE_OPTIONS.filter((option) => option.key !== "all").map((option) => (
                      <option key={option.key} value={option.key}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    value={row.note}
                    disabled={isBusy}
                    onChange={(event) => patchParticipant(row.id, { note: event.target.value })}
                    onBlur={(event) =>
                      updateParticipant(row, row.attendance_status, row.onsite_status, event.target.value)
                    }
                    placeholder="현장 메모"
                    className="h-8 w-full rounded-md border border-black/10 px-2 text-xs outline-none focus:border-black/30 disabled:opacity-50"
                  />
                </td>
                <td className="px-3 py-2 text-xs font-bold text-black/45">{formatTime(row.checked_in_at)}</td>
                <td className="px-3 py-2 text-xs font-bold text-black/45">{formatTime(row.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Avatar({ row, size = "sm" }: { row: EventOpsParticipant; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12" : "h-8 w-8";
  if (row.dancer?.profile_img) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={row.dancer.profile_img}
        alt=""
        className={`${box} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-black/10 text-xs font-black`}
    >
      {participantName(row).slice(0, 1)}
    </span>
  );
}

function Person({
  row,
  onOpenProfile,
}: {
  row: EventOpsParticipant;
  onOpenProfile: (row: EventOpsParticipant) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenProfile(row)}
      className="flex min-w-0 items-center gap-2 text-left"
    >
      <Avatar row={row} />
      <span className="min-w-0">
        <span className="block max-w-[200px] truncate font-black hover:underline">
          {participantName(row)}
        </span>
        <span className="block truncate text-xs font-bold text-black/45">
          {realName(row) ? `${realName(row)} · ` : ""}
          {genderLabel(row.dancer?.gender)}
        </span>
      </span>
    </button>
  );
}

function ProfileSheet({
  row,
  onClose,
}: {
  row: EventOpsParticipant;
  onClose: () => void;
}) {
  const social = (row.dancer?.social_links ?? {}) as Record<string, string>;
  const instagram = instagramLabel(row.contact_instagram) || instagramLabel(social.instagram ?? null);
  const fullHref =
    row.dancer?.slug || row.dancer?.id ? `/d/${row.dancer.slug ?? row.dancer.id}` : null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-black/10 bg-white p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Avatar row={row} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black">{participantName(row)}</p>
            <p className="truncate text-xs font-bold text-black/55">
              {realName(row) ? `${realName(row)} · ` : ""}
              {genderLabel(row.dancer?.gender)} · {row.channel?.name ?? "-"}
              {row.bib_code ? ` · ${row.bib_code}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-black/10 px-3 py-1.5 text-xs font-bold hover:bg-black/5"
          >
            닫기
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-sm font-bold">
          {row.contact_phone ? (
            <a href={phoneHref(row.contact_phone)} className="hover:underline">
              📞 {row.contact_phone}
            </a>
          ) : null}
          {instagram ? (
            <a
              href={`https://instagram.com/${instagram}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              📷 @{instagram}
            </a>
          ) : null}
          {row.contact_email ? (
            <a href={`mailto:${row.contact_email}`} className="hover:underline">
              ✉️ {row.contact_email}
            </a>
          ) : null}
          {social.youtube ? (
            <a href={social.youtube} target="_blank" rel="noreferrer" className="hover:underline">
              ▶️ YouTube
            </a>
          ) : null}
          {social.tiktok ? (
            <a href={social.tiktok} target="_blank" rel="noreferrer" className="hover:underline">
              🎵 TikTok
            </a>
          ) : null}
          {!row.contact_phone && !instagram && !row.contact_email ? (
            <span className="text-black/35">등록된 연락처가 없습니다.</span>
          ) : null}
        </div>
        {fullHref ? (
          <Link
            href={fullHref}
            target="_blank"
            className="mt-4 block rounded-lg bg-black px-4 py-2.5 text-center text-sm font-bold text-white"
          >
            전체 프로필 보기
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ContactLinks({ row }: { row: EventOpsParticipant }) {
  const instagram = instagramLabel(row.contact_instagram);
  return (
    <div className="flex flex-col gap-1 text-xs font-bold">
      {row.contact_phone ? <a href={phoneHref(row.contact_phone)} className="hover:underline">{row.contact_phone}</a> : null}
      {instagram ? (
        <a href={`https://instagram.com/${instagram}`} target="_blank" rel="noreferrer" className="hover:underline">
          @{instagram}
        </a>
      ) : null}
      {row.contact_email ? <a href={`mailto:${row.contact_email}`} className="hover:underline">{row.contact_email}</a> : null}
      {!row.contact_phone && !instagram && !row.contact_email ? <span className="text-black/35">연락처 없음</span> : null}
    </div>
  );
}

function Bib({ code }: { code: string | null }) {
  return (
    <span className="inline-flex h-10 min-w-20 items-center justify-center rounded-md border border-black bg-black px-2 text-lg font-black text-white">
      {code ?? "-"}
    </span>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad";
  sub?: string;
}) {
  const valueClass =
    tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-[#17140f]";
  return (
    <div className="border border-black/10 bg-white p-3">
      <p className="text-xs font-bold text-black/40">{label}</p>
      <p className={`mt-1 text-2xl font-black ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] font-bold text-black/40">{sub}</p> : null}
    </div>
  );
}

function Filter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ key: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-lg border border-black/10 bg-[#f7f7f4] px-2 text-xs font-bold outline-none focus:border-black/30"
    >
      {options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ToolLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="inline-flex h-9 items-center rounded-lg border border-black/10 bg-white px-3 text-xs font-bold text-black/70 hover:bg-black/5"
    >
      {label}
    </Link>
  );
}
