"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  daysUntilDeadline,
  deadlineLabel,
  isExpired,
} from "@/lib/utils/deadline";
import { useLocale, useT } from "@/lib/i18n/provider";
import { localeTag, tCount, type Translator } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locale";
import { labelFor } from "@/lib/i18n/labels";
import feed from "@/lib/i18n/messages/feed";

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
  status: string;
  title: string;
  category: ProjectCategory | null;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  application_deadline: string | null;
  is_standing_pool?: boolean | null;
  created_at: string;
  owner_name: string | null;
  genre_label: string | null;
  region_label: string | null;
  session_count: number;
};

type SortKey = "deadline" | "latest" | "pay";

type FeedT = Translator<typeof feed>;

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

/**
 * 목록에서 "마감"으로 다룰지.
 *
 * 두 가지를 하나로 본다 — 마감일이 지났거나(①), 운영자가 공고를 닫았거나(②).
 * 예전엔 ①만 봤고 ②는 서버 쿼리에서 통째로 빠져 있어서, 닫힌 공고는
 * '마감된 공고 포함'을 켜도 나타나지 않았다.
 */
export function isListClosed(p: ListProject): boolean {
  if (p.status !== "open") return true;
  return isExpired(p.application_deadline, p.is_standing_pool);
}

// 축약 단위는 언어마다 다르다 — ko·ja 는 만/천만(万/千万), en 은 K/M 이다.
function formatPayShort(p: ListProject, t: FeedT, locale: Locale): string {
  if (p.pay_amount === 0 && p.pay_type === "total") return t("pay.none");
  if (p.pay_type === "negotiable") return t("pay.negotiable");
  if (!p.pay_amount) return t("pay.negotiable");
  const amount = p.pay_amount;
  // ja 는 "1.5千万" 같은 표기를 쓰지 않으므로 万 단위만 쓴다("1500万"). ko 는 종전 그대로(천만).
  const large = locale === "en" ? 1000000 : locale === "ja" ? Number.POSITIVE_INFINITY : 10000000;
  const small = locale === "en" ? 1000 : 10000;
  let label: string;
  if (amount >= large)
    label = t("pay.compact_large", {
      value: (amount / large).toFixed(amount % large === 0 ? 0 : 1),
    });
  else if (amount >= small)
    label = t("pay.compact_small", {
      value: (amount / small).toFixed(amount % small === 0 ? 0 : 1),
    });
  else label = amount.toLocaleString(localeTag(locale));
  return p.pay_type === "per_session"
    ? t("pay.short_per_session", { amount: label })
    : t("pay.short", { amount: label });
}

function payValue(p: ListProject): number {
  if (!p.pay_amount) return -1;
  return p.pay_type === "per_session" ? p.pay_amount * 4 : p.pay_amount;
}

// 한국어 지역명에서만 붙는 행정구역 접미사. 화면 문구가 아니라 ko 라벨을 줄이는 값이라
// 사전으로 옮기지 않는다. en·ja 라벨에는 이 문자열이 없어 결과가 바뀌지 않는다.
/* eslint-disable no-restricted-syntax -- i18n: 한국어 지역명 접미사(표시 문구 아님) */
const KO_REGION_SUFFIXES = ["특별시", "광역시", "특별자치도", "특별자치시"];
/* eslint-enable no-restricted-syntax */

function shortRegion(s: string | null): string {
  if (!s) return "";
  return KO_REGION_SUFFIXES.reduce((acc, suffix) => acc.replace(suffix, ""), s);
}

export function ProjectListView({
  projects,
  isAdmin = false,
}: {
  projects: ListProject[];
  isAdmin?: boolean;
}) {
  const t = useT(feed);
  const locale = useLocale();
  const privateTitle = t("row.private_title");
  const [query, setQuery] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(new Set());
  const [selectedCats, setSelectedCats] = useState<Set<ProjectCategory>>(new Set());
  const [region, setRegion] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("deadline");
  const [filterOpen, setFilterOpen] = useState(false);
  // 마감된 공고는 기본 숨김. 토글로 노출.
  const [showExpired, setShowExpired] = useState(false);

  const expiredCount = useMemo(
    () => projects.filter(isListClosed).length,
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
      // 마감된 공고는 기본 숨김 (토글로 노출). 검색어가 있어도 동일하게 적용.
      // 상시 섭외풀은 절대 만료로 보지 않아 항상 노출.
      if (!showExpired && isListClosed(p)) return false;
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
          ? privateTitle
          : `${p.title} ${p.owner_name ?? ""} ${p.region_label ?? ""} ${p.genre_label ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sort === "deadline") {
      sorted.sort((a, b) => {
        // 마감된 공고는(토글로 노출 시) 항상 맨 뒤로.
        const aExp = isListClosed(a);
        const bExp = isListClosed(b);
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
  }, [
    projects,
    query,
    selectedGenres,
    selectedCats,
    region,
    sort,
    isAdmin,
    showExpired,
    privateTitle,
  ]);

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
    <div className="flex flex-col gap-2 lg:gap-3">
      {/* Search */}
      <Input
        type="search"
        placeholder={t("list.search_placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 lg:h-11"
      />

      {/* Filter section */}
      <div className="rounded-lg border border-border bg-card/50 lg:rounded-xl">
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left lg:px-4 lg:py-3"
        >
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold">{t("list.filter")}</span>
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
                {t("list.reset")}
              </span>
            ) : null}
            <span aria-hidden>{filterOpen ? "▾" : "▸"}</span>
          </span>
        </button>

        {filterOpen ? (
          <div className="flex flex-col gap-3 border-t border-border px-3 py-3 lg:px-4">
            {availableCats.length > 0 ? (
              <FilterGroup label={t("list.group_category")}>
                {availableCats.map((c) => (
                  <Chip
                    key={c}
                    active={selectedCats.has(c)}
                    onClick={() => toggleCat(c)}
                  >
                    {labelFor("category", c, locale)}
                  </Chip>
                ))}
              </FilterGroup>
            ) : null}

            {genres.length > 0 ? (
              <FilterGroup label={t("list.group_genre")}>
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
                <option value="">{t("list.region_all")}</option>
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
                <option value="deadline">{t("list.sort_deadline")}</option>
                <option value="latest">{t("list.sort_latest")}</option>
                <option value="pay">{t("list.sort_pay")}</option>
              </select>
            </div>

          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-[10px] text-ink-3">
          {filtered.length !== poolSize
            ? t("list.count_filtered", { shown: filtered.length, total: poolSize })
            : t("list.count", { count: filtered.length })}
        </span>
        {/*
          마감 공고 토글은 접이식 필터 안에 있었다. 모바일에서 두 번 접혀 있어
          "마감된 공고를 볼 방법이 없다"는 말이 나왔다. 항상 보이는 자리로 올린다.
        */}
        {expiredCount > 0 ? (
          <div
            role="group"
            aria-label={t("list.scope_group")}
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-card p-0.5"
          >
            <ScopeChip active={!showExpired} onClick={() => setShowExpired(false)}>
              {t("list.scope_open")}
            </ScopeChip>
            <ScopeChip active={showExpired} onClick={() => setShowExpired(true)}>
              {t("list.scope_closed", { count: expiredCount })}
            </ScopeChip>
          </div>
        ) : null}
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border px-2 py-1.5 text-[10px] uppercase tracking-wider text-ink-3 lg:grid-cols-[minmax(0,1fr)_120px_72px] lg:px-4 lg:py-2">
        <span>{t("list.col_project")}</span>
        <span className="w-16 text-right lg:w-[120px]">{t("list.col_pay")}</span>
        <span className="w-10 text-right lg:w-[72px]">{t("list.col_deadline")}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-hairline-2 p-6 text-center">
          <p className="text-xs text-ink-3">{t("list.empty")}</p>
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

function ScopeChip({
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
        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-ink-3 hover:text-foreground")
      }
    >
      {children}
    </button>
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
  const t = useT(feed);
  const locale = useLocale();
  const standing = !!project.is_standing_pool;
  const dDay = daysUntilDeadline(project.application_deadline);
  const closed = isListClosed(project);
  // 마감 지남(음수) 또는 3일 이내(0~3)면 강조. 상시는 마감이 없어 강조 안 함.
  const urgent = !standing && !closed && dDay !== null && dDay <= 3;
  const masked = project.visibility === "private" && !isAdmin;

  const rowClass =
    "grid grid-cols-[1fr_auto_auto] items-center gap-2 px-2 py-2 transition-colors lg:grid-cols-[minmax(0,1fr)_120px_72px] lg:px-4 lg:py-3";
  const linkClass = `${rowClass} hover:bg-secondary`;
  const plainClass = `${rowClass} cursor-default`;

  const inner = (
    <>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {project.visibility === "private" ? (
            <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-ink-3">
              {t("row.private")}
            </span>
          ) : null}
          {standing && !closed ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-primary">
              {t("row.standing")}
            </span>
          ) : null}
          {closed ? (
            <span className="shrink-0 rounded-full border border-border bg-secondary px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-ink-3">
              {t("row.closed")}
            </span>
          ) : null}
          <div
            className="truncate text-sm font-medium leading-tight lg:text-[15px]"
            data-ugc={masked ? undefined : true}
          >
            {masked ? t("row.private_title") : project.title}
          </div>
        </div>
        <div className="mt-0.5 truncate text-[10px] text-ink-3 lg:mt-1 lg:text-xs">
          {masked
            ? t("row.private_hint")
            : (() => {
                // 지역 자유 입력·등록자명은 이용자 작성 값이라 data-ugc 로 표시한다(언어 스윕 제외).
                const parts: Array<{ text: string; ugc?: boolean }> = [
                  { text: project.category ? labelFor("category", project.category, locale) : "" },
                  { text: project.genre_label ?? "" },
                  { text: shortRegion(project.region_label) ?? "", ugc: true },
                  {
                    text: project.session_count
                      ? tCount(t, "row.sessions", locale, project.session_count)
                      : "",
                  },
                  { text: project.owner_name ?? "", ugc: true },
                ].filter((p) => p.text);
                if (parts.length === 0) return "—";
                return parts.map((p, i) => (
                  <span key={i}>
                    {i > 0 ? " · " : null}
                    {p.ugc ? <span data-ugc>{p.text}</span> : p.text}
                  </span>
                ));
              })()}
        </div>
      </div>
      <span className="w-16 text-right font-mono text-[11px] lg:w-[120px] lg:text-sm">
        {masked ? "—" : formatPayShort(project, t, locale)}
      </span>
      <span
        className={`w-10 text-right font-mono text-[11px] lg:w-[72px] lg:text-sm ${urgent ? "text-destructive" : "text-ink-3"}`}
      >
        {closed
          ? t("row.deadline_closed")
          : standing
            ? t("row.deadline_standing")
            : deadlineLabel(
                project.application_deadline,
                { none: t("row.deadline_none") },
                locale,
              )}
      </span>
    </>
  );

  return (
    <li className={`border-b border-border/60 ${closed ? "opacity-60" : ""}`}>
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
