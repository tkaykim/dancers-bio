"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export type ListProject = {
  id: string;
  short_code: string | null;
  title: string;
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

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const now = Date.now();
  const target = new Date(iso).getTime();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function formatPayShort(p: ListProject): string {
  if (p.pay_type === "negotiable") return "협의";
  if (!p.pay_amount) return "협의";
  const amount = p.pay_amount;
  let label: string;
  if (amount >= 10000000) label = `${(amount / 10000000).toFixed(amount % 10000000 === 0 ? 0 : 1)}천만`;
  else if (amount >= 10000) label = `${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}만`;
  else label = amount.toLocaleString("ko-KR");
  return p.pay_type === "per_session" ? `₩${label}/회` : `₩${label}`;
}

function payValue(p: ListProject): number {
  if (!p.pay_amount) return -1;
  return p.pay_type === "per_session" ? p.pay_amount * 4 : p.pay_amount;
}

export function ProjectListView({ projects }: { projects: ListProject[] }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("deadline");

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (genre && p.genre_label !== genre) return false;
      if (region && p.region_label !== region) return false;
      if (q) {
        const hay = `${p.title} ${p.owner_name ?? ""} ${p.region_label ?? ""} ${p.genre_label ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = [...list];
    if (sort === "deadline") {
      sorted.sort((a, b) => {
        const av = a.application_deadline ? new Date(a.application_deadline).getTime() : Infinity;
        const bv = b.application_deadline ? new Date(b.application_deadline).getTime() : Infinity;
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
  }, [projects, query, genre, region, sort]);

  const hasFilter = !!(query || genre || region) || sort !== "deadline";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Input
          type="search"
          placeholder="제목·주최자·지역 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="">전체 장르</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="">전체 지역</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
          >
            <option value="deadline">마감 임박순</option>
            <option value="latest">최신순</option>
            <option value="pay">페이 높은순</option>
          </select>
          {hasFilter ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setGenre("");
                setRegion("");
                setSort("deadline");
              }}
              className="h-8 rounded-lg px-2 text-xs text-ink-3 hover:text-foreground"
            >
              초기화
            </button>
          ) : null}
        </div>
        <p className="text-[11px] text-ink-3">
          {filtered.length}건
          {filtered.length !== projects.length ? ` / 전체 ${projects.length}건` : ""}
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">조건에 맞는 공고가 없습니다.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {filtered.map((p) => (
            <ProjectRow key={p.id} project={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectRow({ project }: { project: ListProject }) {
  const dDay = daysUntil(project.application_deadline);
  const urgent = dDay !== null && dDay <= 3;

  return (
    <li>
      <Link
        href={`/projects/${project.short_code ?? project.id}`}
        className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {project.genre_label ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary">
                {project.genre_label}
              </span>
            ) : null}
            <h3 className="truncate text-sm font-semibold leading-tight">
              {project.title}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-ink-3">
            {[
              project.owner_name,
              project.region_label,
              project.session_count ? `${project.session_count}개 일정` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-xs font-medium">
            {formatPayShort(project)}
          </span>
          {dDay !== null ? (
            <span
              className={`font-mono text-[10px] ${urgent ? "text-destructive" : "text-ink-3"}`}
            >
              {dDay === 0 ? "오늘마감" : `D-${dDay}`}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-ink-3">상시</span>
          )}
        </div>
      </Link>
    </li>
  );
}
