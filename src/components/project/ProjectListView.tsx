"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  daysUntilDeadline,
  deadlineLabel,
  isDeadlinePassed,
} from "@/lib/utils/deadline";

export type ProjectCategory =
  | "performance"
  | "choreography"
  | "instructor"
  | "broadcast"
  | "advertisement"
  | "event"
  | "video"
  | "other";

export type ListProject = {
  id: string;
  short_code: string | null;
  visibility: "public" | "private";
  title: string;
  category: ProjectCategory | null;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  application_deadline: string | null;
  created_at: string;
  owner_name: string | null;
  genre_label: string | null;
  region_label: string | null;
  session_count: number;
};

type SortKey = "deadline" | "latest" | "pay";

const CATEGORY_LABEL: Record<ProjectCategory, string> = {
  performance: "공연",
  choreography: "안무제작",
  instructor: "강사",
  broadcast: "방송",
  advertisement: "광고",
  event: "행사",
  video: "영상촬영",
  other: "기타",
};

const CATEGORY_ORDER: ProjectCategory[] = [
  "performance",
  "choreography",
  "instructor",
  "broadcast",
  "advertisement",
  "event",
  "video",
  "other",
];

function formatPayShort(p: ListProject): string {
  if (p.pay_type === "negotiable") return "협의";
  if (!p.pay_amount) return "협의";
  const amount = p.pay_amount;
  let label: string;
  if (amount >= 10000000)
    label = `${(amount / 10000000).toFixed(amount % 10000000 === 0 ? 0 : 1)}천만`;
  else if (amount >= 10000)
    label = `${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}만`;
  else label = amount.toLocaleString("ko-KR");
  return p.pay_type === "per_session" ? `₩${label}/회` : `₩${label}`;
}

function payValue(p: ListProject): number {
  if (!p.pay_amount) return -1;
  return p.pay_type === "per_session" ? p.pay_amount * 4 : p.pay_amount;
}

function shortRegion(s: string | null): string {
  if (!s) return "";
  return s
    .replace("특별시", "")
    .replace("광역시", "")
    .replace("특별자치도", "")
    .replace("특별자치시", "");
}

export function ProjectListView({
  projects,
  isAdmin = false,
}: {
  projects: ListProject[];
  isAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [selectedCats, setSelectedCats] = useState<Set<ProjectCategory>>(new Set());
  const [region, setRegion] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [filterOpen, setFilterOpen] = useState(false);
  // 마감 지난 공고는 기본 숨김. 토글로 노출.
  const [showExpired, setShowExpired] = useState(false);

  const expiredCount = useMemo(
    () => projects.filter((p) => isDeadlinePassed(p.application_deadline)).length,
    [projects],
  );

  const genres = useMemo(
    () =>
      Array.from(
        new Set(projects.map((p) => p.genre_label).filter((g): g is string => !!g)),
      ).sort(),
    [projects],
  );
  const regions = useMemo(
    () =>
      Array.from(
        new Set(projects.map((p) => p.region_label).filter((r): r is string => !!r)),
      ).sort(),
    [projects],
  );
  const availableCats = useMemo(() => {
    const present = new Set<ProjectCategory>();
    for (const p of projects) if (p.category) present.add(p.category);
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [projects]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      // 마감 지난 공고는 기본 숨김 (토글로 노출). 검색어가 있어도 동일하게 적용.
      if (!showExpired && isDeadlinePassed(p.application_deadline)) return false;
      // 비공개 공고는 admin이 아니면 카테고리/장르/지역 필터를 우회 (속성 노출 방지)
      const masked = p.visibility === "private" && !isAdmin;
      if (!masked) {
        if (
          selectedGenres.size > 0 &&
          (!p.genre_label || !selectedGenres.has(p.genre_label))
        )
          return false;
        if (selectedCats.size > 0 && (!p.category || !selectedCats.has(p.category)))
          return false;
        if (region && p.region_label !== region) return false;
      }
      if (q) {
        const hay = masked
          ? "비공개 공고"
          : `${p.title} ${p.owner_name ?? ""} ${p.region_label ?? ""} ${p.genre_label ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sort === "deadline") {
      sorted.sort((a, b) => {
        // 마감 지난 공고는(토글로 노출 시) 항상 맨 뒤로.
        const aExp = isDeadlinePassed(a.application_deadline);
        const bExp = isDeadlinePassed(b.application_deadline);
        if (aExp !== bExp) return aExp ? 1 : -1;
        const av = a.application_deadline
          ? new Date(a.application_deadline).getTime()
          : Infinity;
        const bv = b.application_deadline
          ? new Date(b.application_deadline).getTime()
          : Infinity;
        return av - bv;
      });
    } else if (sort === "latest") {
      sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else if (sort === "pay") {
      sorted.sort((a, b) => payValue(b) - payValue(a));
    }
    return sorted;
  }, [projects, query, selectedGenres, selectedCats, region, sort, isAdmin, showExpired]);

  const activeCount =
    selectedGenres.size +
    selectedCats.size +
    (region ? 1 : 0) +
    (sort !== "deadline" ? 1 : 0) +
    (showExpired ? 1 : 0);
  const hasFilter = activeCount > 0;
  // 분모: 만료 숨김 상태면 비만료만, 포함이면 전체.
  const poolSize = showExpired ? projects.length : projects.length - expiredCount;

  function toggleGenre(g: string) {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }
  function toggleCat(c: ProjectCategory) {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }
  function resetAll() {
    setQuery("");
    setSelectedGenres(new Set());
    setSelectedCats(new Set());
    setRegion("");
    setSort("deadline");
    setShowExpired(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Search */}
      <Input
        type="search"
        placeholder="제목·주최자·지역 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9"
      />

      {/* Filter section */}
      <div className="rounded-lg border border-border bg-card/50">
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold">필터</span>
            {activeCount > 0 ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-2 text-[11px] text-ink-3">
            {hasFilter ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  resetAll();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    resetAll();
                  }
                }}
                className="cursor-pointer rounded px-1 text-ink-3 hover:text-foreground"
              >
                초기화
              </span>
            ) : null}
            <span aria-hidden>{filterOpen ? "▾" : "▸"}</span>
          </span>
        </button>

        {filterOpen ? (
          <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
            {availableCats.length > 0 ? (
              <FilterGroup label="종류">
                {availableCats.map((c) => (
                  <Chip
                    key={c}
                    active={selectedCats.has(c)}
                    onClick={() => toggleCat(c)}
                  >
                    {CATEGORY_LABEL[c]}
                  </Chip>
                ))}
              </FilterGroup>
            ) : null}

            {genres.length > 0 ? (
              <FilterGroup label="장르">
                {genres.map((g) => (
                  <Chip
                    key={g}
                    active={selectedGenres.has(g)}
                    onClick={() => toggleGenre(g)}
                  >
                    {g}
                  </Chip>
                ))}
              </FilterGroup>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">지역 전체</option>
                {regions.map((r) => (
                  <option key={r} value={r}>
                    {shortRegion(r)}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="deadline">마감 임박순</option>
                <option value="latest">최신순</option>
                <option value="pay">페이 높은순</option>
              </select>
            </div>

            {expiredCount > 0 ? (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  checked={showExpired}
                  onChange={(e) => setShowExpired(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                마감된 공고 포함 ({expiredCount})
              </label>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between px-1 text-[10px] text-ink-3">
        <span>
          {filtered.length}
          {filtered.length !== poolSize ? ` / ${poolSize}` : ""}건
        </span>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border px-2 py-1.5 text-[10px] uppercase tracking-wider text-ink-3">
        <span>공고</span>
        <span className="w-16 text-right">페이</span>
        <span className="w-10 text-right">마감</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline-2 p-6 text-center">
          <p className="text-xs text-ink-3">조건에 맞는 공고가 없습니다.</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {filtered.map((p) => (
            <ProjectRow key={p.id} project={p} isAdmin={isAdmin} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
          : "rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-ink-2 hover:border-foreground/40 hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function ProjectRow({
  project,
  isAdmin,
}: {
  project: ListProject;
  isAdmin: boolean;
}) {
  const dDay = daysUntilDeadline(project.application_deadline);
  // 마감 지남(음수) 또는 3일 이내(0~3)면 강조.
  const urgent = dDay !== null && dDay <= 3;
  const masked = project.visibility === "private" && !isAdmin;

  const rowClass =
    "grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 py-2 transition-colors";
  const linkClass = `${rowClass} hover:bg-secondary`;
  const plainClass = `${rowClass} cursor-default`;

  const inner = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {project.visibility === "private" ? (
            <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-ink-3">
              비공개
            </span>
          ) : null}
          <div className="truncate text-sm font-medium leading-tight">
            {masked ? "비공개 공고" : project.title}
          </div>
        </div>
        <div className="mt-0.5 truncate text-[10px] text-ink-3">
          {masked
            ? "링크를 받은 사람만 열람 가능"
            : [
                project.category ? CATEGORY_LABEL[project.category] : null,
                project.genre_label,
                shortRegion(project.region_label),
                project.session_count ? `${project.session_count}회` : null,
                project.owner_name,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
        </div>
      </div>
      <span className="w-16 text-right font-mono text-[11px]">
        {masked ? "—" : formatPayShort(project)}
      </span>
      <span
        className={`w-10 text-right font-mono text-[11px] ${urgent ? "text-destructive" : "text-ink-3"}`}
      >
        {deadlineLabel(project.application_deadline, { none: "상시" })}
      </span>
    </>
  );

  return (
    <li className="border-b border-border/60">
      {masked || !project.short_code ? (
        <div className={plainClass} aria-disabled="true">
          {inner}
        </div>
      ) : (
        <Link href={`/projects/${project.short_code}`} className={linkClass}>
          {inner}
        </Link>
      )}
    </li>
  );
}
