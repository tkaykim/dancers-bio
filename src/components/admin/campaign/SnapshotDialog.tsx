"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { failStaleSnapshotAction, pollSnapshotAction, startSnapshotAction } from "@/app/actions/campaign-results";
import type { Snapshot, SnapshotCosts } from "@/lib/campaign/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Editor, ErrorText, useAction } from "./Controls";

export function SnapshotProgress({ snapshots }: { snapshots: Snapshot[] }) {
  const action = useAction();
  const [now, setNow] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <div className="space-y-2 text-xs" role="status">
    {snapshots.filter(s => ["reserved", "running"].includes(s.status)).map(s => <div key={s.id} className="flex flex-wrap items-center gap-2">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      <span>{s.label} {s.status === "reserved" ? "준비 중" : "수집 중"} · {s.profiles_run_id ? 2 : 1}/{s.followers_collected ? 2 : 1} 단계</span>
      {now > 0 && <span className="text-ink-3">{Math.max(0, Math.floor((now - Date.parse(s.created_at)) / 1000))}초 경과</span>}
      {now - Date.parse(s.created_at) >= 1800000 && <Button size="xs" variant="outline" disabled={action.pending} onClick={() => action.run(() => failStaleSnapshotAction(s.id))}>실패 처리</Button>}
    </div>)}
    <ErrorText error={action.error} />
  </div>;
}
export function SnapshotDialog({ projectId, postsTotal, snapshots, firstPostedAt, accountTotal, showCost = false, costs }: {
  projectId: string; postsTotal: number; snapshots: Snapshot[]; firstPostedAt: string | null; accountTotal: number; showCost?: boolean; costs?: (SnapshotCosts & { id: string })[];
}) {
  const [open, setOpen] = useState(false), [label, setLabel] = useState(""), [shares, setShares] = useState(false), [followers, setFollowers] = useState(true);
  const [startedId, setStartedId] = useState<string | null>(null), [pollError, setPollError] = useState<string | null>(null);
  const action = useAction(), router = useRouter();
  const active = snapshots.filter(s => ["reserved", "running"].includes(s.status));
  const activeIds = active.map(s => s.id).join(",");
  const started = snapshots.find(s => s.id === startedId);
  const finished = started && !["reserved", "running"].includes(started.status);
  const estimate = postsTotal * (shares ? .0083 : .0025) + (followers ? accountTotal * .0026 : 0);
  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false, busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        for (const id of activeIds.split(",")) {
          const result = await pollSnapshotAction(id);
          if (cancelled) return;
          if (!result.ok) setPollError(result.error);
          else { setPollError(null); router.refresh(); }
        }
      } catch { if (!cancelled) setPollError("진행 상태를 확인하지 못했습니다. 자동으로 다시 확인합니다."); }
      finally { busy = false; }
    }, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeIds, router]);
  return <Editor title="스냅샷 실행" open={open} onOpenChange={value => {
    setOpen(value);
    if (value && !label) setLabel(firstPostedAt ? `T+${Math.max(0, Math.floor((Date.now() + 9 * 3600000) / 86400000) - Math.floor((Date.parse(firstPostedAt) + 9 * 3600000) / 86400000))}` : `S${snapshots.length + 1}`);
  }}>
    {active.length || (startedId && !started) ? <div className="space-y-4 rounded-xl bg-secondary p-5">
      <h3 className="font-semibold">성과를 수집하고 있습니다.</h3>
      <SnapshotProgress snapshots={snapshots} />
      {!active.length && <p role="status">측정 회차를 준비하고 있습니다.</p>}
      <p className="text-xs text-ink-3">창을 닫아도 수집은 계속됩니다.</p>
    </div> : finished ? <div className="space-y-4">
      <Badge tone={started.status === "failed" ? "danger" : started.status === "partial" ? "warning" : "success"}>{started.status === "failed" ? "수집 실패" : started.status === "partial" ? "일부 완료" : "수집 완료"}</Badge>
      <p className="text-xl font-semibold">{started.label} · 확인 {started.posts_found}/{started.posts_total}개</p>
      {showCost && <p>실제 비용 {costs?.find(c => c.id === started.id)?.apify_cost_usd == null ? "미확인" : `$${costs?.find(c => c.id === started.id)?.apify_cost_usd?.toFixed(3)}`}</p>}
      {started.error && <ErrorText error="일부 데이터를 수집하지 못했습니다. 추이에서 측정 결과를 확인해 주세요." />}
      <Button onClick={() => { setOpen(false); setStartedId(null); }}>닫기</Button>
    </div> : <form className="space-y-5" onSubmit={e => {
      e.preventDefault();
      action.run(() => startSnapshotAction(projectId, { label, includeShares: shares, collectFollowers: followers }), d => setStartedId(d.id));
    }}>
      <p className="rounded-xl bg-secondary p-4">수집 대상 <strong className="tabular-nums">{postsTotal}개</strong></p>
      <div className="space-y-2"><Label htmlFor="snapshot-label">회차 라벨</Label><Input id="snapshot-label" value={label} onChange={e => setLabel(e.target.value)} /></div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={shares} onChange={e => setShares(e.target.checked)} />공유 수 포함</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={followers} onChange={e => setFollowers(e.target.checked)} />팔로워 수집</label>
      </div>
      {showCost && <div><p className="text-xs text-ink-3">예상 수집 비용</p><p className="text-2xl font-bold tabular-nums">약 $ {estimate.toFixed(3)}</p><p className="text-xs text-ink-3">현재 확인된 계정 기준이며, 새로 확인된 계정에 따라 달라질 수 있습니다.</p></div>}
      {!postsTotal && <p className="text-sm text-ink-3">게시물을 먼저 추가해 주세요.</p>}
      <Button type="submit" disabled={action.pending || !postsTotal}>{action.pending ? "시작 중…" : "실행"}</Button>
    </form>}
    <ErrorText error={action.error ?? pollError} />
  </Editor>;
}
