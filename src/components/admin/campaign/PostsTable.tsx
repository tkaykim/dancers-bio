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
import { number, date, tableClass } from "@/components/campaign/ResultsReport";
import { PostSheet } from "./PostSheet";
import { buttonClass, inputClass } from "./Controls";
export function PostsTable({
  posts,
  metrics,
  accounts,
  rules,
  snapshots,
}: {
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
        !`${p.owner_handle ?? ""} ${p.display_name ?? ""} ${p.short_code} ${p.collab_handles.join(" ")}`
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
        <input
          aria-label="핸들·이름·shortcode 검색"
          className={inputClass}
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
        <button className={buttonClass}>검색·정렬</button>
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
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              {[
                "계정",
                "참여자",
                "게시물",
                "게시일",
                "팔로워",
                "재생",
                "좋아요",
                "댓글",
                "공유",
                "준수",
                "상태",
                "메모",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice((page - 1) * 50, page * 50).map(({ p, m, f, c }) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="text-left underline"
                    onClick={() => setSelected(p)}
                  >
                    @{p.owner_handle ?? "미확인"}
                  </button>
                  {p.collab_handles.length > 0 && (
                    <small className="block">
                      + {p.collab_handles.join(", ")}
                    </small>
                  )}
                </td>
                <td>{p.display_name ?? "—"}</td>
                <td>
                  <a
                    href={p.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {p.short_code}
                  </a>
                </td>
                <td>{date(p.posted_at)}</td>
                <td>
                  {f.confirmed ? number(f.sum) : "미측정"}
                  <small className="block">{f.label}</small>
                </td>
                <td>{number(m?.plays)}</td>
                <td>{number(m?.likes)}</td>
                <td>{number(m?.comments)}</td>
                <td>{number(m?.shares)}</td>
                <td>
                  {Object.entries(c).map(([k, v]) => (
                    <small className="block" key={k}>
                      {
                        (
                          {
                            audio: "음원",
                            tags: "태그",
                            mentions: "멘션",
                            partnership: "파트너십",
                          } as Record<string, string>
                        )[k]
                      }{" "}
                      {v === null ? "미확인" : v ? "확인" : "미충족"}
                    </small>
                  ))}
                </td>
                <td>
                  {p.status}
                  <small className="block">{m?.fetch_status}</small>
                </td>
                <td>
                  <button
                    className="max-w-40 truncate text-left underline"
                    onClick={() => setSelected(p)}
                  >
                    {p.note ?? "편집"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && (
          <p className="p-8 text-center text-ink-3">
            조건에 맞는 게시물이 없습니다.
          </p>
        )}
      </div>
      <nav aria-label="게시물 페이지" className="flex gap-4">
        <span>
          {items.length}개 · {page}/{pages}페이지 · 50개씩
        </span>
        {page > 1 && (
          <Link
            href={href({
              page: String(page - 1),
            })}
          >
            이전
          </Link>
        )}
        {page < pages && (
          <Link
            href={href({
              page: String(page + 1),
            })}
          >
            다음
          </Link>
        )}
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
