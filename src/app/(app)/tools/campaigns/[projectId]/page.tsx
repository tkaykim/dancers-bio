import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, canManageProject, isSuperAdmin } from "@/lib/auth/guard";
import {
  boardOptions,
  checked,
  COST_COLUMNS,
  db,
  loadCampaign,
  rows,
} from "@/lib/campaign/repository";
import {
  isConfirmed,
  snapshotContext,
  summarize,
} from "@/lib/campaign/metrics";
import type { SnapshotCosts } from "@/lib/campaign/types";
import { PostsTable } from "@/components/admin/campaign/PostsTable";
import { AddPostsDialog } from "@/components/admin/campaign/AddPostsDialog";
import { SnapshotDialog } from "@/components/admin/campaign/SnapshotDialog";
import { RulesPanel } from "@/components/admin/campaign/RulesPanel";
import { ReportsPanel } from "@/components/admin/campaign/ReportsPanel";
import { TrendPanel } from "@/components/admin/campaign/TrendPanel";
import { date, number } from "@/components/campaign/ResultsReport";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireStaff(),
    { projectId } = await params;
  if (
    !/^[0-9a-f-]{36}$/i.test(projectId) ||
    !(profile.is_admin || (await canManageProject(projectId)))
  )
    notFound();
  const project = checked(
    await db()
      .from("projects")
      .select("id,title")
      .eq("id", projectId)
      .is("deleted_at", null)
      .maybeSingle(),
  );
  if (!project) notFound();
  const query = await searchParams,
    tab = ["posts", "trend", "reports"].includes(String(query.tab))
      ? String(query.tab)
      : "posts";
  const [data, boards] = await Promise.all([
    loadCampaign(projectId),
    boardOptions(projectId),
  ]);
  const confirmed = data.snapshots.filter((s) => isConfirmed(s.status));
  const selected =
    typeof query.snapshot === "string"
      ? confirmed.find((s) => s.id === query.snapshot)
      : confirmed.at(-1);
  if (query.snapshot && !selected) notFound();
  const context = selected ? snapshotContext(data, selected.id) : null,
    sum = context
      ? summarize(data.posts, context.metrics, context.accounts, data.rules)
      : null;
  let costProps: {
    costs?: (SnapshotCosts & {
      id: string;
    })[];
    supplyAmount?: number;
  } = {};
  if (isSuperAdmin(profile)) {
    const [costs, deals] = await Promise.all([
      rows<
        SnapshotCosts & {
          id: string;
        }
      >("campaign_snapshots", `id,${COST_COLUMNS}`, projectId),
      db()
        .from("project_client_deals")
        .select("expected_supply_amount")
        .eq("project_id", projectId),
    ]);
    costProps = {
      costs,
      supplyAmount: (checked(deals) ?? []).reduce(
        (
          n: number,
          d: {
            expected_supply_amount: number | null;
          },
        ) => n + Number(d.expected_supply_amount ?? 0),
        0,
      ),
    };
  }
  const href = (nextTab: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (typeof v === "string") p.set(k, v);
    p.set("tab", nextTab);
    return `?${p}`;
  };
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
      <Link href="/tools/campaigns" className="text-sm text-ink-3">
        ← 캠페인 성과
      </Link>
      <h1 className="text-2xl font-bold">{project.title}</h1>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <AddPostsDialog projectId={projectId} />
        <SnapshotDialog
          projectId={projectId}
          postsTotal={data.posts.filter((p) => p.status !== "excluded").length}
          snapshots={data.snapshots}
        />
      </div>
      <RulesPanel rules={data.rules} boards={boards} />
      <nav className="flex gap-4 border-b border-border">
        {Object.entries({
          posts: "게시물",
          trend: "추이",
          reports: "보고서",
        }).map(([key, label]) => (
          <Link
            key={key}
            href={href(key)}
            aria-current={key === tab ? "page" : undefined}
            className={`pb-3 ${key === tab ? "border-b-2 border-primary font-bold" : "text-ink-3"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap gap-2">
        {Object.entries(query)
          .filter(
            ([k, v]) =>
              k !== "snapshot" && k !== "page" && typeof v === "string",
          )
          .map(([k, v]) => (
            <input type="hidden" key={k} name={k} value={v as string} />
          ))}
        <label>
          성과 기준 회차{" "}
          <select
            name="snapshot"
            defaultValue={selected?.id ?? ""}
            className="rounded-lg border border-border bg-card px-3 py-2"
          >
            <option value="" disabled>
              확정 회차 없음
            </option>
            {confirmed.map((s) => (
              <option value={s.id} key={s.id}>
                {s.label} · {date(s.taken_at)}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={!confirmed.length}
          className="rounded-lg border border-border px-3 py-2"
        >
          회차 선택
        </button>
      </form>
      {context && sum ? (
        <section className="space-y-3">
          <p>
            재생 기준 {context.snapshot.label} ·{" "}
            {date(context.snapshot.taken_at)} · 스냅샷 {context.snapshot.id}
          </p>
          <p>
            팔로워 기준{" "}
            {context.followersSnapshot
              ? `${context.followersSnapshot.label} · ${date(context.followersSnapshot.taken_at)}`
              : "팔로워 미측정"}
          </p>
          <dl className="flex flex-wrap gap-6">
            {Object.entries({
              게시물: `${sum.posts}개`,
              "공개 확인": `${sum.found}/${sum.posts}`,
              재생: `${number(sum.plays.sum)} (${sum.plays.label})`,
              좋아요: `${number(sum.likes.sum)} (${sum.likes.label})`,
              댓글: `${number(sum.comments.sum)} (${sum.comments.label})`,
              공유: `${number(sum.shares.sum)} (${sum.shares.label})`,
              "참여 계정 팔로워": `${number(sum.followers.sum)} (${sum.followers.confirmed}/${sum.followers.total}계정)`,
            }).map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-ink-3">{k}</dt>
                <dd className="font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {sum.errors > 0 && (
            <p className="text-amber-700">
              수집 오류 {sum.errors}개는 합계와 성과 분모에서 제외했습니다.
            </p>
          )}
        </section>
      ) : (
        <p className="text-ink-3">확정된 측정 회차가 없습니다.</p>
      )}
      {tab === "posts" && (
        <PostsTable
          posts={data.posts}
          metrics={context?.metrics ?? []}
          accounts={context?.accounts ?? []}
          rules={data.rules}
          snapshots={data.snapshots}
        />
      )}
      {tab === "trend" && (
        <TrendPanel
          projectId={projectId}
          data={data}
          snapshotId={selected?.id ?? null}
          {...costProps}
        />
      )}
      {tab === "reports" && (
        <ReportsPanel
          projectId={projectId}
          reports={data.reports}
          snapshots={data.snapshots}
        />
      )}
    </main>
  );
}
