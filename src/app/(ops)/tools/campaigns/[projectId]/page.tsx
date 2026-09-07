import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff, canManageProject, isSuperAdmin } from "@/lib/auth/guard";
import {
  boardOptions,
  candidatesFor,
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
import { SnapshotBar } from "@/components/admin/campaign/SnapshotBar";
import { loadSubmissions } from "@/lib/campaign/submission-repository";
import { SubmissionsPanel } from "@/components/admin/campaign/SubmissionsPanel";
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
  const query = await searchParams;
  const [data, boards, candidates, submissions] = await Promise.all([
    loadCampaign(projectId),
    boardOptions(projectId),
    candidatesFor(projectId),
    loadSubmissions(projectId),
  ]);
  const tab = ["submissions", "posts", "trend", "reports"].includes(String(query.tab))
    ? String(query.tab)
    : submissions.settings.enabled ? "submissions" : "posts";
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
  const latest = confirmed.at(-1);
  const cards = [
    { label: "게시물", value: sum ? number(sum.posts) : number(data.posts.length), detail: "집계 대상 게시물" },
    { label: "공개 확인", value: sum ? number(sum.found) : "—", detail: sum ? `${sum.found}/${sum.posts}개 기준` : "측정 전" },
    { label: "재생", value: sum ? number(sum.plays.sum) : "—", detail: sum?.plays.label ?? "측정 전" },
    { label: "좋아요", value: sum ? number(sum.likes.sum) : "—", detail: sum?.likes.label ?? "측정 전" },
    { label: "댓글 · 공유", value: sum ? `${number(sum.comments.sum)} · ${number(sum.shares.sum)}` : "—", detail: sum ? `댓글 ${sum.comments.confirmed}/${sum.comments.total} · 공유 ${sum.shares.confirmed}/${sum.shares.total}개` : "측정 전" },
    { label: "참여 계정 팔로워", value: sum?.followers.confirmed ? number(sum.followers.sum) : "—", detail: sum ? `기준 ${context?.followersSnapshot?.label ?? "미측정"} · ${sum.followers.confirmed}/${sum.followers.total}계정` : "측정 전" },
  ];
  const accountNames = context?.followersSnapshot ? checked(await db().from("campaign_account_metrics").select("handle,full_name").eq("project_id", projectId).eq("snapshot_id", context.followersSnapshot.id)) as { handle: string; full_name: string | null }[] : [];
  const names = Object.fromEntries(data.posts.map(p => {
    const matches = candidates.filter(c => p.application_id ? c.applicationId === p.application_id : p.dancer_id ? c.dancerId === p.dancer_id : p.owner_handle && c.handles.includes(p.owner_handle));
    const candidate = matches.length === 1 ? matches[0] : undefined;
    return [p.id, p.display_name || (candidate?.name !== "이름 없음" ? candidate?.name : null) || accountNames?.find(a => a.handle === p.owner_handle)?.full_name || ""];
  }));
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Link href="/tools/campaigns" className="text-xs text-ink-3 hover:text-foreground">← 캠페인 성과</Link>
          <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
          <p className="text-xs text-ink-3">게시물 {data.posts.length} · 마지막 확정 {latest ? `${latest.label} · ${date(latest.taken_at)}` : "측정 전"}</p>
        </div>
        {tab !== "submissions" && <div className="flex flex-wrap items-center gap-2">
          <AddPostsDialog projectId={projectId} existingCodes={data.posts.map(p => p.short_code)} />
          <SnapshotDialog projectId={projectId} postsTotal={data.posts.filter(p => p.status !== "excluded").length} snapshots={data.snapshots} firstPostedAt={data.rules.first_posted_at} accountTotal={new Set(data.posts.filter(p => p.status !== "excluded").flatMap(p => [p.owner_handle, ...p.collab_handles].filter(Boolean))).size} {...(isSuperAdmin(profile) ? { showCost: true, costs: costProps.costs } : {})} />
          <RulesPanel rules={data.rules} boards={boards} />
        </div>}
      </header>
      {tab !== "submissions" && <>
      <SnapshotBar snapshots={data.snapshots} selectedId={selected?.id ?? ""} followersSnapshot={context?.followersSnapshot ?? null} />
      <section aria-label="캠페인 핵심 지표" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(card => <div key={card.label} className="min-w-0 rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-3">{card.label}</p>
          <p className="my-2 break-words text-xl font-bold tabular-nums">{card.value}</p>
          <p className="text-[11px] text-ink-3">{card.detail}</p>
        </div>)}
      </section>
      {sum && sum.errors > 0 && <p role="status" className="text-xs text-warn">수집 오류 {sum.errors}개는 합계와 성과 분모에서 제외했습니다.</p>}
      </>}
      <nav aria-label="캠페인 보기" className="flex gap-6 border-b border-border">
        {Object.entries({ submissions: "제출 현황", posts: "게시물", trend: "추이", reports: "보고서" }).map(([key, label]) => <Link key={key} href={href(key)} aria-current={key === tab ? "page" : undefined} className={`pb-3 text-sm ${key === tab ? "border-b-2 border-primary font-semibold" : "text-ink-3 hover:text-foreground"}`}>{label}</Link>)}
      </nav>
      {tab === "submissions" && <SubmissionsPanel initial={submissions} boards={boards} />}
      {tab === "posts" && <PostsTable posts={data.posts} names={names} metrics={context?.metrics ?? []} accounts={context?.accounts ?? []} rules={data.rules} snapshots={data.snapshots} />}
      {tab === "trend" && <TrendPanel projectId={projectId} data={data} snapshotId={selected?.id ?? null} {...costProps} />}
      {tab === "reports" && <ReportsPanel projectId={projectId} reports={data.reports} snapshots={data.snapshots} />}
    </div>
  );
}
