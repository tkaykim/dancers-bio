"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CampaignData, SnapshotCosts } from "@/lib/campaign/types";
import { compareSameSet, distribution, followerTiers, forecast, isConfirmed, selectedRows, snapshotContext, summarize, topShares } from "@/lib/campaign/metrics";
import { Histogram, shortDate, ForecastTable, number, tableClass, TiersTable } from "@/components/campaign/ResultsReport";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inputClass } from "./Controls";
import { CostPanel } from "./CostPanel";
function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <Card className="min-w-0 rounded-2xl border border-border p-5 ring-0"><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-ink-3">{description}</p></div>{children}</Card>;
}
export function TrendPanel({ projectId, data, snapshotId, costs, supplyAmount }: { projectId: string; data: CampaignData; snapshotId: string | null; costs?: (SnapshotCosts & { id: string })[]; supplyAmount?: number }) {
  const router = useRouter();
  const confirmed = data.snapshots.filter(s => isConfirmed(s.status));
  const selectedIndex = confirmed.findIndex(s => s.id === snapshotId);
  const [beforeId, setBeforeId] = useState(confirmed[Math.max(0, selectedIndex - 1)]?.id ?? "");
  const [afterId, setAfterId] = useState(snapshotId ?? "");
  const context = snapshotId ? snapshotContext(data, snapshotId) : null;
  const rows = context ? selectedRows(data.posts, context.metrics) : [];
  const comparison = beforeId && afterId && beforeId !== afterId ? compareSameSet(selectedRows(data.posts, data.metrics.filter(m => m.snapshot_id === beforeId)), selectedRows(data.posts, data.metrics.filter(m => m.snapshot_id === afterId))) : null;
  return <div className="space-y-5">
    <Panel title="측정 회차" description="회차를 선택하면 해당 시점의 게시물 성과를 볼 수 있습니다.">
      <div className="relative max-h-96 overflow-auto"><table className={tableClass}><thead><tr>{["회차", "시각 (KST)", "상태", "확인", "재생", "좋아요 (n)", "댓글", "공유 (n)", "팔로워", ...(costs ? ["예상 / 실제 비용"] : [])].map((h, i) => <th scope="col" key={h} className={i >= 3 && i <= 7 ? "text-right" : ""}>{h}</th>)}</tr></thead><tbody>
        {data.snapshots.map(s => {
          const total = summarize(data.posts, data.metrics.filter(m => m.snapshot_id === s.id), [], data.rules), cost = costs?.find(c => c.id === s.id);
          const href = `/tools/campaigns/${projectId}?tab=posts&snapshot=${s.id}`;
          return <tr key={s.id} className={isConfirmed(s.status) ? "cursor-pointer hover:bg-secondary" : ""} onClick={() => { if (isConfirmed(s.status)) router.push(href); }}>
            <td>{isConfirmed(s.status) ? <Link href={href} className="whitespace-nowrap font-medium hover:underline">{s.label}</Link> : s.label}</td>
            <td className="whitespace-nowrap text-xs text-ink-3">{shortDate(s.taken_at)}</td>
            <td><Badge tone={s.status === "succeeded" ? "success" : s.status === "failed" ? "danger" : "warning"}>{{ reserved: "준비 중", running: "수집 중", succeeded: "완료", partial: "일부 완료", failed: "실패" }[s.status]}</Badge>{s.error && <span className="sr-only">일부 데이터를 수집하지 못했습니다.</span>}</td>
            <td className="text-right">{s.posts_found}/{s.posts_total}</td>
            {(["plays", "likes", "comments", "shares"] as const).map(key => <td key={key} className="whitespace-nowrap text-right tabular-nums">{isConfirmed(s.status) ? number(total[key].sum) : "—"}{isConfirmed(s.status) && key !== "plays" && <span className="ml-1 text-[11px] text-ink-3">({total[key].confirmed})</span>}</td>)}
            <td className="whitespace-nowrap text-xs text-ink-3">{isConfirmed(s.status) ? s.followers_snapshot_id === s.id ? "수집 완료" : s.followers_snapshot_id ? "이전 회차 기준" : "미수집" : s.followers_collected ? "수집 예정" : "미수집"}</td>
            {costs && <td className="whitespace-nowrap text-right text-xs">{cost ? `$${cost.estimated_cost_usd.toFixed(3)} / ${cost.apify_cost_usd == null ? "미확인" : "$" + cost.apify_cost_usd.toFixed(3)}` : "—"}</td>}
          </tr>;
        })}
      </tbody></table>{!data.snapshots.length && <p className="py-10 text-center text-sm text-ink-3">아직 측정 회차가 없습니다.</p>}</div>
    </Panel>
    {context ? <div className="grid items-start gap-5 lg:grid-cols-2">
      <Panel title="동일집합 비교" description="두 회차 모두 재생 수가 확인된 게시물만 비교합니다.">
        <div className="flex flex-wrap items-center gap-2">{[[beforeId, setBeforeId, "비교 시작 회차"], [afterId, setAfterId, "비교 종료 회차"]].map(([value, setter, label], i) => <select key={i} aria-label={label as string} className={inputClass + " min-w-0 flex-1"} value={value as string} onChange={e => (setter as (id: string) => void)(e.target.value)}>{confirmed.map(s => <option key={s.id} value={s.id}>{s.label} · {shortDate(s.taken_at)}</option>)}</select>)}</div>
        <p className="text-4xl font-bold tracking-tight tabular-nums">{comparison?.growth == null ? "—" : `${comparison.growth >= 0 ? "+" : ""}${number(comparison.growth)}%`}</p>
        <p className="text-sm text-ink-2">{comparison ? `${comparison.count}개 기준 ${number(comparison.before)} → ${number(comparison.after)}` : "서로 다른 확정 회차 두 개를 선택해 주세요."}</p>
        {comparison?.recommendStop && <div><Badge tone="warning">증가율 5% 미만</Badge><p className="mt-2 text-xs text-ink-3">LG 기준에 따라 추가 측정 종료를 검토할 수 있습니다.</p></div>}
      </Panel>
      <Panel title="재생 분포" description={`${context.snapshot.label} · 재생 수가 확인된 게시물 기준`}>
        <Histogram rows={distribution(rows).map(d => ({ label: d.label, value: d.count }))} />
        <table className="w-full text-xs"><thead><tr><th scope="col" className="text-left font-medium text-ink-3">상위 게시물</th><th scope="col" className="text-right font-medium text-ink-3">전체 재생 비중</th></tr></thead><tbody>{topShares(rows).map(t => <tr key={t.top}><td className="py-1.5">상위 {t.top}개</td><td className="text-right tabular-nums">{t.percent == null ? "—" : number(t.percent) + "%"}</td></tr>)}</tbody></table>
      </Panel>
      <Panel title="팔로워 구간" description="공동작업 계정의 팔로워를 합산해 게시물 규모를 구분합니다."><TiersTable rows={followerTiers(data.posts, rows, context.accounts)} /></Panel>
      <Panel title="예측 대비 실현율" description="예측 보드와 연결된 계정의 실제 재생을 비교합니다."><div className="relative max-h-96 overflow-auto"><ForecastTable data={forecast(data.posts, rows)} /></div></Panel>
      {supplyAmount !== undefined && <CostPanel projectId={projectId} supplyAmount={supplyAmount} summary={summarize(data.posts, rows, context.accounts, data.rules)} />}
    </div> : <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-ink-3">확정된 측정 회차가 있어야 추이를 비교할 수 있습니다.</p>}
  </div>;
}
