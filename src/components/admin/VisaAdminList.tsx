"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { updateVisaApplicationAction } from "@/app/actions/visa";
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
  dancer_id: string | null;
  stage_name: string | null;
  korean_name: string | null;
  slug: string | null;
  nationality: string | null;
  has_visa: boolean | null;
  visa_label: string | null;
};

const STATUS: { v: string; l: string }[] = [
  { v: "new", l: "신규" },
  { v: "reviewing", l: "검토중" },
  { v: "education", l: "교육중" },
  { v: "documents", l: "서류준비" },
  { v: "submitted", l: "신청접수" },
  { v: "approved", l: "발급완료" },
  { v: "on_hold", l: "보류" },
  { v: "rejected", l: "반려" },
];

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

export function VisaAdminList({ rows }: { rows: VisaAdminRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-ink-3">
        아직 비자 신청이 없습니다.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <VisaCard key={r.id} row={r} />
      ))}
    </div>
  );
}

function VisaCard({ row }: { row: VisaAdminRow }) {
  const [status, setStatus] = useState(row.status);
  const [memo, setMemo] = useState(row.memo ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">
              {row.stage_name || row.korean_name || "(이름 없음)"}
            </p>
            <span className="text-xs text-ink-3">{row.nationality ?? "국적 미상"}</span>
            {profileHref ? (
              <Link
                href={profileHref}
                target="_blank"
                className="inline-flex items-center gap-0.5 text-xs text-ink-3 hover:text-foreground"
              >
                프로필 <ExternalLink className="size-3" />
              </Link>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-ink-3">
            {row.korean_name && row.stage_name ? `${row.korean_name} · ` : ""}
            {new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-ink-2">
          {STATUS.find((s) => s.v === row.status)?.l ?? row.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-3">
        <Field label="비자">
          {row.has_visa == null ? "-" : row.has_visa ? `있음 (${row.visa_label ?? ""})` : "없음/예정"}
        </Field>
        <Field label="실력">{row.skill_level ? SKILL[row.skill_level] : "-"}</Field>
        <Field label="한국어">{row.korean_level ? (KOREAN[row.korean_level] ?? row.korean_level) : "-"}</Field>
        <Field label="현재">
          {row.currently_in_korea == null ? "-" : row.currently_in_korea ? "한국" : "자국"}
        </Field>
        <Field label="거주지">
          {row.has_residence_in_korea
            ? `있음${row.residence_region ? ` (${row.residence_region})` : ""}`
            : "없음"}
        </Field>
        <Field label="입국일">{row.available_entry_date ?? "-"}</Field>
        <Field label="이메일">
          <a href={`mailto:${row.email}`} className="text-foreground underline-offset-2 hover:underline">
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

      <div className="flex flex-col gap-2 border-t border-hairline-2 pt-3">
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
            {pending ? <Loader2 className="size-4 animate-spin" /> : saved && !dirty ? <Check className="size-4" /> : null}
            저장
          </button>
        </div>
        <textarea
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
            setSaved(false);
          }}
          rows={2}
          placeholder="메모 (담당자 메모, 진행 상황 등)"
          className="w-full resize-none rounded-lg border border-hairline-2 bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className={cn("text-foreground")}>
      <span className="text-ink-3">{label} </span>
      {children}
    </p>
  );
}
