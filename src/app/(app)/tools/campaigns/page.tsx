import Link from "next/link";
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
import { date, number, tableClass } from "@/components/campaign/ResultsReport";
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
          reports: data.reports.length,
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
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <header>
        <p className="text-xs text-ink-3">도구</p>
        <h1 className="text-2xl font-bold">캠페인 성과</h1>
      </header>
      <AddCampaign projects={projects} />
      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="filter" value={filter} />
        <input
          name="q"
          aria-label="프로젝트 제목 검색"
          defaultValue={q}
          placeholder="프로젝트 제목 검색"
          className="rounded-lg border border-border bg-card px-3 py-2"
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
        <button className="rounded-lg border border-border px-3 py-2">
          검색·정렬
        </button>
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
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className={tableClass}>
          <thead>
            <tr>
              {[
                "프로젝트",
                "게시물",
                "마지막 확정 회차",
                "측정 시각",
                "누적 재생",
                "공개 확인",
                "보고서 링크",
              ].map((h) => (
                <th key={h}>{h}</th>
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
                <td>{r.latest?.label ?? "미측정"}</td>
                <td>{date(r.latest?.taken_at ?? null)}</td>
                <td>{r.summary ? number(r.summary.plays.sum) : "—"}</td>
                <td>
                  {r.summary ? `${r.summary.found}/${r.summary.posts}` : "—"}
                </td>
                <td>
                  <Link href={`/tools/campaigns/${r.id}?tab=reports`}>
                    {r.reports}개
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="p-8 text-center text-ink-3">
            등록된 캠페인이 없습니다.
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
    </main>
  );
}
