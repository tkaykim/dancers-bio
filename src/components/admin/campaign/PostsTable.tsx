"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type {
  AccountMetric,
  Metric,
  Post,
  Rules,
  Snapshot,
} from "@/lib/campaign/types";
import { compliance, postFollowers } from "@/lib/campaign/metrics";
import { number, tableClass } from "@/components/campaign/ResultsReport";
import { PostSheet } from "./PostSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Music2, Hash, AtSign } from "lucide-react";
import { shortDate } from "@/components/campaign/ResultsReport";
import { inputClass } from "./Controls";
export function PostsTable({
  posts,
  metrics,
  accounts,
  rules,
  snapshots,
  names = {},
}: {
  names?: Record<string, string>;
  posts: Post[];
  metrics: Metric[];
  accounts: AccountMetric[];
  rules: Rules;
  snapshots: Snapshot[];
}) {
  const params = useSearchParams(),
    path = usePathname();
  const [selected, setSelected] = useState<Post | null>(null);
  const q = (params.get("q") ?? "").toLowerCase(),
    filter = params.get("filter") ?? "all",
    sort = params.get("sort") ?? "plays";
  const byId = new Map(metrics.map((m) => [m.post_id, m]));
  const items = posts
    .map((p) => ({
      p,
      m: byId.get(p.id),
      f: postFollowers(p, accounts),
      c: compliance(byId.get(p.id), rules),
    }))
    .filter(({ p, m, f, c }) => {
      if (
        !`${p.owner_handle ?? ""} ${names[p.id] ?? p.display_name ?? ""} ${p.short_code} ${p.collab_handles.join(" ")}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (["active", "unverified", "removed", "excluded"].includes(filter))
        return p.status === filter;
      if (filter === "collab") return p.collab_handles.length > 0;
      if (filter === "likes") return m?.likes == null;
      if (filter === "compliance")
        return Object.values(c).some((v) => v === false);
      if (filter.startsWith("followers:")) {
        const [lo, hi] = filter.slice(10).split("-").map(Number);
        return (
          f.total > 0 && f.confirmed === f.total && f.sum >= lo && f.sum < hi
        );
      }
      return true;
    })
    .sort((a, b) => {
      const value = (r: typeof a) =>
        sort === "posted_at"
          ? Date.parse(r.p.posted_at ?? "") || -1
          : sort === "followers"
            ? r.f.confirmed
              ? r.f.sum
              : -1
            : sort === "likes"
              ? (r.m?.likes ?? -1)
              : (r.m?.plays ?? -1);
      return value(b) - value(a);
    });
  const pages = Math.max(1, Math.ceil(items.length / 50)),
    page = Math.min(pages, Math.max(1, Number(params.get("page")) || 1));
  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    return `${path}?${next}`;
  };
  return (
    <section className="space-y-4">
      <form className="flex flex-wrap gap-2">
        {[...params.entries()]
          .filter(([k]) => !["q", "sort", "page"].includes(k))
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <Input
          aria-label="핸들·이름·shortcode 검색"
          className="min-w-48 flex-1"
          name="q"
          defaultValue={q}
          placeholder="핸들 · 이름 · shortcode"
        />
        <select
          aria-label="게시물 정렬"
          className={inputClass}
          name="sort"
          defaultValue={sort}
        >
          <option value="plays">재생순</option>
          <option value="likes">좋아요순</option>
          <option value="followers">팔로워순</option>
          <option value="posted_at">게시일순</option>
        </select>
        <Button type="submit" variant="outline">검색·정렬</Button><span className="self-center text-xs text-ink-3">{items.length}건</span>
      </form>
      <div className="flex flex-wrap gap-2">
        {Object.entries({
          all: "전체",
          active: "활성",
          unverified: "미확인",
          removed: "삭제 확인",
          excluded: "집계 제외",
          collab: "공동작업",
          likes: "좋아요 미확인",
          compliance: "준수 누락",
          "followers:0-1000": "팔로워 1천 미만",
          "followers:1000-5000": "1천–5천",
          "followers:5000-10000": "5천–1만",
          "followers:10000-Infinity": "1만 이상",
        }).map(([key, label]) => (
          <Link
            key={key}
            href={href({
              filter: key,
              page: "1",
            })}
            aria-current={key === filter ? "page" : undefined}
            className={`rounded-full border border-border px-3 py-1 text-xs ${key === filter ? "bg-primary text-primary-foreground" : "text-ink-2"}`}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="relative max-h-[65svh] overflow-auto rounded-2xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              {["계정", "게시물", "팔로워", "재생", "좋아요", "댓글", "공유", "준수", "상태", ""].map((h, i) => <th scope="col" key={i} className={i >= 2 && i <= 6 ? "text-right" : ""}>{h || <span className="sr-only">편집</span>}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.slice((page - 1) * 50, page * 50).map(({ p, m, f, c }) => {
              const status = p.status === "excluded" ? "제외" : p.status === "removed" ? "삭제" : m?.fetch_status === "error" ? "오류" : m?.fetch_status === "found" && p.status === "active" ? "게시 중" : "미확인";
              const name = names[p.id] || p.display_name;
              return <tr key={p.id} className="cursor-pointer hover:bg-secondary" onClick={() => setSelected(p)}>
                <td className="min-w-36">
                  <div className="flex items-center gap-1.5">{p.owner_handle ? <a href={`https://www.instagram.com/${p.owner_handle}/`} target="_blank" rel="noreferrer" className="font-medium hover:underline" onClick={e => e.stopPropagation()}>@{p.owner_handle}</a> : <span className="text-ink-3">계정 미확인</span>}
                  {p.collab_handles.length > 0 && <Badge title={p.collab_handles.map(h => "@" + h).join(", ")}>+{p.collab_handles.length}</Badge>}</div>
                  {name && <p className="mt-0.5 text-[11px] text-ink-3">{name}</p>}
                </td>
                <td><a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" onClick={e => e.stopPropagation()}>{p.short_code}</a><p className="mt-0.5 whitespace-nowrap text-[11px] text-ink-3">{shortDate(p.posted_at)}</p></td>
                <td className="text-right tabular-nums"><span title={f.confirmed ? undefined : "미확인"}>{f.confirmed ? number(f.sum) : "—"}</span><p className="text-[11px] text-ink-3">{f.confirmed}/{f.total}계정</p></td>
                {(["plays", "likes", "comments", "shares"] as const).map(key => <td key={key} className="text-right tabular-nums" title={m?.[key] == null ? "미확인" : undefined}>{number(m?.[key])}</td>)}
                <td><div className="flex items-center gap-2">{([ ["audio", "음원", Music2], ["tags", "태그", Hash], ["mentions", "멘션", AtSign] ] as const).filter(([key]) => key in c).map(([key, label, Icon]) => <span key={key} title={`${label}: ${c[key] == null ? "미확인" : c[key] ? "충족" : "미충족"}`} className={`inline-flex items-center gap-0.5 text-xs ${c[key] == null ? "text-ink-3" : c[key] ? "text-ok" : "text-destructive"}`}><Icon className="size-3" aria-hidden /><span aria-hidden>{c[key] == null ? "–" : c[key] ? "✓" : "✕"}</span><span className="sr-only">{label} {c[key] == null ? "미확인" : c[key] ? "충족" : "미충족"}</span></span>)}</div></td>
                <td><Badge tone={status === "게시 중" ? "success" : status === "오류" ? "danger" : status === "미확인" ? "warning" : "neutral"}>{status}</Badge></td>
                <td><Button variant="ghost" size="icon" aria-label={`${p.short_code} 게시물 편집`} onClick={e => { e.stopPropagation(); setSelected(p); }}><Pencil className="size-3.5" /></Button></td>
              </tr>;
            })}
          </tbody>
        </table>
        {!items.length && (
          <p className="p-8 text-center text-ink-3">
            조건에 맞는 게시물이 없습니다.
          </p>
        )}
      </div>
      <nav aria-label="게시물 페이지" className="flex items-center justify-center gap-4 text-sm">
        {page > 1 && (
          <Link
            href={href({
              page: String(page - 1),
            })}
          >
            이전
          </Link>
        )}
        {page === 1 && <span aria-disabled="true" className="text-ink-3">이전</span>}
        <span className="text-ink-3">{page}/{pages}</span>
        {page < pages && (
          <Link
            href={href({
              page: String(page + 1),
            })}
          >
            다음
          </Link>
        )}
        {page === pages && <span aria-disabled="true" className="text-ink-3">다음</span>}
      </nav>
      {selected && (
        <PostSheet
          key={selected.id}
          post={selected}
          snapshots={snapshots}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
