"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  Camera,
  CheckCircle2,
  ExternalLink,
  Mail,
  Phone,
  QrCode,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  BrowserCodeReader,
  BrowserQRCodeReader,
  type IScannerControls,
} from "@zxing/browser";
import { toast } from "sonner";
import { getBrowserClient } from "@/lib/supabase/browser";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { extractNdolQrCandidates } from "@/lib/ops/ndol-qr";

type ManagerKey = "all" | "baw" | "hs";
type GenderKey = "all" | "male" | "female" | "unknown";
type GroupKey =
  | "all"
  | "confirmed"
  | "accepted_unknown"
  | "pending_unknown"
  | "recovery";
type OutreachStatus = "pending" | "no_answer" | "unavailable" | "available";
type OpsMode = "contact" | "onsite";
type AttendanceStatus = "not_arrived" | "checked_in" | "no_show";
type OnsiteStatus = "waiting" | "watching" | "hold" | "eliminated" | "finalist";
type ClientViewKey =
  | "ops"
  | "held_all"
  | "held_male"
  | "schedule_blocked"
  | "schedule_blocked_male";

type GenderBreakdown = {
  total: number;
  male: number;
  female: number;
  unknown: number;
};

export type ApplicantSummaryItem = {
  key: string;
  name: string;
  projectCode: string;
  status: string;
  statusLabel: string;
  gender: Exclude<GenderKey, "all">;
  profileImg: string | null;
  genres: string[];
  reason: string | null;
};

export type ApplicantProjectSummary = {
  code: string;
  title: string | null;
  total: GenderBreakdown;
  accepted: GenderBreakdown;
  pending: GenderBreakdown;
  dropped: GenderBreakdown;
  withdrawn: GenderBreakdown;
};

export type ApplicantSummary = {
  totalApplications: number;
  uniqueApplicants: number;
  total: GenderBreakdown;
  accepted: GenderBreakdown;
  pending: GenderBreakdown;
  dropped: GenderBreakdown;
  withdrawn: GenderBreakdown;
  scheduleBlocked: GenderBreakdown;
  extra: GenderBreakdown;
  projects: ApplicantProjectSummary[];
  droppedApplicants: ApplicantSummaryItem[];
};

type OpsRow = {
  id: string;
  event_key: string;
  source_key: string;
  dancer_id: string | null;
  project_id: string | null;
  project_code: string;
  project_href: string | null;
  group_key: Exclude<GroupKey, "all">;
  manager_key: Exclude<ManagerKey, "all">;
  manager_name: string;
  name: string;
  gender: Exclude<GenderKey, "all">;
  app_status: string | null;
  availability_status: string | null;
  outreach_status: OutreachStatus;
  phone: string | null;
  instagram: string | null;
  email: string | null;
  note: string | null;
  sort_rank: number;
  updated_at: string;
  dancer_slug: string | null;
  dancer_profile_img: string | null;
  dancer_korean_name: string | null;
  dancer_bio: string | null;
  dancer_location: string | null;
  dancer_genres: string[] | null;
  dancer_specialties: string[] | null;
  dancer_social_links: Record<string, string> | null;
  dancer_portfolio_file_url: string | null;
  dancer_portfolio_file_name: string | null;
  bib_code: string | null;
  attendance_status: AttendanceStatus | null;
  onsite_status: OnsiteStatus | null;
  onsite_note: string | null;
  checked_in_at: string | null;
  eliminated_at: string | null;
};

const EMPTY_BREAKDOWN: GenderBreakdown = {
  total: 0,
  male: 0,
  female: 0,
  unknown: 0,
};

const EMPTY_APPLICANT_SUMMARY: ApplicantSummary = {
  totalApplications: 0,
  uniqueApplicants: 0,
  total: EMPTY_BREAKDOWN,
  accepted: EMPTY_BREAKDOWN,
  pending: EMPTY_BREAKDOWN,
  dropped: EMPTY_BREAKDOWN,
  withdrawn: EMPTY_BREAKDOWN,
  scheduleBlocked: EMPTY_BREAKDOWN,
  extra: EMPTY_BREAKDOWN,
  projects: [],
  droppedApplicants: [],
};

const MANAGERS: Array<{ key: ManagerKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "baw", label: "BAW(김주성)" },
  { key: "hs", label: "HS(정현수)" },
];

const GROUPS: Array<{ key: GroupKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "confirmed", label: "확정" },
  { key: "accepted_unknown", label: "일정확인 1순위" },
  { key: "pending_unknown", label: "예비" },
  { key: "recovery", label: "회신 모니터링" },
];

const GENDERS: Array<{ key: GenderKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "male", label: "남" },
  { key: "female", label: "여" },
  { key: "unknown", label: "미기재" },
];

const STATUSES: Array<{ key: OutreachStatus | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "pending", label: "미처리" },
  { key: "no_answer", label: "연락안받음" },
  { key: "unavailable", label: "진행불가" },
  { key: "available", label: "진행가능" },
];

const ATTENDANCE_STATUSES: Array<{ key: AttendanceStatus | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "not_arrived", label: "미도착" },
  { key: "checked_in", label: "출석" },
  { key: "no_show", label: "노쇼" },
];

const ONSITE_STATUSES: Array<{ key: OnsiteStatus | "all"; label: string }> = [
  { key: "all", label: "전체" },
  { key: "waiting", label: "대기" },
  { key: "watching", label: "심사중" },
  { key: "hold", label: "보류" },
  { key: "eliminated", label: "탈락" },
  { key: "finalist", label: "최종후보" },
];

const CLIENT_VIEWS: Array<{
  key: ClientViewKey;
  label: string;
  desc: string;
}> = [
  { key: "ops", label: "전체 운영", desc: "현재 연락 운영 전체 명단" },
  { key: "held_all", label: "보류 전체", desc: "지원 상태가 보류인 인원" },
  { key: "held_male", label: "보류 남자", desc: "보류 인원 중 남성만 보기" },
  { key: "schedule_blocked", label: "일정불가 전체", desc: "시간 문제로 진행 어려운 인원" },
  { key: "schedule_blocked_male", label: "일정불가 남자", desc: "일정불가 인원 중 남성만 보기" },
];

function genderLabel(value: string) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기재";
}

function breakdownText(value: GenderBreakdown) {
  const unknown = value.unknown ? ` · 미기재 ${value.unknown}` : "";
  return `남 ${value.male} · 여 ${value.female}${unknown}`;
}

function groupLabel(value: string) {
  return GROUPS.find((item) => item.key === value)?.label ?? value;
}

function currentGroupLabel(row: OpsRow) {
  if (row.outreach_status === "available") return "확정";
  if (row.outreach_status === "unavailable") return "진행불가";
  return groupLabel(row.group_key);
}

function statusClass(value: string) {
  if (value === "available") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "unavailable") return "border-red-200 bg-red-50 text-red-700";
  if (value === "no_answer") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function attendanceClass(value: string) {
  if (value === "checked_in") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "no_show") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function onsiteClass(value: string) {
  if (value === "finalist") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "hold") return "border-sky-200 bg-sky-50 text-sky-700";
  if (value === "eliminated") return "border-red-200 bg-red-50 text-red-700";
  if (value === "watching") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function contactHref(kind: "phone" | "instagram" | "email", value: string) {
  if (kind === "phone") return `tel:${value.replace(/[^\d+]/g, "")}`;
  if (kind === "instagram") return `https://instagram.com/${value.replace(/^@/, "")}`;
  return `mailto:${value}`;
}

function updatedText(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isHeld(row: OpsRow) {
  return row.app_status === "pending";
}

function isOnsiteCandidate(row: OpsRow) {
  return row.outreach_status === "available" || Boolean(row.bib_code);
}

function isScheduleBlocked(row: OpsRow) {
  if (row.outreach_status === "available") return false;
  return row.availability_status === "cannot" || row.outreach_status === "unavailable";
}

function clientViewMatches(row: OpsRow, view: ClientViewKey) {
  if (view === "held_all") return isHeld(row);
  if (view === "held_male") return isHeld(row) && row.gender === "male";
  if (view === "schedule_blocked") return isScheduleBlocked(row);
  if (view === "schedule_blocked_male") return isScheduleBlocked(row) && row.gender === "male";
  return true;
}

function classificationLabel(row: OpsRow) {
  const labels = [];
  if (isHeld(row)) labels.push("보류");
  if (isScheduleBlocked(row)) labels.push("일정불가/진행불가");
  if (row.availability_status === "unknown" || row.availability_status === "unknown_partial") {
    labels.push("일정미확인");
  }
  return labels.join(" · ");
}

function profileHref(row: OpsRow) {
  if (!row.dancer_id) return null;
  return `/d/${row.dancer_slug ?? row.dancer_id}`;
}

function compactList(values: string[] | null | undefined) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function normalizeSearchValue(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function rowSearchText(row: OpsRow, includeBib = false) {
  return [
    includeBib ? row.bib_code ?? "" : "",
    row.name ?? "",
    row.dancer_korean_name ?? "",
    row.project_code ?? "",
    row.phone ?? "",
    digitsOnly(row.phone),
    row.instagram ?? "",
    row.email ?? "",
  ].join(" ");
}

function rowMatchesQuery(row: OpsRow, query: string, includeBib = false) {
  const q = normalizeSearchValue(query.trim());
  if (!q) return true;
  return normalizeSearchValue(rowSearchText(row, includeBib)).includes(q);
}

function bibSortValue(value: string | null) {
  if (!value) return 99999;
  const match = /^([A-Z])-([0-9]+)$/.exec(value);
  if (!match) return 99998;
  return (match[1].charCodeAt(0) - 65) * 100 + Number(match[2]);
}

function findRowByScanValue(rows: OpsRow[], rawValue: string) {
  const candidates = extractNdolQrCandidates(rawValue).map((value) => value.toLowerCase());
  if (candidates.length === 0) return null;

  return (
    rows.find((row) => {
      const values = [
        row.id,
        row.bib_code ?? "",
        row.name ?? "",
        row.dancer_korean_name ?? "",
        row.dancer_id ?? "",
      ].map((value) => value.toLowerCase());
      return candidates.some((candidate) => values.includes(candidate));
    }) ?? null
  );
}

function testQrLabel(rawValue: string) {
  const candidates = extractNdolQrCandidates(rawValue).map((value) => value.toUpperCase());
  if (candidates.includes("TEST:ODH")) return "ODH 테스트";
  if (candidates.includes("TEST:HS")) return "HS 테스트";
  return null;
}

export function OpsBoardClient({
  token,
  applicantSummary,
}: {
  token: string;
  applicantSummary?: ApplicantSummary | null;
}) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const applicantStats = applicantSummary ?? EMPTY_APPLICANT_SUMMARY;
  const [rows, setRows] = useState<OpsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<OpsRow | null>(null);
  const [mode, setMode] = useState<OpsMode>("contact");
  const [clientView, setClientView] = useState<ClientViewKey>("ops");
  const [manager, setManager] = useState<ManagerKey>("all");
  const [group, setGroup] = useState<GroupKey>("all");
  const [gender, setGender] = useState<GenderKey>("all");
  const [status, setStatus] = useState<OutreachStatus | "all">("all");
  const [attendance, setAttendance] = useState<AttendanceStatus | "all">("all");
  const [onsite, setOnsite] = useState<OnsiteStatus | "all">("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "onsite") {
      setMode("onsite");
    }
  }, []);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const { data, error: rpcError } = await supabase.rpc(
      "ops_ndol_contacts_for_token_v2",
      { p_token: token },
    );

    if (rpcError) {
      setError("운영판을 불러오지 못했습니다.");
      if (!silent) toast.error(rpcError.message);
    } else {
      const nextRows = (data ?? []) as OpsRow[];
      setRows(nextRows);
      setError(nextRows.length === 0 ? "링크가 잘못되었거나 데이터가 없습니다." : null);
      setLastLoadedAt(new Date());
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 7000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.outreach_status] += 1;
        acc[row.group_key] += 1;
        if (row.outreach_status === "available") {
          if (row.gender === "male") acc.availableMale += 1;
          else if (row.gender === "female") acc.availableFemale += 1;
          else acc.availableUnknown += 1;
        }
        if (row.manager_key === "baw") acc.baw += 1;
        if (row.manager_key === "hs") acc.hs += 1;
        if (isHeld(row)) acc.heldAll += 1;
        if (isHeld(row) && row.gender === "male") acc.heldMale += 1;
        if (isScheduleBlocked(row)) acc.scheduleBlocked += 1;
        if (isScheduleBlocked(row) && row.gender === "male") acc.scheduleBlockedMale += 1;
        if (isOnsiteCandidate(row)) {
          acc.onsiteTotal += 1;
          if (row.bib_code) acc.bibAssigned += 1;
          acc[row.attendance_status ?? "not_arrived"] += 1;
          acc[row.onsite_status ?? "waiting"] += 1;
        }
        return acc;
      },
      {
        total: 0,
        pending: 0,
        no_answer: 0,
        unavailable: 0,
        available: 0,
        availableMale: 0,
        availableFemale: 0,
        availableUnknown: 0,
        confirmed: 0,
        accepted_unknown: 0,
        pending_unknown: 0,
        recovery: 0,
        baw: 0,
        hs: 0,
        heldAll: 0,
        heldMale: 0,
        scheduleBlocked: 0,
        scheduleBlockedMale: 0,
        onsiteTotal: 0,
        bibAssigned: 0,
        not_arrived: 0,
        checked_in: 0,
        no_show: 0,
        waiting: 0,
        watching: 0,
        hold: 0,
        eliminated: 0,
        finalist: 0,
      },
    );
  }, [rows]);

  const target70Gap = Math.max(0, 70 - stats.available);
  const target80Gap = Math.max(0, 80 - stats.available);
  const male40Gap = Math.max(0, 40 - stats.availableMale);
  const totalApplications = applicantStats.totalApplications || stats.total;
  const uniqueApplicants = applicantStats.uniqueApplicants || stats.total;
  const scheduleBlockedTotal = applicantStats.scheduleBlocked.total || stats.scheduleBlocked;

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (!clientViewMatches(row, clientView)) return false;
      if (manager !== "all" && row.manager_key !== manager) return false;
      if (group !== "all" && row.group_key !== group) return false;
      if (gender !== "all" && row.gender !== gender) return false;
      if (status !== "all" && row.outreach_status !== status) return false;
      if (!rowMatchesQuery(row, query)) return false;
      return true;
    });
  }, [clientView, gender, group, manager, query, rows, status]);

  const sections = useMemo(() => {
    return (["baw", "hs"] as const)
      .map((key) => ({
        key,
        label: key === "baw" ? "BAW(김주성)" : "HS(정현수)",
        rows: filtered.filter((row) => row.manager_key === key),
      }))
      .filter((section) => manager === "all" || section.key === manager);
  }, [filtered, manager]);

  const onsiteRows = useMemo(() => {
    return rows
      .filter((row) => {
        if (!isOnsiteCandidate(row)) return false;
        if (manager !== "all" && row.manager_key !== manager) return false;
        if (gender !== "all" && row.gender !== gender) return false;
        if (attendance !== "all" && (row.attendance_status ?? "not_arrived") !== attendance) {
          return false;
        }
        if (onsite !== "all" && (row.onsite_status ?? "waiting") !== onsite) return false;
        if (!rowMatchesQuery(row, query, true)) return false;
        return true;
      })
      .sort((a, b) => bibSortValue(a.bib_code) - bibSortValue(b.bib_code));
  }, [attendance, gender, manager, onsite, query, rows]);

  async function updateRow(
    row: OpsRow,
    nextStatus: OutreachStatus,
    note = row.note ?? "",
    nextGender: Exclude<GenderKey, "all"> = row.gender,
  ) {
    setUpdating((prev) => ({ ...prev, [row.id]: true }));
    const previous = rows;
    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              outreach_status: nextStatus,
              gender: nextGender,
              note,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    );

    const { data, error: rpcError } = await supabase.rpc(
      "update_ops_ndol_contact",
      {
        p_token: token,
        p_id: row.id,
        p_outreach_status: nextStatus,
        p_note: note,
        p_gender: nextGender,
      },
    );

    if (rpcError || !data?.length) {
      setRows(previous);
      toast.error(rpcError?.message ?? "상태 저장에 실패했습니다.");
    } else {
      const saved = data[0] as Pick<
        OpsRow,
        "id" | "outreach_status" | "gender" | "note" | "updated_at"
      >;
      setRows((prev) =>
        prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
      );
    }
    setUpdating((prev) => ({ ...prev, [row.id]: false }));
  }

  function patchNote(id: string, note: string) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, note } : row)));
  }

  async function updateOnsiteRow(
    row: OpsRow,
    nextAttendance: AttendanceStatus = row.attendance_status ?? "not_arrived",
    nextOnsite: OnsiteStatus = row.onsite_status ?? "waiting",
    nextNote = row.onsite_note ?? "",
  ) {
    setUpdating((prev) => ({ ...prev, [row.id]: true }));
    const previous = rows;
    const nextTimestamp = new Date().toISOString();
    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? {
              ...item,
              attendance_status: nextAttendance,
              onsite_status: nextOnsite,
              onsite_note: nextNote,
              checked_in_at: nextAttendance === "checked_in" ? item.checked_in_at ?? nextTimestamp : null,
              eliminated_at: nextOnsite === "eliminated" ? item.eliminated_at ?? nextTimestamp : null,
              updated_at: nextTimestamp,
            }
          : item,
      ),
    );

    const { data, error: rpcError } = await supabase.rpc(
      "update_ops_ndol_onsite_contact",
      {
        p_token: token,
        p_id: row.id,
        p_attendance_status: nextAttendance,
        p_onsite_status: nextOnsite,
        p_onsite_note: nextNote,
      },
    );

    if (rpcError || !data?.length) {
      setRows(previous);
      toast.error(rpcError?.message ?? "현장 상태 저장에 실패했습니다.");
    } else {
      const saved = data[0] as Pick<
        OpsRow,
        | "id"
        | "attendance_status"
        | "onsite_status"
        | "onsite_note"
        | "checked_in_at"
        | "eliminated_at"
        | "updated_at"
      >;
      setRows((prev) =>
        prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
      );
    }
    setUpdating((prev) => ({ ...prev, [row.id]: false }));
  }

  function patchOnsiteNote(id: string, onsiteNote: string) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, onsite_note: onsiteNote } : row)),
    );
  }

  function clientViewCount(key: ClientViewKey) {
    if (key === "held_all") return stats.heldAll;
    if (key === "held_male") return stats.heldMale;
    if (key === "schedule_blocked") return stats.scheduleBlocked;
    if (key === "schedule_blocked_male") return stats.scheduleBlockedMale;
    return stats.total;
  }

  function changeClientView(nextView: ClientViewKey) {
    setClientView(nextView);
    setManager("all");
    setGroup("all");
    setGender("all");
    setStatus("all");
    setQuery("");
  }

  function changeMode(nextMode: OpsMode) {
    setMode(nextMode);
    setQuery("");

    const url = new URL(window.location.href);
    if (nextMode === "onsite") {
      url.searchParams.set("mode", "onsite");
    } else {
      url.searchParams.delete("mode");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openScheduleRecoveryView() {
    setMode("contact");
    setClientView("schedule_blocked");
    setManager("all");
    setGroup("all");
    setStatus("all");

    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <main className="min-h-svh bg-[#f7f7f4] text-[#17140f]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 lg:px-6 lg:py-5">
        <header className="flex flex-col gap-3 border-b border-black/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
              NDOL 2026.06.18
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
              {mode === "onsite" ? "현장 운영판" : "연락 운영판"}
            </h1>
            <p className="mt-1 text-sm text-black/55">
              {mode === "onsite"
                ? "번호표, 출석, 현장 판정, 탈락/최종후보 상태를 번호 기준으로 관리합니다."
                : "BAW(김주성)는 ndol02, HS(정현수)는 ndol26·ndolsm·ndolbd 및 추가 섭외 확인자를 담당합니다."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-black/50">
            <span>갱신 {lastLoadedAt ? updatedText(lastLoadedAt.toISOString()) : "-"}</span>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 font-medium text-black/70 hover:bg-black/5"
            >
              <RefreshCw size={14} />
              새로고침
            </button>
          </div>
        </header>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
          <Stat label="총 지원" value={totalApplications} />
          <Stat label="고유 지원자" value={uniqueApplicants} />
          <Stat label="통과" value={applicantStats.accepted.total} tone="ok" />
          <Stat label="보류" value={applicantStats.pending.total} />
          <Stat label="드롭" value={applicantStats.dropped.total} tone="bad" />
          <Stat label="일정불가" value={scheduleBlockedTotal} tone="bad" />
          <Stat label="진행가능" value={stats.available} tone="ok" />
          <Stat label="가능 남" value={stats.availableMale} tone="ok" />
          <Stat label="가능 여" value={stats.availableFemale} tone="ok" />
          <Stat label="운영 대상" value={stats.total} />
        </section>

        <section className="grid gap-2 sm:grid-cols-2">
          {[
            { key: "contact" as const, label: "연락 운영", desc: "발송·연락·가능 여부 관리" },
            { key: "onsite" as const, label: "현장 운영", desc: "번호표·출석·탈락 관리" },
          ].map((item) => {
            const active = mode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => changeMode(item.key)}
                className={`border px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white text-black hover:bg-black/[0.03]"
                }`}
              >
                <span className="block text-lg font-extrabold">{item.label}</span>
                <span className="mt-1 block text-xs text-current/60">{item.desc}</span>
              </button>
            );
          })}
        </section>

        {mode === "contact" ? (
          <>
        <section className="border border-black/10 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
                지원자 전체 현황
              </p>
              <h2 className="mt-1 text-lg font-bold">
                NDOL 남자아이돌 모집 퍼널
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-black/55">
                클라이언트 미팅에서 전체 지원 규모와 내부 검토 후 드롭된 인원을 함께 설명하기 위한 요약입니다.
                연락처와 사용자 ID는 표시하지 않습니다.
              </p>
            </div>
            <span className="w-fit rounded-full border border-black/10 bg-[#f7f7f4] px-2.5 py-1 text-[11px] font-bold text-black/55">
              지원 건 기준 · 고유 지원자 {uniqueApplicants}명
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryMetric
              label="총 지원"
              value={`${totalApplications}건`}
              sub={`${breakdownText(applicantStats.total)} · 고유 ${uniqueApplicants}명`}
            />
            <SummaryMetric
              label="통과"
              value={`${applicantStats.accepted.total}명`}
              sub={breakdownText(applicantStats.accepted)}
              tone="ok"
            />
            <SummaryMetric
              label="보류"
              value={`${applicantStats.pending.total}명`}
              sub={breakdownText(applicantStats.pending)}
            />
            <SummaryMetric
              label="드롭"
              value={`${applicantStats.dropped.total}명`}
              sub={breakdownText(applicantStats.dropped)}
              tone="bad"
            />
            <SummaryMetric
              label="일정불가"
              value={`${scheduleBlockedTotal}명`}
              sub={breakdownText(applicantStats.scheduleBlocked)}
              tone="bad"
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="min-w-0 border-t border-black/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold">프로젝트별 지원 현황</h3>
                <span className="text-xs text-black/45">총 / 통과 / 보류 / 드롭</span>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/10 text-[11px] uppercase tracking-[0.12em] text-black/40">
                      <th className="py-2 pr-3 font-semibold">프로젝트</th>
                      <th className="px-3 py-2 font-semibold">총 지원</th>
                      <th className="px-3 py-2 font-semibold">통과</th>
                      <th className="px-3 py-2 font-semibold">보류</th>
                      <th className="px-3 py-2 font-semibold">드롭</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {applicantStats.projects.map((project) => (
                      <tr key={project.code}>
                        <td className="py-2 pr-3">
                          <div className="font-bold">{project.code}</div>
                          {project.title ? (
                            <div className="mt-0.5 max-w-[220px] truncate text-xs text-black/45">
                              {project.title}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{project.total.total}</div>
                          <div className="text-xs text-black/40">{breakdownText(project.total)}</div>
                        </td>
                        <td className="px-3 py-2 text-emerald-700">
                          <div className="font-semibold">{project.accepted.total}</div>
                          <div className="text-xs text-emerald-700/60">
                            {breakdownText(project.accepted)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-semibold">{project.pending.total}</div>
                          <div className="text-xs text-black/40">{breakdownText(project.pending)}</div>
                        </td>
                        <td className="px-3 py-2 text-red-700">
                          <div className="font-semibold">{project.dropped.total}</div>
                          <div className="text-xs text-red-700/60">
                            {breakdownText(project.dropped)}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {applicantStats.projects.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-black/45">
                          지원자 전체 집계를 불러오지 못했습니다.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-w-0 border-t border-black/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold">드롭 명단</h3>
                <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
                  {applicantStats.droppedApplicants.length}명
                </span>
              </div>
              <div className="mt-2 max-h-[360px] overflow-auto border border-black/10">
                {applicantStats.droppedApplicants.length ? (
                  <div className="divide-y divide-black/5">
                    {applicantStats.droppedApplicants.map((item) => (
                      <div key={item.key} className="flex gap-3 p-3">
                        <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md bg-black/10">
                          {item.profileImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.profileImg}
                              alt={`${item.name} 프로필`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-sm font-extrabold text-black/35">
                              {item.name.slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-bold">{item.name}</span>
                            <span className="rounded-full border border-black/10 bg-[#f7f7f4] px-2 py-0.5 text-[11px] font-semibold text-black/55">
                              {genderLabel(item.gender)}
                            </span>
                            <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              {item.statusLabel}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-black/45">
                            {item.projectCode}
                            {item.genres.length ? ` · ${item.genres.slice(0, 3).join(", ")}` : ""}
                          </div>
                          {item.reason ? (
                            <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-black/45">
                              사유: {item.reason}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-24 items-center justify-center px-4 text-center text-sm text-black/45">
                    드롭 처리된 지원자가 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.05fr_1fr]">
          <div className="border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
                  상황 요약
                </p>
                <h2 className="mt-1 text-lg font-bold">
                  6/18 16:00-21:00 필참 인원 확보 현황
                </h2>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                라이브 반영
              </span>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric
                label="현재 진행가능"
                value={`${stats.available}명`}
                sub={`남 ${stats.availableMale} · 여 ${stats.availableFemale}${
                  stats.availableUnknown ? ` · 미기재 ${stats.availableUnknown}` : ""
                }`}
                tone="ok"
              />
              <SummaryMetric
                label="70명 목표 부족"
                value={`${target70Gap}명`}
                sub="최소 현장 운영 기준"
                tone={target70Gap === 0 ? "ok" : "warn"}
              />
              <SummaryMetric
                label="80명 목표 부족"
                value={`${target80Gap}명`}
                sub="상한 목표 기준"
                tone={target80Gap === 0 ? "ok" : "warn"}
              />
              <SummaryMetric
                label="남성 40명 목표 부족"
                value={`${male40Gap}명`}
                sub="남성 우선 확보 기준"
                tone={male40Gap === 0 ? "ok" : "warn"}
              />
            </div>
            <div className="mt-4 border-l-4 border-black bg-[#f7f7f4] px-3 py-2 text-sm leading-relaxed text-black/70">
              <b className="text-black">운영 목표:</b> 6/18 15:50 도착, 16:00-21:00
              전체 참석 가능한 인원을 총 70~80명까지 확보합니다. 남성은 실력 승인자를
              최우선으로 최대 40명까지 확보하고, 부족분은 여성 가능자로 채웁니다.
            </div>
            <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-black/65">
              <li>
                확정자는 이미 출석 여부와 시간 공지가 된 인원이며, 드롭다운 상태가
                <b className="text-black"> 진행가능</b>인 사람이 실제 확보 인원입니다.
              </li>
              <li>
                미처리 대상은 {stats.pending}명입니다. 이 중 일정확인 1순위{" "}
                {stats.accepted_unknown}명을 먼저 연락하고, 부족하면 예비{" "}
                {stats.pending_unknown}명으로 확장합니다.
              </li>
              <li>
                회신 모니터링 {stats.recovery}명은 기존에 16:00-21:00 불가로 분류된
                후보입니다. 일정 조정 가능 회신이 오면 진행가능으로 되살릴 수 있습니다.
              </li>
              <li>
                현재 기준으로 70명까지 {target70Gap}명, 80명까지 {target80Gap}명,
                남성 40명까지 {male40Gap}명이 더 필요합니다.
              </li>
            </ul>
          </div>

          <div className="border border-black/10 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
              처리 기준
            </p>
            <h2 className="mt-1 text-lg font-bold">연락 담당자 행동 기준</h2>
            <ol className="mt-4 space-y-2 text-sm leading-relaxed text-black/65">
              <li>
                <b className="text-black">1. 담당 기준:</b> BAW(김주성)는 ndol02,
                HS(정현수)는 ndol26·ndolsm·ndolbd와 추가 섭외 인원을 담당합니다.
              </li>
              <li>
                <b className="text-black">2. 연락 순서:</b> 필터에서 미처리와 남성을
                우선 확인합니다. 남성이 부족하면 여성 후보로 총 70~80명을 맞춥니다.
              </li>
              <li>
                <b className="text-black">3. 확인 문장:</b> "내일 6/18 15:50까지
                도착하고, 16:00-21:00 전체 참석 가능하실까요?"를 반드시 확인합니다.
              </li>
              <li>
                <b className="text-black">4. 판정 기준:</b> 부분 참석이 아니라
                16:00-21:00 전체 가능해야 진행가능입니다. 시간 조정 가능성이 있으면
                메모에 남기고 회신 기준으로 다시 판단합니다.
              </li>
              <li>
                <b className="text-black">5. 기록 방식:</b> 연락 직후 상태 드롭다운을
                바꾸고, 특이사항은 메모에 남깁니다. 저장된 상태는 모두에게 자동 갱신됩니다.
              </li>
              <li>
                <b className="text-black">6. 성별 정정:</b> 성별이 잘못 보이면 표의 성별
                드롭다운에서 바로 수정합니다. 상단 남녀 수치에 즉시 반영됩니다.
              </li>
            </ol>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <StatusGuide label="미처리" desc="아직 연락 전이거나 결과가 확정되지 않은 상태" />
              <StatusGuide label="연락안받음" desc="전화/DM/메일 시도했으나 응답이 없는 상태" />
              <StatusGuide label="진행불가" desc="16:00-21:00 전체 참석이 불가능한 상태" />
              <StatusGuide label="진행가능" desc="6/18 15:50 도착 및 16:00-21:00 참석 가능" />
            </div>
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {CLIENT_VIEWS.map((item) => {
            const active = clientView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => changeClientView(item.key)}
                className={`border px-3 py-3 text-left transition-colors ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-black/10 bg-white text-black hover:bg-black/[0.03]"
                }`}
              >
                <span className="block text-xs font-semibold text-current/55">
                  회의용 보기
                </span>
                <span className="mt-1 flex items-end justify-between gap-2">
                  <span className="text-base font-extrabold">{item.label}</span>
                  <span className="text-2xl font-extrabold">{clientViewCount(item.key)}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-current/60">
                  {item.desc}
                </span>
              </button>
            );
          })}
        </section>

        <section className="sticky top-0 z-20 flex flex-col gap-2 border border-black/10 bg-[#f7f7f4]/95 p-2 backdrop-blur lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-black/35"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름, 프로젝트, 연락처 검색"
              className="h-9 w-full rounded-lg border border-black/10 bg-white pl-8 pr-3 text-sm outline-none focus:border-black/30"
            />
          </div>
          <FilterGroup items={MANAGERS} value={manager} onChange={setManager} />
          <FilterGroup items={GROUPS} value={group} onChange={setGroup} />
          <FilterGroup items={GENDERS} value={gender} onChange={setGender} />
          <FilterGroup items={STATUSES} value={status} onChange={setStatus} />
        </section>

        {error ? (
          <div className="border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="border border-black/10 bg-white p-8 text-center text-sm text-black/50">
            불러오는 중입니다.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {sections.map((section) => (
              <section key={section.key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">{section.label}</h2>
                  <span className="text-sm text-black/50">{section.rows.length}명</span>
                </div>
                <div className="overflow-x-auto border border-black/10 bg-white">
                  <table className="w-full min-w-[1180px] border-collapse text-sm">
                    <thead className="bg-black/[0.03] text-left text-xs text-black/50">
                      <tr>
                        <th className="w-12 px-3 py-2">#</th>
                        <th className="px-3 py-2">이름</th>
                        <th className="px-3 py-2">프로젝트</th>
                        <th className="px-3 py-2">구분</th>
                        <th className="px-3 py-2">성별</th>
                        <th className="px-3 py-2">연락처</th>
                        <th className="px-3 py-2">상태</th>
                        <th className="px-3 py-2">메모</th>
                        <th className="w-20 px-3 py-2">수정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-black/45">
                            조건에 맞는 대상이 없습니다.
                          </td>
                        </tr>
                      ) : (
                        section.rows.map((row, index) => (
                          <tr key={row.id} className="border-t border-black/5 align-top">
                            <td className="px-3 py-2 text-right text-xs text-black/35">
                              {index + 1}
                            </td>
                            <td className="px-3 py-2">
                              {row.dancer_id ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedProfile(row)}
                                  className="max-w-[170px] truncate text-left font-semibold underline decoration-black/20 underline-offset-4 transition-colors hover:text-black hover:decoration-black"
                                  aria-label={`${row.name || "대상"} 프로필 보기`}
                                >
                                  {row.name || ""}
                                </button>
                              ) : (
                                <div className="font-semibold">{row.name || ""}</div>
                              )}
                              {row.dancer_korean_name && row.dancer_korean_name !== row.name ? (
                                <div className="mt-0.5 text-xs font-medium text-black/45">
                                  {row.dancer_korean_name}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              {row.project_href ? (
                                <a
                                  href={row.project_href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                                >
                                  {row.project_code}
                                  <ExternalLink size={12} />
                                </a>
                              ) : (
                                <span className="font-semibold">{row.project_code}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-black/60">
                              <div>{currentGroupLabel(row)}</div>
                              {classificationLabel(row) ? (
                                <div className="mt-1 font-semibold text-black/40">
                                  {classificationLabel(row)}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.gender}
                                disabled={updating[row.id]}
                                onChange={(event) =>
                                  updateRow(
                                    row,
                                    row.outreach_status,
                                    row.note ?? "",
                                    event.target.value as Exclude<GenderKey, "all">,
                                  )
                                }
                                aria-label={`${row.name || "대상"} 성별 변경`}
                                className="h-8 w-24 rounded-full border border-black/10 bg-white px-2.5 text-xs font-semibold text-black/65 outline-none transition-colors disabled:opacity-50"
                              >
                                <option value="male">남</option>
                                <option value="female">여</option>
                                <option value="unknown">미기재</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <ContactLinks row={row} />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={row.outreach_status}
                                disabled={updating[row.id]}
                                onChange={(event) =>
                                  updateRow(row, event.target.value as OutreachStatus)
                                }
                                aria-label={`${row.name || "대상"} 상태 변경`}
                                className={`h-8 w-32 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors disabled:opacity-50 ${statusClass(row.outreach_status)}`}
                              >
                                <option value="pending">미처리</option>
                                <option value="no_answer">연락안받음</option>
                                <option value="unavailable">진행불가</option>
                                <option value="available">진행가능</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={row.note ?? ""}
                                onChange={(event) => patchNote(row.id, event.target.value)}
                                onBlur={(event) =>
                                  updateRow(row, row.outreach_status, event.target.value)
                                }
                                className="h-8 w-full rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-black/30"
                                placeholder="메모"
                              />
                            </td>
                            <td className="px-3 py-2 text-xs text-black/45">
                              {updatedText(row.updated_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
          </>
        ) : (
          <OnsiteBoard
            rows={onsiteRows}
            scannerRows={rows.filter(isOnsiteCandidate)}
            stats={stats}
            labelsHref={`/ops/ndol-20260618/${token}/labels`}
            passesHref={`/ops/ndol-20260618/${token}/passes`}
            selfPassPosterHref="/ndol/20260618/pass/poster"
            manager={manager}
            setManager={setManager}
            gender={gender}
            setGender={setGender}
            attendance={attendance}
            setAttendance={setAttendance}
            onsite={onsite}
            setOnsite={setOnsite}
            query={query}
            setQuery={setQuery}
            updating={updating}
            updateOnsiteRow={updateOnsiteRow}
            patchOnsiteNote={patchOnsiteNote}
            setSelectedProfile={setSelectedProfile}
            openScheduleRecoveryView={openScheduleRecoveryView}
          />
        )}
      </div>
      <ProfilePreviewSheet
        row={selectedProfile}
        open={Boolean(selectedProfile)}
        onOpenChange={(open) => {
          if (!open) setSelectedProfile(null);
        }}
      />
    </main>
  );
}

function QrCheckInPanel({
  rows,
  updating,
  updateOnsiteRow,
  setQuery,
  setSelectedProfile,
}: {
  rows: OpsRow[];
  updating: Record<string, boolean>;
  updateOnsiteRow: (
    row: OpsRow,
    nextAttendance?: AttendanceStatus,
    nextOnsite?: OnsiteStatus,
    nextNote?: string,
  ) => Promise<void>;
  setQuery: (value: string) => void;
  setSelectedProfile: (row: OpsRow) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const rowsRef = useRef(rows);
  const updateRef = useRef(updateOnsiteRow);
  const lastScanRef = useRef({ value: "", at: 0 });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraState, setCameraState] = useState<"idle" | "starting" | "scanning" | "error">(
    "idle",
  );
  const [manualValue, setManualValue] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    row?: OpsRow;
    testLabel?: string;
    message: string;
    at: string;
  } | null>(null);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    updateRef.current = updateOnsiteRow;
  }, [updateOnsiteRow]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraState("idle");
  }, []);

  const handleScanValue = useCallback(
    async (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return;

      const now = Date.now();
      if (lastScanRef.current.value === value && now - lastScanRef.current.at < 2000) {
        return;
      }
      lastScanRef.current = { value, at: now };

      const testLabel = testQrLabel(value);
      if (testLabel) {
        setScanError(null);
        setLastResult({
          testLabel,
          message: "테스트 QR 정상 인식",
          at: new Date().toISOString(),
        });
        toast.success(`${testLabel} QR 정상 인식`);
        navigator.vibrate?.(80);
        return;
      }

      const row = findRowByScanValue(rowsRef.current, value);
      if (!row) {
        setScanError("운영판 명단에서 QR 대상을 찾지 못했습니다.");
        toast.error("QR 대상을 찾지 못했습니다.");
        return;
      }

      setScanError(null);
      setQuery(row.bib_code ?? row.name ?? "");

      const attendanceValue = row.attendance_status ?? "not_arrived";
      const onsiteValue = row.onsite_status ?? "waiting";
      if (attendanceValue !== "checked_in") {
        await updateRef.current(row, "checked_in", onsiteValue, row.onsite_note ?? "");
      }

      const message =
        attendanceValue === "checked_in" ? "이미 출석 처리된 인원입니다." : "출석 처리 완료";
      setLastResult({ row, message, at: new Date().toISOString() });
      toast.success(`${row.bib_code ?? "미배정"} ${row.name || ""} ${message}`);
      navigator.vibrate?.(80);
    },
    [setQuery],
  );

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return;
    }

    let cancelled = false;

    async function startScanner() {
      setCameraState("starting");
      setScanError(null);

      try {
        const video = videoRef.current;
        if (!video) return;

        const devices = await BrowserCodeReader.listVideoInputDevices().catch(() => []);
        const backCamera =
          devices.find((device) => /back|rear|environment|후면/i.test(device.label)) ??
          devices[devices.length - 1];
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(
          backCamera?.deviceId,
          video,
          (result) => {
            const text = result?.getText();
            if (text) void handleScanValue(text);
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setCameraState("scanning");
      } catch {
        setCameraState("error");
        setScanError("카메라를 열지 못했습니다. 권한을 허용하거나 아래 수동 입력을 사용해주세요.");
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [handleScanValue, scannerOpen, stopScanner]);

  return (
    <div className="border border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
            QR 체크인
          </p>
          <h2 className="mt-1 text-lg font-bold">스캔 즉시 출석 처리</h2>
          <p className="mt-2 text-sm leading-relaxed text-black/60">
            참석자 QR을 스캔하면 번호표와 이름을 확인하고 출석 상태를 저장합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setScannerOpen((value) => !value)}
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold ${
            scannerOpen
              ? "border border-black/10 bg-white text-black/70 hover:bg-black/5"
              : "bg-black text-white hover:bg-black/80"
          }`}
        >
          {scannerOpen ? <X size={15} /> : <Camera size={15} />}
          {scannerOpen ? "닫기" : "스캔 시작"}
        </button>
      </div>

      {scannerOpen ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-black bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            className="aspect-[4/3] w-full object-cover"
          />
          <div className="border-t border-white/15 px-3 py-2 text-xs font-semibold text-white/70">
            {cameraState === "starting"
              ? "카메라 준비 중"
              : cameraState === "scanning"
                ? "QR을 화면 중앙에 맞춰주세요"
                : cameraState === "error"
                  ? "카메라 사용 불가"
                  : "대기 중"}
          </div>
        </div>
      ) : null}

      {scanError ? (
        <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {scanError}
        </div>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void handleScanValue(manualValue);
          setManualValue("");
        }}
      >
        <input
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          placeholder="QR 문자열, 번호표(A-01), 이름 입력"
          className="h-10 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-black/30"
        />
        <button
          type="submit"
          className="h-10 shrink-0 rounded-lg border border-black/10 bg-[#f7f7f4] px-3 text-xs font-bold text-black/70 hover:bg-black/5"
        >
          확인
        </button>
      </form>

      {lastResult ? (
        <div className="mt-3 border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-700" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-black px-2 py-1 text-sm font-extrabold text-white">
                  {lastResult.row?.bib_code ?? "TEST"}
                </span>
                <span className="font-extrabold text-emerald-900">
                  {lastResult.row?.name || lastResult.testLabel || "이름 없음"}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-emerald-800/75">
                {lastResult.message} · {updatedText(lastResult.at)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lastResult.row ? (
                  <button
                    type="button"
                    onClick={() => setSelectedProfile(lastResult.row!)}
                    className="h-8 rounded-lg border border-emerald-700/20 bg-white px-2.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100/60"
                  >
                    프로필 보기
                  </button>
                ) : null}
                <span className="inline-flex h-8 items-center rounded-lg border border-emerald-700/20 bg-white px-2.5 text-xs font-bold text-emerald-800">
                  {lastResult.row
                    ? `${genderLabel(lastResult.row.gender)} · ${lastResult.row.project_code}`
                    : "실제 출석/번호표에는 반영되지 않습니다."}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {Object.values(updating).some(Boolean) ? (
        <p className="mt-2 text-xs font-semibold text-black/40">저장 중입니다.</p>
      ) : null}
    </div>
  );
}

function OnsiteBoard({
  rows,
  scannerRows,
  stats,
  labelsHref,
  passesHref,
  selfPassPosterHref,
  manager,
  setManager,
  gender,
  setGender,
  attendance,
  setAttendance,
  onsite,
  setOnsite,
  query,
  setQuery,
  updating,
  updateOnsiteRow,
  patchOnsiteNote,
  setSelectedProfile,
  openScheduleRecoveryView,
}: {
  rows: OpsRow[];
  scannerRows: OpsRow[];
  stats: {
    onsiteTotal: number;
    bibAssigned: number;
    checked_in: number;
    not_arrived: number;
    no_show: number;
    waiting: number;
    watching: number;
    hold: number;
    eliminated: number;
    finalist: number;
  };
  labelsHref: string;
  passesHref: string;
  selfPassPosterHref: string;
  manager: ManagerKey;
  setManager: (value: ManagerKey) => void;
  gender: GenderKey;
  setGender: (value: GenderKey) => void;
  attendance: AttendanceStatus | "all";
  setAttendance: (value: AttendanceStatus | "all") => void;
  onsite: OnsiteStatus | "all";
  setOnsite: (value: OnsiteStatus | "all") => void;
  query: string;
  setQuery: (value: string) => void;
  updating: Record<string, boolean>;
  updateOnsiteRow: (
    row: OpsRow,
    nextAttendance?: AttendanceStatus,
    nextOnsite?: OnsiteStatus,
    nextNote?: string,
  ) => Promise<void>;
  patchOnsiteNote: (id: string, onsiteNote: string) => void;
  setSelectedProfile: (row: OpsRow) => void;
  openScheduleRecoveryView: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Stat label="번호표" value={stats.bibAssigned} tone="ok" />
        <Stat label="출석" value={stats.checked_in} tone="ok" />
        <Stat label="미도착" value={stats.not_arrived} />
        <Stat label="노쇼" value={stats.no_show} tone="bad" />
        <Stat label="대기" value={stats.waiting} />
        <Stat label="보류" value={stats.hold} />
        <Stat label="탈락" value={stats.eliminated} tone="bad" />
        <Stat label="최종후보" value={stats.finalist} tone="ok" />
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.1fr_0.95fr_0.95fr]">
        <QrCheckInPanel
          rows={scannerRows}
          updating={updating}
          updateOnsiteRow={updateOnsiteRow}
          setQuery={setQuery}
          setSelectedProfile={setSelectedProfile}
        />
        <div className="border border-black/10 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
            현장 운영
          </p>
          <h2 className="mt-1 text-lg font-bold">번호표·출석·탈락 관리</h2>
          <p className="mt-3 text-sm leading-relaxed text-black/65">
            진행가능 인원 {stats.onsiteTotal}명에게 번호표가 배정되어 있습니다. 현장에서는
            번호표를 옷에 붙이고 운영판 번호 기준으로 호출하면 됩니다.
          </p>
          <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800">
            일정불가였던 사람은 아직 현장 명단에 보이지 않습니다. 연락 운영에서 이름을 검색한 뒤
            상태를 진행가능으로 바꾸면 번호표와 QR 대상에 자동으로 들어옵니다.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openScheduleRecoveryView}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 text-xs font-bold text-amber-900 hover:bg-amber-200"
            >
              일정불가 복구 보기
            </button>
            <a
              href={selfPassPosterHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-black px-3 text-xs font-bold text-white hover:bg-black/80"
            >
              <QrCode size={14} />
              입구 QR
            </a>
            <a
              href={passesHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-xs font-bold text-black/70 hover:bg-black/5"
            >
              <QrCode size={14} />
              전체 QR
            </a>
            <a
              href={labelsHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-xs font-bold text-black/70 hover:bg-black/5"
            >
              번호표 출력용
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
        <div className="border border-black/10 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-black/40">
            처리 기준
          </p>
          <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-black/65">
            <li><b className="text-black">1. 접수:</b> 도착하면 출석을 `출석`으로 바꿉니다.</li>
            <li><b className="text-black">2. 번호:</b> 옷에 붙인 번호표와 운영판 번호를 일치시킵니다.</li>
            <li><b className="text-black">3. 진행:</b> 클라이언트가 제외한 인원은 현장판정을 `탈락`으로 바꿉니다.</li>
            <li><b className="text-black">4. 보류:</b> 아직 판단을 미루는 인원은 `보류`, 남길 인원은 `최종후보`로 둡니다.</li>
          </ol>
        </div>
      </section>

      <section className="sticky top-0 z-20 flex flex-col gap-2 border border-black/10 bg-[#f7f7f4]/95 p-2 backdrop-blur lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-black/35"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="번호, 이름, 프로젝트, 연락처 검색"
            className="h-9 w-full rounded-lg border border-black/10 bg-white pl-8 pr-3 text-sm outline-none focus:border-black/30"
          />
        </div>
        <FilterGroup items={MANAGERS} value={manager} onChange={setManager} />
        <FilterGroup items={GENDERS} value={gender} onChange={setGender} />
        <FilterGroup items={ATTENDANCE_STATUSES} value={attendance} onChange={setAttendance} />
        <FilterGroup items={ONSITE_STATUSES} value={onsite} onChange={setOnsite} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">현장 명단</h2>
          <span className="text-sm text-black/50">{rows.length}명</span>
        </div>
        <div className="overflow-x-auto border border-black/10 bg-white">
          <table className="w-full min-w-[1220px] border-collapse text-sm">
            <thead className="bg-black/[0.03] text-left text-xs text-black/50">
              <tr>
                <th className="w-24 px-3 py-2">번호</th>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">성별</th>
                <th className="px-3 py-2">프로젝트</th>
                <th className="px-3 py-2">출석</th>
                <th className="px-3 py-2">현장판정</th>
                <th className="px-3 py-2">연락처</th>
                <th className="px-3 py-2">현장메모</th>
                <th className="w-24 px-3 py-2">체크인</th>
                <th className="w-20 px-3 py-2">수정</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-black/45">
                    조건에 맞는 현장 대상이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const attendanceValue = row.attendance_status ?? "not_arrived";
                  const onsiteValue = row.onsite_status ?? "waiting";
                  return (
                    <tr key={row.id} className="border-t border-black/5 align-top">
                      <td className="px-3 py-2">
                        <span className="inline-flex h-10 min-w-20 items-center justify-center rounded-md border border-black bg-black px-2 text-lg font-extrabold text-white">
                          {row.bib_code ?? "미배정"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.dancer_id ? (
                          <button
                            type="button"
                            onClick={() => setSelectedProfile(row)}
                            className="max-w-[180px] truncate text-left font-semibold underline decoration-black/20 underline-offset-4 transition-colors hover:text-black hover:decoration-black"
                            aria-label={`${row.name || "대상"} 프로필 보기`}
                          >
                            {row.name || ""}
                          </button>
                        ) : (
                          <div className="font-semibold">{row.name || ""}</div>
                        )}
                        {row.dancer_korean_name && row.dancer_korean_name !== row.name ? (
                          <div className="mt-0.5 text-xs font-medium text-black/45">
                            {row.dancer_korean_name}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-black/60">
                        {genderLabel(row.gender)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-semibold">{row.project_code}</div>
                        <div className="mt-1 text-xs text-black/40">{currentGroupLabel(row)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={attendanceValue}
                          disabled={updating[row.id]}
                          onChange={(event) =>
                            updateOnsiteRow(
                              row,
                              event.target.value as AttendanceStatus,
                              onsiteValue,
                              row.onsite_note ?? "",
                            )
                          }
                          aria-label={`${row.name || "대상"} 출석 변경`}
                          className={`h-8 w-28 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors disabled:opacity-50 ${attendanceClass(attendanceValue)}`}
                        >
                          <option value="not_arrived">미도착</option>
                          <option value="checked_in">출석</option>
                          <option value="no_show">노쇼</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={onsiteValue}
                          disabled={updating[row.id]}
                          onChange={(event) =>
                            updateOnsiteRow(
                              row,
                              attendanceValue,
                              event.target.value as OnsiteStatus,
                              row.onsite_note ?? "",
                            )
                          }
                          aria-label={`${row.name || "대상"} 현장판정 변경`}
                          className={`h-8 w-28 rounded-full border px-2.5 text-xs font-semibold outline-none transition-colors disabled:opacity-50 ${onsiteClass(onsiteValue)}`}
                        >
                          <option value="waiting">대기</option>
                          <option value="watching">심사중</option>
                          <option value="hold">보류</option>
                          <option value="eliminated">탈락</option>
                          <option value="finalist">최종후보</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <ContactLinks row={row} />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={row.onsite_note ?? ""}
                          onChange={(event) => patchOnsiteNote(row.id, event.target.value)}
                          onBlur={(event) =>
                            updateOnsiteRow(row, attendanceValue, onsiteValue, event.target.value)
                          }
                          className="h-8 w-full rounded-md border border-black/10 bg-white px-2 text-xs outline-none focus:border-black/30"
                          placeholder="현장 메모"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs text-black/45">
                        {updatedText(row.checked_in_at)}
                      </td>
                      <td className="px-3 py-2 text-xs text-black/45">
                        {updatedText(row.updated_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="border border-black/10 bg-white px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-extrabold ${
          tone === "ok" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProfilePreviewSheet({
  row,
  open,
  onOpenChange,
}: {
  row: OpsRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const href = row ? profileHref(row) : null;
  const genres = compactList(row?.dancer_genres);
  const specialties = compactList(row?.dancer_specialties);
  const instagram = row?.instagram ?? row?.dancer_social_links?.instagram ?? null;
  const youtube = row?.dancer_social_links?.youtube ?? null;
  const tiktok = row?.dancer_social_links?.tiktok ?? null;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="프로필 미리보기"
      className="sm:w-[560px]"
    >
      {row ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-black/10">
              {row.dancer_profile_img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={row.dancer_profile_img}
                  alt={row.name || "프로필 사진"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xl font-extrabold text-black/35">
                  {(row.name || "?").slice(0, 1)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-xl font-extrabold">{row.name || "이름 없음"}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(row.outreach_status)}`}>
                  {STATUSES.find((item) => item.key === row.outreach_status)?.label ?? row.outreach_status}
                </span>
              </div>
              {row.dancer_korean_name ? (
                <p className="mt-1 text-sm font-medium text-black/55">
                  {row.dancer_korean_name}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-black/60">
                <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-1">
                  {row.project_code}
                </span>
                <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-1">
                  {currentGroupLabel(row)}
                </span>
                <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-1">
                  {genderLabel(row.gender)}
                </span>
                {row.dancer_location ? (
                  <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-1">
                    {row.dancer_location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {row.dancer_bio ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/70">
              {row.dancer_bio}
            </p>
          ) : null}

          {genres.length || specialties.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {genres.length ? (
                <ProfileInfoBlock label="장르" values={genres} />
              ) : null}
              {specialties.length ? (
                <ProfileInfoBlock label="특기" values={specialties} />
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {row.phone ? (
              <ProfileLink href={contactHref("phone", row.phone)} label={`전화 ${row.phone}`} />
            ) : null}
            {instagram ? (
              <ProfileLink
                href={contactHref("instagram", instagram)}
                label={`인스타 ${instagram.replace(/^@/, "")}`}
              />
            ) : null}
            {row.email ? (
              <ProfileLink href={contactHref("email", row.email)} label={`이메일 ${row.email}`} />
            ) : null}
            {youtube?.startsWith("http") ? (
              <ProfileLink href={youtube} label="YouTube" />
            ) : null}
            {tiktok?.startsWith("http") ? (
              <ProfileLink href={tiktok} label="TikTok" />
            ) : null}
            {row.dancer_portfolio_file_url ? (
              <ProfileLink
                href={row.dancer_portfolio_file_url}
                label={row.dancer_portfolio_file_name ?? "포트폴리오 파일"}
              />
            ) : null}
          </div>

          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-black px-4 text-sm font-bold text-white hover:bg-black/80"
            >
              전체 프로필 보기
              <ExternalLink size={14} />
            </a>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

function ProfileInfoBlock({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-1 text-xs font-medium text-black/65"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProfileLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 hover:bg-black/[0.03]"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ExternalLink size={13} className="shrink-0" />
    </a>
  );
}

function SummaryMetric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn" | "bad";
}) {
  return (
    <div className="border border-black/10 bg-[#f7f7f4] p-3">
      <p className="text-[11px] font-semibold text-black/45">{label}</p>
      <p
        className={`mt-1 text-xl font-extrabold ${
          tone === "ok"
            ? "text-emerald-700"
            : tone === "warn"
              ? "text-amber-700"
              : tone === "bad"
                ? "text-red-700"
                : ""
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-black/45">{sub}</p>
    </div>
  );
}

function StatusGuide({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="rounded-lg border border-black/10 bg-[#f7f7f4] p-3">
      <p className="text-sm font-bold">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-black/55">{desc}</p>
    </div>
  );
}

function FilterGroup<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ key: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={`h-9 shrink-0 rounded-lg border px-2.5 text-xs font-semibold ${
              active
                ? "border-black bg-black text-white"
                : "border-black/10 bg-white text-black/60 hover:bg-black/5"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function ContactLinks({ row }: { row: OpsRow }) {
  const items = [
    row.phone
      ? {
          kind: "phone" as const,
          label: row.phone,
          Icon: Phone,
        }
      : null,
    row.instagram
      ? {
          kind: "instagram" as const,
          label: row.instagram.replace(/^@/, ""),
          Icon: AtSign,
        }
      : null,
    row.email
      ? {
          kind: "email" as const,
          label: row.email,
          Icon: Mail,
        }
      : null,
  ].filter(Boolean) as Array<{
    kind: "phone" | "instagram" | "email";
    label: string;
    Icon: typeof Phone;
  }>;

  if (items.length === 0) {
    return <span className="text-xs text-black/35">-</span>;
  }

  return (
    <div className="flex max-w-[280px] flex-wrap gap-1.5">
      {items.map(({ kind, label, Icon }) => (
        <a
          key={`${kind}:${label}`}
          href={contactHref(kind, label)}
          target={kind === "phone" ? undefined : "_blank"}
          rel={kind === "phone" ? undefined : "noreferrer"}
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs font-medium text-black/65 hover:bg-black/5"
        >
          <Icon size={13} />
          <span className="truncate">{label}</span>
        </a>
      ))}
    </div>
  );
}
