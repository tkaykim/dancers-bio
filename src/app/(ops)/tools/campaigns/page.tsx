import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/guard";
import {
  checked,
  db,
  loadCampaign,
  permittedProjects,
} from "@/lib/campaign/repository";
import {
  isConfirmed,
  snapshotContext,
  summarize,
} from "@/lib/campaign/metrics";
import { AddCampaign } from "@/components/admin/campaign/AddCampaign";
import { shortDate, number, tableClass } from "@/components/campaign/ResultsReport";
export const dynamic = "force-dynamic";
export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireStaff(),
    params = await searchParams;
  const get = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const q = get("q"),
    filter = get("filter") || "all",
    sort = get("sort") || "latest";
  const projects = await permittedProjects(profile);
  const active = new Set<string>();
  // Service-role queries are restricted even when the UI already filters projects.
  if (projects.length)
    for (const table of ["campaign_posts", "campaign_reports"]) {
      for (let offset = 0; ; offset += 1000) {
        const batch = checked(
          await db()
            .from(table)
            .select("project_id")
            .in(
              "project_id",
              projects.map((p) => p.id),
            )
            .range(offset, offset + 999),
        ) as {
          project_id: string;
        }[];
        batch.forEach((p) => active.add(p.project_id));
        if (batch.length < 1000) break;
      }
    }
  const rows = await Promise.all(
    projects
      .filter(
        (p) =>
          active.has(p.id) && p.title.toLowerCase().includes(q.toLowerCase()),
      )
      .map(async (p) => {
        const data = await loadCampaign(p.id),
          latest = data.snapshots.filter((s) => isConfirmed(s.status)).at(-1);
        const context = latest ? snapshotContext(data, latest.id) : null;
        return {
          ...p,
          posts: data.posts.length,
          latest,
          summary: context
            ? summarize(
                data.posts,
                context.metrics,
                context.accounts,
                data.rules,
              )
            : null,
          reports: data.reports.filter(r => r.published_at).length,
          running: data.snapshots.some((s) =>
            ["reserved", "running"].includes(s.status),
          ),
        };
      }),
  );
  const filtered = rows
    .filter(
      (r) =>
        filter === "all" ||
        (filter === "running"
          ? r.running
          : filter === "reports"
            ? r.reports > 0
            : !r.latest),
    )
    .sort((a, b) =>
      sort === "plays"
        ? (b.summary?.plays.sum ?? -1) - (a.summary?.plays.sum ?? -1)
        : sort === "title"
          ? a.title.localeCompare(b.title, "ko")
          : (b.latest?.taken_at ?? b.created_at).localeCompare(
              a.latest?.taken_at ?? a.created_at,
            ),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 50)),
    page = Math.min(pages, Math.max(1, parseInt(get("page")) || 1));
  const href = (patch: Record<string, string>) =>
    `/tools/campaigns?${new URLSearchParams({
      q,
      filter,
      sort,
      page: String(page),
      ...patch,
    })}`;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight">캠페인 성과</h1><p className="mt-2 text-sm text-ink-3">게시물 성과를 측정하고 클라이언트 보고서를 관리합니다.</p></div><AddCampaign projects={projects} /></header>
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="filter" value={filter} />
        <Input
          name="q"
          aria-label="프로젝트 제목 검색"
          defaultValue={q}
          placeholder="프로젝트 제목 검색"
          className="max-w-sm"
        />
        <select
          name="sort"
          aria-label="정렬"
          defaultValue={sort}
          className="rounded-lg border border-border bg-card px-3 py-2"
        >
          <option value="latest">최신순</option>
          <option value="plays">재생순</option>
          <option value="title">제목순</option>
        </select>
        <Button type="submit" variant="outline">검색·정렬</Button><span className="self-center text-xs text-ink-3">{filtered.length}건</span>
      </form>
      <nav className="flex gap-2">
        {Object.entries({
          all: "전체",
          running: "수집 중",
          reports: "보고서 있음",
          unmeasured: "미측정",
        }).map(([key, label]) => (
          <Link
            key={key}
            href={href({
              filter: key,
              page: "1",
            })}
            className={`rounded-full border border-border px-3 py-1 text-sm ${filter === key ? "bg-primary text-primary-foreground" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="max-h-[65svh] overflow-auto rounded-2xl border border-border bg-card">
        <table className={tableClass + " [&_td:nth-child(2)]:text-right [&_td:nth-child(4)]:text-right [&_td:nth-child(5)]:text-right [&_td:nth-child(6)]:text-right [&_th:nth-child(2)]:text-right [&_th:nth-child(4)]:text-right [&_th:nth-child(5)]:text-right [&_th:nth-child(6)]:text-right"}>
          <thead>
            <tr>
              {[
                "프로젝트",
                "게시물",
                "마지막 확정 회차",
                "누적 재생",
                "공개 확인",
                "발행 보고서",
                "",
              ].map((h) => (
                <th scope="col" key={h}>{h || <span className="sr-only">열기</span>}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice((page - 1) * 50, page * 50).map((r) => (
              <tr key={r.id}>
                <td>
                  <Link
                    className="font-medium underline"
                    href={`/tools/campaigns/${r.id}`}
                  >
                    {r.title}
                  </Link>
                </td>
                <td>{r.posts}</td>
                <td>{r.latest?.label ?? "미측정"}<p className="mt-0.5 text-[11px] text-ink-3">{shortDate(r.latest?.taken_at ?? null)}{r.latest ? " KST" : ""}</p></td>
                <td>{r.summary ? number(r.summary.plays.sum) : "—"}</td>
                <td>
                  {r.summary ? `${r.summary.posts ? Math.round(r.summary.found / r.summary.posts * 100) : 0}% (${r.summary.found}/${r.summary.posts})` : "—"}
                </td>
                <td>
                  <Link href={`/tools/campaigns/${r.id}?tab=reports`}>
                    {r.reports}개
                  </Link>
                </td>
                <td><Link className="whitespace-nowrap text-xs font-medium" href={`/tools/campaigns/${r.id}`}>열기 →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-8 text-center text-ink-3">
            {q ? "검색 조건에 맞는 캠페인이 없습니다." : "등록된 캠페인이 없습니다. 캠페인을 추가해 주세요."}
          </p>
        )}
      </div>
      <nav aria-label="캠페인 페이지" className="flex gap-4">
        <span>
          {filtered.length}건 · {page}/{pages}페이지 · 50건씩
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
    </div>
  );
}
