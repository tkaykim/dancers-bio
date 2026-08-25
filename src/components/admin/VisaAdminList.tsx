"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Check,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import {
  deleteVisaApplicationAction,
  updateVisaApplicationAction,
} from "@/app/actions/visa";
import { Drawer } from "@/components/ui/drawer";
import { VisaCaseOpsEditor } from "@/components/admin/VisaCaseOpsEditor";
import { VisaAuditionMailPanel } from "@/components/admin/VisaAuditionMailPanel";
import { VisaPaymentPanel } from "@/components/admin/VisaPaymentPanel";
import {
  VisaMeetingInvitePanel,
  type MeetingInvite,
  type MeetingTracking,
} from "@/components/admin/VisaMeetingInvitePanel";
import { VisaOutboundMailsPanel, type OutboundMail } from "@/components/admin/VisaOutboundMailsPanel";
import {
  VISA_CASE_STAGE_LABEL,
  VISA_DECLINE_REASON,
  VISA_STATUS_OPTIONS,
  type VisaCaseDerived,
  type VisaCaseQueue,
  type VisaCaseTone,
} from "@/lib/visa/case-state";
import { cn } from "@/lib/utils";

export type VisaAdminRow = {
  id: string;
  created_at: string;
  status: string;
  memo: string | null;
  skill_level: number | null;
  korean_level: string | null;
  dance_video_url: string | null;
  currently_in_korea: boolean | null;
  has_residence_in_korea: boolean | null;
  residence_region: string | null;
  available_entry_date: string | null;
  email: string;
  contacts: { type: string; handle: string }[];
  preferred_lang: string | null;
  source: string | null;
  dancer_id: string | null;
  stage_name: string | null;
  korean_name: string | null;
  slug: string | null;
  nationality: string | null;
  is_korean_national: boolean | null;
  has_visa: boolean | null;
  visa_type: string | null;
  visa_type_other: string | null;
  visa_expiry: string | null;
  visa_label: string | null;
  case_url: string;
  case_stage: string;
  audition_at: string | null;
  audition_location: string | null;
  /** 오디션 확정 안내를 보낸 시각·그때의 일정 키 (같은 일정 중복 발송 방지 표시용) */
  audition_mail_sent_at?: string | null;
  audition_mail_key?: string | null;
  audition_status: string;
  audition_result: string;
  audition_feedback: string | null;
  level_test_video_url: string | null;
  training_required: boolean | null;
  training_partner: string | null;
  training_start_date: string | null;
  training_end_date: string | null;
  training_status: string;
  monthly_evaluation_at: string | null;
  monthly_evaluation_result: string;
  contract_status: string;
  basic_documents_status: string;
  detailed_documents_status: string;
  visa_issued_at: string | null;
  base_price_krw: number;
  quoted_price_krw: number | null;
  quote_note: string | null;
  follow_up_answers: Record<string, unknown>;
  follow_up_submitted_at: string | null;
  project_opportunity_opt_in: boolean | null;
  next_action: string | null;
  declined_at: string | null;
  decline_reason: string | null;
  decline_reason_detail: string | null;
  // 결제 정본은 grigoent 쪽이고, 여기 값은 결제 콜백으로 미러링된 사본이다.
  payment_status: string;
  payment_link_sent_at: string | null;
  payment_order_no: string | null;
  payment_provider: string | null;
  payment_amount_krw: number | null;
  paid_at: string | null;
  payment_refunded_at: string | null;
  meeting_tracking: MeetingTracking | null;
  meeting_invites: MeetingInvite[];
  outbound_mails: OutboundMail[];
  tracking: {
    eventCount: number;
    sentAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    visitedAt: string | null;
    submittedAt: string | null;
    lastEventAt: string | null;
    lastEventType: string | null;
    maxStep: number;
    maxScrollDepth: number;
    openCount: number;
    clickCount: number;
    visitCount: number;
  } | null;
  derived: VisaCaseDerived;
};

const CASE_STAGE = VISA_CASE_STAGE_LABEL;
const STATUS = VISA_STATUS_OPTIONS;

// 파생 상태 뱃지 — 배경은 옅은 회색 하나로 통일하고 왼쪽 점 색으로만 구분한다.
// 색 면적을 넓게 쓰면 40행이 전부 형광색으로 보여 오히려 안 읽힌다.
const DERIVED_TONE = "bg-secondary text-foreground";

// 상태 LED — 색 면적은 점 하나로 두되, 옅은 발광(halo)을 줘서 켜져 있는 표시등처럼 읽히게 한다.
const TONE_LED: Record<VisaCaseTone, string> = {
  action: "bg-amber-400 shadow-[0_0_0_2px_rgba(245,158,11,0.16),0_0_5px_1px_rgba(245,158,11,0.7)]",
  danger: "bg-rose-400 shadow-[0_0_0_2px_rgba(244,63,94,0.16),0_0_5px_1px_rgba(244,63,94,0.7)]",
  meeting: "bg-emerald-400 shadow-[0_0_0_2px_rgba(16,185,129,0.16),0_0_5px_1px_rgba(16,185,129,0.65)]",
  neutral: "bg-ink-4 shadow-[0_0_0_2px_rgba(20,18,12,0.06)]",
  muted: "bg-ink-4/40",
};

function StatusLed({ tone, className }: { tone: VisaCaseTone; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_LED[tone], className)} />;
}

const QUEUES: { key: VisaCaseQueue; label: string; tone: VisaCaseTone }[] = [
  { key: "schedule", label: "일정 확정 필요", tone: "action" },
  { key: "verdict", label: "판정 입력 필요", tone: "action" },
  { key: "no_response", label: "무응답 7일+", tone: "action" },
  { key: "meeting", label: "미팅 예정", tone: "meeting" },
];

type SortKey = "default" | "name" | "created" | "meeting";

const SORTS: { v: SortKey; l: string }[] = [
  { v: "created", l: "신청일" },
  { v: "default", l: "처리 우선순위" },
  { v: "name", l: "이름" },
  { v: "meeting", l: "미팅일" },
];

const SOURCES: { v: string; l: string }[] = [
  { v: "all", l: "전체 경로" },
  { v: "program", l: "프로그램" },
  { v: "visa", l: "비자 직접" },
];

const LANGS: { v: string; l: string }[] = [
  { v: "all", l: "전체 언어" },
  { v: "ko", l: "한국어" },
  { v: "en", l: "English" },
  { v: "ja", l: "日本語" },
];

const SELECT_CLASS =
  "min-h-9 rounded-xl border border-border bg-background px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none";

function searchHaystack(r: VisaAdminRow) {
  return [r.stage_name, r.korean_name, r.email, r.nationality, r.next_action]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** 미팅이 없는 행은 방향과 무관하게 항상 뒤로 보낸다. */
function compareMeeting(a: VisaAdminRow, b: VisaAdminRow, dir: 1 | -1) {
  const at = a.derived.meetingAt ? new Date(a.derived.meetingAt).getTime() : null;
  const bt = b.derived.meetingAt ? new Date(b.derived.meetingAt).getTime() : null;
  if (at == null && bt == null) return 0;
  if (at == null) return 1;
  if (bt == null) return -1;
  return (at - bt) * dir;
}

const SKILL: Record<number, string> = {
  1: "트레이닝 필요",
  2: "어느 정도",
  3: "현장 준비",
  4: "안무·무대 경험",
};

const KOREAN: Record<string, string> = {
  none: "전혀",
  some: "어느 정도",
  fluent: "유창",
};

function displayName(r: VisaAdminRow) {
  return r.stage_name || r.korean_name || "(이름 없음)";
}

function formatKstShort(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const DECLINE_REASON = VISA_DECLINE_REASON;

function trackingState(row: VisaAdminRow) {
  const t = row.tracking;
  if (!t?.sentAt) return null;
  if (row.follow_up_submitted_at || t.submittedAt) return "제출 완료";
  if (t.visitedAt) return `들어옴 · ${t.maxScrollDepth}% · ${t.maxStep > 0 ? `${t.maxStep}단계` : "진행 전"}`;
  if (t.clickedAt) return "클릭 후 미진입";
  if (t.openedAt) return "읽고 미클릭";
  return "발송 후 미열람";
}

export function VisaAdminList({ rows }: { rows: VisaAdminRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queue, setQueue] = useState<VisaCaseQueue | null>(null);
  const [q, setQ] = useState("");
  // 기본은 최신 신청 순 — 운영자가 목록을 접수 순서로 훑는 습관에 맞춘다.
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [source, setSource] = useState("all");
  const [lang, setLang] = useState("all");
  const [hideParked, setHideParked] = useState(false);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-ink-3">
        아직 비자 신청이 없습니다.
      </p>
    );
  }

  const counts = QUEUES.map((q) => ({
    ...q,
    count: rows.filter((r) => r.derived.queue === q.key).length,
  }));
  const visible = (() => {
    const needle = q.trim().toLowerCase();
    const dir: 1 | -1 = sortDir === "asc" ? 1 : -1;
    const filtered = rows.filter((r) => {
      if (queue && r.derived.queue !== queue) return false;
      if (hideParked && r.derived.sortBucket === 4) return false;
      if (source !== "all" && r.source !== source) return false;
      if (lang !== "all" && r.preferred_lang !== lang) return false;
      if (needle && !searchHaystack(r).includes(needle)) return false;
      return true;
    });
    if (sortKey === "default") {
      return dir === 1 ? filtered : [...filtered].reverse();
    }
    return [...filtered].sort((a, b) => {
      if (sortKey === "name") return displayName(a).localeCompare(displayName(b), "ko") * dir;
      if (sortKey === "created") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      return compareMeeting(a, b, dir);
    });
  })();

  const narrowed = visible.length !== rows.length;
  const filterActive = Boolean(queue) || hideParked || source !== "all" || lang !== "all" || q.trim() !== "";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {counts.map((q) => (
          <button
            key={q.key}
            type="button"
            onClick={() => setQueue(queue === q.key ? null : q.key)}
            aria-pressed={queue === q.key}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
              queue === q.key
                ? "border-foreground bg-foreground text-background"
                : "border-hairline-2 bg-card hover:bg-secondary",
              queue !== q.key && q.count === 0 && "opacity-50",
            )}
          >
            <StatusLed tone={q.tone} className={queue === q.key ? "bg-background shadow-none" : undefined} />
            {q.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                queue === q.key ? "bg-background/20" : "bg-secondary text-ink-2",
              )}
            >
              {q.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
          <Search size={15} className="shrink-0 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·이메일·국적 검색"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </div>

        <select
          value={sortKey}
          onChange={(e) => {
            const next = e.target.value as SortKey;
            setSortKey(next);
            // 처리 우선순위는 뒤집으면 "지금 할 일"이 맨 아래로 가버린다 — 항상 정방향으로 되돌린다.
            if (next === "default") setSortDir("asc");
          }}
          aria-label="정렬 기준"
          className={SELECT_CLASS}
        >
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          disabled={sortKey === "default"}
          aria-label={sortDir === "asc" ? "오름차순 (누르면 내림차순)" : "내림차순 (누르면 오름차순)"}
          title={sortKey === "default" ? "처리 우선순위는 방향을 바꾸지 않습니다" : sortDir === "asc" ? "오름차순" : "내림차순"}
          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border bg-background px-2.5 text-[13px] font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sortDir === "asc" ? <ArrowUpAZ className="size-4" /> : <ArrowDownAZ className="size-4" />}
          {sortDir === "asc" ? "오름차순" : "내림차순"}
        </button>

        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="신청 경로"
          className={SELECT_CLASS}
        >
          {SOURCES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </select>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          aria-label="지원자 언어"
          className={SELECT_CLASS}
        >
          {LANGS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.l}
            </option>
          ))}
        </select>

        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-[13px] text-ink-2 hover:bg-secondary">
          <input
            type="checkbox"
            checked={hideParked}
            onChange={(e) => setHideParked(e.target.checked)}
            className="size-3.5 accent-current"
          />
          테스트·대상 아님 숨기기
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
        <span>
          {narrowed ? `${visible.length}건 표시 (전체 ${rows.length}건)` : `${rows.length}건`}
        </span>
        {filterActive ? (
          <button
            type="button"
            onClick={() => {
              setQueue(null);
              setQ("");
              setSource("all");
              setLang("all");
              setHideParked(false);
            }}
            className="font-medium text-foreground underline underline-offset-2"
          >
            필터 초기화
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-ink-3">
          조건에 맞는 신청이 없습니다.
        </p>
      ) : (
      <ul className="divide-y divide-hairline-2 overflow-hidden rounded-xl border border-border bg-card">
        {visible.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate font-semibold text-foreground">
                    {displayName(r)}
                  </span>
                  <span className="text-xs text-ink-3">{r.nationality ?? "국적 미상"}</span>
                  {r.source === "program" ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      프로그램
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-3">
                  {r.email} ·{" "}
                  {new Date(r.created_at).toLocaleDateString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "2-digit",
                    day: "2-digit",
                  })}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium text-ink-2">
                    {CASE_STAGE[r.case_stage] ?? r.case_stage}
                  </span>
                  {r.derived.manualStatusChip ? (
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
                      {r.derived.manualStatusChip}
                    </span>
                  ) : null}
                  {r.derived.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                {r.next_action ? (
                  <p className="mt-1 truncate text-[11px] text-ink-3">다음: {r.next_action}</p>
                ) : null}
                {trackingState(r) ? (
                  <p className="mt-1 text-[11px] font-medium text-primary">
                    {trackingState(r)}
                    {r.tracking?.lastEventAt ? ` · 마지막 ${formatKstShort(r.tracking.lastEventAt)}` : ""}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  DERIVED_TONE,
                )}
              >
                <StatusLed tone={r.derived.tone} />
                {r.derived.label}
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-4" />
            </button>
          </li>
        ))}
      </ul>
      )}

      <Drawer
        open={selected != null}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
        title={selected ? displayName(selected) : undefined}
      >
        {selected ? (
          <VisaDetail
            key={selected.id}
            row={selected}
            onDeleted={() => setSelectedId(null)}
          />
        ) : null}
      </Drawer>
    </>
  );
}

function VisaDetail({
  row,
  onDeleted,
}: {
  row: VisaAdminRow;
  onDeleted: () => void;
}) {
  const [status, setStatus] = useState(row.status);
  const [memo, setMemo] = useState(row.memo ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dirty = status !== row.status || memo !== (row.memo ?? "");
  const profileHref = row.slug
    ? `/d/${row.slug}`
    : row.dancer_id
      ? `/d/${row.dancer_id}`
      : null;

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      const res = await updateVisaApplicationAction({
        id: row.id,
        status,
        memo,
      } as Parameters<typeof updateVisaApplicationAction>[0]);
      if (res.ok) setSaved(true);
    });
  };

  const remove = () => {
    setDeleteError(null);
    startDelete(async () => {
      const res = await deleteVisaApplicationAction({ id: row.id });
      if (res.ok) {
        onDeleted();
      } else {
        setDeleteError(res.error);
        setConfirmDelete(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 요약 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-foreground">{displayName(row)}</span>
          <span className="text-sm text-ink-3">{row.nationality ?? "국적 미상"}</span>
          {row.source === "program" ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              프로그램
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              DERIVED_TONE,
            )}
          >
            <StatusLed tone={row.derived.tone} />
            {row.derived.label}
          </span>
          {row.derived.manualStatusChip ? (
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
              {row.derived.manualStatusChip}
            </span>
          ) : null}
          {row.derived.badges.map((badge) => (
            <span
              key={badge}
              className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
            >
              {badge}
            </span>
          ))}
        </div>
        <p className="text-xs text-ink-3">
          {row.korean_name && row.stage_name ? `${row.korean_name} · ` : ""}
          접수 {new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
        </p>
        {profileHref ? (
          <Link
            href={profileHref}
            target="_blank"
            className="inline-flex w-fit items-center gap-0.5 text-xs text-ink-2 hover:text-foreground"
          >
            프로필 열기 <ExternalLink className="size-3" />
          </Link>
        ) : null}
      </div>

      {/* 상세 필드 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
        <Field label="비자">
          {row.has_visa == null ? "-" : row.has_visa ? `있음 (${row.visa_label ?? ""})` : "없음/예정"}
        </Field>
        <Field label="실력">{row.skill_level ? SKILL[row.skill_level] : "-"}</Field>
        <Field label="한국어">
          {row.korean_level ? (KOREAN[row.korean_level] ?? row.korean_level) : "-"}
        </Field>
        <Field label="현재">
          {row.currently_in_korea == null ? "-" : row.currently_in_korea ? "한국" : "자국"}
        </Field>
        <Field label="거주지">
          {row.has_residence_in_korea
            ? `있음${row.residence_region ? ` (${row.residence_region})` : ""}`
            : "없음"}
        </Field>
        <Field label="입국일">{row.available_entry_date ?? "-"}</Field>
        <Field label="이메일" full>
          <a
            href={`mailto:${row.email}`}
            className="text-foreground underline-offset-2 hover:underline"
          >
            {row.email}
          </a>
        </Field>
      </div>

      {row.contacts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {row.contacts.map((c, i) => (
            <span key={i} className="rounded bg-secondary px-2 py-0.5 text-[11px] text-ink-2">
              {c.type}: {c.handle}
            </span>
          ))}
        </div>
      ) : null}

      {row.dance_video_url ? (
        <a
          href={row.dance_video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-[13px] text-ink-2 hover:text-foreground"
        >
          댄스 영상 <ExternalLink className="size-3.5" />
        </a>
      ) : null}

      {row.declined_at ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-700">지원자가 진행하지 않겠다고 응답</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <Field label="응답 시각">{formatKstShort(row.declined_at) ?? "-"}</Field>
            <Field label="사유">{row.decline_reason ? DECLINE_REASON[row.decline_reason] ?? row.decline_reason : "-"}</Field>
          </div>
          {row.decline_reason_detail ? (
            <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{row.decline_reason_detail}</p>
          ) : null}
        </div>
      ) : null}

      <VisaMeetingInvitePanel
        applicationId={row.id}
        preferredLang={row.preferred_lang}
        consultationAnswers={row.follow_up_answers}
        invites={row.meeting_invites}
        tracking={row.meeting_tracking}
      />

      <VisaAuditionMailPanel
        state={{
          applicationId: row.id,
          auditionAt: row.audition_at,
          auditionLocation: row.audition_location,
          applicantLang: row.preferred_lang,
          sentAt: row.audition_mail_sent_at ?? null,
          sentForAuditionAt: row.audition_mail_key ?? null,
        }}
      />

      <VisaOutboundMailsPanel mails={row.outbound_mails} />

      <VisaPaymentPanel
        state={{
          applicationId: row.id,
          paymentStatus: row.payment_status,
          paymentLinkSentAt: row.payment_link_sent_at,
          paymentOrderNo: row.payment_order_no,
          paymentProvider: row.payment_provider,
          paymentAmountKrw: row.payment_amount_krw,
          paidAt: row.paid_at,
          paymentRefundedAt: row.payment_refunded_at,
        }}
      />

      <VisaCaseOpsEditor row={row} />

      {row.tracking ? (
        <div className="rounded-xl border border-hairline-2 bg-card p-4">
          <p className="text-xs font-semibold text-ink-3">메일·케이스 추적</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
            <Field label="현재 판단">{trackingState(row) ?? "-"}</Field>
            <Field label="발송">{formatKstShort(row.tracking.sentAt) ?? "-"}</Field>
            <Field label="열람">{row.tracking.openedAt ? `${formatKstShort(row.tracking.openedAt)} · ${row.tracking.openCount}회` : "-"}</Field>
            <Field label="CTA 클릭">{row.tracking.clickedAt ? `${formatKstShort(row.tracking.clickedAt)} · ${row.tracking.clickCount}회` : "-"}</Field>
            <Field label="페이지 진입">{row.tracking.visitedAt ? `${formatKstShort(row.tracking.visitedAt)} · ${row.tracking.visitCount}회` : "-"}</Field>
            <Field label="최대 진행">{row.tracking.maxStep > 0 ? `${row.tracking.maxStep}단계` : "-"}</Field>
            <Field label="최대 스크롤">{row.tracking.maxScrollDepth ? `${row.tracking.maxScrollDepth}%` : "-"}</Field>
            <Field label="마지막 이벤트">{row.tracking.lastEventType ? `${row.tracking.lastEventType} · ${formatKstShort(row.tracking.lastEventAt)}` : "-"}</Field>
          </div>
        </div>
      ) : null}

      {/* 상태·메모 편집 */}
      <div className="flex flex-col gap-2 border-t border-hairline-2 pt-4">
        <label className="text-xs font-medium text-ink-3">진행 상태</label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-hairline-2 bg-surface-2 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {STATUS.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saved && !dirty ? (
              <Check className="size-4" />
            ) : null}
            저장
          </button>
        </div>
        <textarea
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="메모 (담당자 메모, 진행 상황 등)"
          className="w-full resize-none rounded-lg border border-hairline-2 bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none"
        />
      </div>

      {/* 삭제 */}
      <div className="flex flex-col gap-2 border-t border-hairline-2 pt-4">
        {deleteError ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{deleteError}</p>
        ) : null}
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
            <p className="text-[13px] text-foreground">
              이 신청을 삭제합니다. claim되지 않은 온보딩 프로필·연락처도 함께 정리됩니다. 되돌릴 수
              없습니다.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
              >
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                삭제 확정
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:text-foreground"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-rose-500/40 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
          >
            <Trash2 className="size-4" />
            신청 삭제
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", full && "col-span-2")}>
      <span className="text-[11px] text-ink-3">{label}</span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}
