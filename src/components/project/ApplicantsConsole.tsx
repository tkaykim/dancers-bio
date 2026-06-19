"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  decideApplicationAction,
  bulkDecideApplicationsAction,
} from "@/app/actions/applications";
import { closeProjectAction } from "@/app/actions/projects";
import { APPLICATION_STATUS_LABELS } from "@/lib/validation/projects";
import {
  ApplicantPortfolioSheet,
  type SheetApplicant,
} from "@/components/project/ApplicantPortfolioSheet";
import { RejectReasonDialog } from "@/components/project/RejectReasonDialog";

export type ConsoleApplicant = {
  id: string;
  status: string;
  source: "apply" | "direct_proposal";
  cover_message: string | null;
  created_at: string;
  isTeam: boolean;
  name: string;
  korean_name: string | null;
  avatar: string | null;
  publicHref: string | null;
  dancerId: string | null;
  genres: string[];
  location: string | null;
  rejection_reason: string | null;
  recruitmentChannelId: string | null;
  recruitmentChannelName: string | null;
};

type Tab = "pending" | "accepted" | "rejected" | "all";
type ChannelFilter = "all" | "none" | string;

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-secondary text-ink-2",
  accepted: "bg-ok/15 text-ok",
  rejected: "bg-destructive/10 text-destructive",
};

export function ApplicantsConsole({
  projectId,
  recruitmentCount,
  initial,
  channels = [],
}: {
  projectId: string;
  recruitmentCount: number;
  initial: ConsoleApplicant[];
  channels?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ConsoleApplicant[]>(initial);
  const [tab, setTab] = useState<Tab>("pending");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [sortNewest, setSortNewest] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);

  const counts = useMemo(() => {
    let pending = 0,
      accepted = 0,
      rejected = 0;
    for (const a of items) {
      if (a.status === "pending") pending++;
      else if (a.status === "accepted") accepted++;
      else if (a.status === "rejected" || a.status === "declined") rejected++;
    }
    return { pending, accepted, rejected, total: items.length };
  }, [items]);

  const allGenres = useMemo(() => {
    const s = new Set<string>();
    items.forEach((a) => a.genres.forEach((g) => s.add(g)));
    return Array.from(s).slice(0, 12);
  }, [items]);

  const channelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let none = 0;
    for (const item of items) {
      if (!item.recruitmentChannelId) {
        none++;
        continue;
      }
      counts.set(
        item.recruitmentChannelId,
        (counts.get(item.recruitmentChannelId) ?? 0) + 1,
      );
    }
    return { counts, none };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items.filter((a) => {
      if (tab === "pending" && a.status !== "pending") return false;
      if (tab === "accepted" && a.status !== "accepted") return false;
      if (tab === "rejected" && a.status !== "rejected" && a.status !== "declined")
        return false;
      if (channelFilter === "none" && a.recruitmentChannelId) return false;
      if (
        channelFilter !== "all" &&
        channelFilter !== "none" &&
        a.recruitmentChannelId !== channelFilter
      )
        return false;
      if (q) {
        const hay =
          `${a.name} ${a.korean_name ?? ""} ${a.recruitmentChannelName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (genre && !a.genres.includes(genre)) return false;
      return true;
    });
    list = [...list].sort((x, y) =>
      sortNewest
        ? y.created_at.localeCompare(x.created_at)
        : x.created_at.localeCompare(y.created_at),
    );
    return list;
  }, [items, tab, channelFilter, query, genre, sortNewest]);

  const sheetApplicant: SheetApplicant | null = useMemo(() => {
    const a = items.find((i) => i.id === sheetId);
    if (!a) return null;
    return {
      applicationId: a.id,
      dancerId: a.dancerId,
      name: a.name,
      status: a.status,
      publicHref: a.publicHref,
      rejectionReason: a.rejection_reason,
    };
  }, [items, sheetId]);

  function patchItem(id: string, patch: Partial<ConsoleApplicant>) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  // 거절은 사유 입력 다이얼로그를 먼저 띄운다. 수락/대기는 즉시 처리.
  function requestDecide(
    id: string,
    decision: "accepted" | "rejected" | "pending",
  ) {
    if (decision === "rejected") {
      setSheetId(null); // 시트 닫고 사유 다이얼로그만 표시(중첩 방지)
      setRejectId(id);
      return;
    }
    applyDecide(id, decision, null);
  }

  async function applyDecide(
    id: string,
    decision: "accepted" | "rejected" | "pending",
    reason: string | null,
  ) {
    setBusy(true);
    const prev = items.find((a) => a.id === id)?.status;
    patchItem(id, {
      status: decision,
      rejection_reason: decision === "rejected" ? reason : null,
    }); // 낙관적 업데이트
    const fd = new FormData();
    fd.set("application_id", id);
    fd.set("decision", decision);
    if (decision === "rejected" && reason) fd.set("rejection_reason", reason);
    const r = await decideApplicationAction(fd);
    setBusy(false);
    if (!r.ok) {
      if (prev) patchItem(id, { status: prev }); // 롤백
      toast.error(r.error);
      return;
    }
    toast.success(
      decision === "accepted"
        ? "수락했습니다"
        : decision === "rejected"
          ? "거절했습니다"
          : "대기로 되돌렸습니다",
    );
    if (r.data?.quotaReached && r.data.projectId) {
      const pid = r.data.projectId;
      toast("모집 인원이 모두 찼습니다", {
        description: "모집을 마감할까요?",
        action: {
          label: "마감",
          onClick: async () => {
            const cfd = new FormData();
            cfd.set("id", pid);
            const cr = await closeProjectAction(cfd);
            if (cr.ok) {
              toast.success("모집을 마감했습니다");
              router.refresh();
            } else toast.error(cr.error);
          },
        },
      });
    }
  }

  async function bulk(decision: "rejected" | "pending") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      decision === "rejected" &&
      !confirm(`선택한 ${ids.length}명을 일괄 거절할까요?`)
    )
      return;
    setBusy(true);
    const fd = new FormData();
    fd.set("ids", JSON.stringify(ids));
    fd.set("decision", decision);
    const r = await bulkDecideApplicationsAction(fd);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    ids.forEach((id) => patchItem(id, { status: decision }));
    setSelected(new Set());
    toast.success(`${r.data?.updated ?? ids.length}명 처리했습니다`);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allChecked = filtered.every((a) => next.has(a.id));
      if (allChecked) filtered.forEach((a) => next.delete(a.id));
      else filtered.forEach((a) => next.add(a.id));
      return next;
    });
  }

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "pending", label: "대기", n: counts.pending },
    { key: "accepted", label: "수락", n: counts.accepted },
    { key: "rejected", label: "거절", n: counts.rejected },
    { key: "all", label: "전체", n: counts.total },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 지원자</p>
        <p className="text-sm text-ink-2">
          총 {counts.total}명 · 수락 {counts.accepted} / {recruitmentCount}
        </p>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-1 rounded-xl bg-secondary/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-card text-foreground shadow-sm"
                : "text-ink-3 hover:text-foreground"
            }`}
          >
            {t.label}{" "}
            <span className={tab === t.key ? "text-primary" : "text-ink-3"}>
              {t.n}
            </span>
          </button>
        ))}
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·모집채널로 검색…"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={() => setSortNewest((v) => !v)}
          className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs text-ink-2 hover:bg-secondary"
        >
          {sortNewest ? "최신순" : "오래된순"}
        </button>
      </div>

      {channels.length > 0 || channelCounts.none > 0 ? (
        <div className="flex flex-wrap gap-1">
          <FilterChip
            active={channelFilter === "all"}
            onClick={() => setChannelFilter("all")}
          >
            전체 채널
          </FilterChip>
          {channels.map((channel) => (
            <FilterChip
              key={channel.id}
              active={channelFilter === channel.id}
              onClick={() =>
                setChannelFilter(channelFilter === channel.id ? "all" : channel.id)
              }
            >
              {channel.name} {channelCounts.counts.get(channel.id) ?? 0}
            </FilterChip>
          ))}
          {channelCounts.none > 0 ? (
            <FilterChip
              active={channelFilter === "none"}
              onClick={() =>
                setChannelFilter(channelFilter === "none" ? "all" : "none")
              }
            >
              채널 없음 {channelCounts.none}
            </FilterChip>
          ) : null}
        </div>
      ) : null}

      {/* 장르 필터 */}
      {allGenres.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          <FilterChip active={genre === null} onClick={() => setGenre(null)}>
            전체 장르
          </FilterChip>
          {allGenres.map((g) => (
            <FilterChip
              key={g}
              active={genre === g}
              onClick={() => setGenre(genre === g ? null : g)}
            >
              {g}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {/* 일괄 선택 바 */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <button
          type="button"
          onClick={selectAllVisible}
          className="text-ink-3 hover:text-foreground"
        >
          {filtered.length > 0 && filtered.every((a) => selected.has(a.id))
            ? "선택 해제"
            : "보이는 항목 전체 선택"}
        </button>
        {selected.size > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-ink-2">선택 {selected.size}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => bulk("rejected")}
              className="rounded-full bg-destructive/10 px-3 py-1 font-semibold text-destructive disabled:opacity-50"
            >
              일괄 거절
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => bulk("pending")}
              className="rounded-full bg-secondary px-3 py-1 font-medium text-ink-2 disabled:opacity-50"
            >
              대기로
            </button>
          </div>
        ) : null}
      </div>

      {/* 리스트 */}
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          해당 조건의 지원자가 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((a) => {
            const isSel = selected.has(a.id);
            return (
              <li
                key={a.id}
                onClick={() => setSheetId(a.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors hover:bg-secondary/40 ${
                  isSel ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(a.id)}
                  className="size-4 shrink-0 accent-primary"
                  aria-label="선택"
                />
                {a.avatar ? (
                  <Image
                    src={a.avatar}
                    alt={a.name}
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                    {a.name[0]}
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-medium">
                    {a.name}
                    {a.korean_name ? (
                      <span className="ml-1 text-ink-3">{a.korean_name}</span>
                    ) : null}
                    {a.isTeam ? (
                      <span className="ml-1.5 rounded bg-secondary px-1 py-0.5 text-[10px] font-semibold">
                        팀
                      </span>
                    ) : null}
                    {a.source === "direct_proposal" ? (
                      <span className="ml-1.5 text-[10px] text-ink-3">제안</span>
                    ) : null}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {a.recruitmentChannelName ? (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {a.recruitmentChannelName}
                      </span>
                    ) : null}
                    {a.location ? (
                      <span className="text-[11px] text-ink-3">{a.location}</span>
                    ) : null}
                    {a.genres.slice(0, 3).map((g) => (
                      <span
                        key={g}
                        className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-ink-2"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                  {(a.status === "rejected" || a.status === "declined") &&
                  a.rejection_reason ? (
                    <p className="mt-0.5 truncate text-[11px] italic text-ink-3">
                      거절 사유: {a.rejection_reason}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline ${
                    STATUS_BADGE[a.status] ?? "bg-secondary text-ink-3"
                  }`}
                >
                  {APPLICATION_STATUS_LABELS[
                    a.status as keyof typeof APPLICATION_STATUS_LABELS
                  ] ?? a.status}
                </span>
                <div
                  className="flex shrink-0 gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {a.status !== "accepted" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestDecide(a.id, "accepted")}
                      className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      수락
                    </button>
                  ) : null}
                  {a.status !== "rejected" && a.status !== "declined" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestDecide(a.id, "rejected")}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-ink-2 hover:bg-secondary disabled:opacity-50"
                    >
                      거절
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestDecide(a.id, "pending")}
                      className="rounded-full px-2.5 py-1 text-[11px] text-ink-3 hover:bg-secondary disabled:opacity-50"
                    >
                      대기로
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ApplicantPortfolioSheet
        open={sheetId !== null}
        onOpenChange={(o) => !o && setSheetId(null)}
        projectId={projectId}
        applicant={sheetApplicant}
        deciding={busy}
        onDecide={(decision) => {
          if (sheetId) requestDecide(sheetId, decision);
        }}
      />

      <RejectReasonDialog
        open={rejectId !== null}
        onOpenChange={(o) => !o && setRejectId(null)}
        busy={busy}
        onConfirm={(reason) => {
          const id = rejectId;
          setRejectId(null);
          if (id) applyDecide(id, "rejected", reason);
        }}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-ink-3 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
