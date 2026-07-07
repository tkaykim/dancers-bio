"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  deleteVisaApplicationAction,
  updateVisaApplicationAction,
} from "@/app/actions/visa";
import { Drawer } from "@/components/ui/drawer";
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

const STATUS_TONE: Record<string, string> = {
  new: "bg-primary/10 text-primary",
  reviewing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  education: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  documents: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  submitted: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  on_hold: "bg-secondary text-ink-2",
  rejected: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

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

function statusLabel(v: string) {
  return STATUS.find((s) => s.v === v)?.l ?? v;
}

function displayName(r: VisaAdminRow) {
  return r.stage_name || r.korean_name || "(이름 없음)";
}

export function VisaAdminList({ rows }: { rows: VisaAdminRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-ink-3">
        아직 비자 신청이 없습니다.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-hairline-2 overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((r) => (
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
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                  STATUS_TONE[r.status] ?? "bg-secondary text-ink-2",
                )}
              >
                {statusLabel(r.status)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-ink-4" />
            </button>
          </li>
        ))}
      </ul>

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
