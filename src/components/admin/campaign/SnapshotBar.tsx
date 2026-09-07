"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Snapshot } from "@/lib/campaign/types";
import { isConfirmed } from "@/lib/campaign/metrics";
import { shortDate } from "@/components/campaign/ResultsReport";
import { SnapshotProgress } from "./SnapshotDialog";
import { inputClass } from "./Controls";

export function SnapshotBar({ snapshots, selectedId, followersSnapshot }: { snapshots: Snapshot[]; selectedId: string; followersSnapshot: Snapshot | null }) {
  const router = useRouter(), params = useSearchParams();
  return <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3">
    <label className="flex flex-wrap items-center gap-2 text-xs font-medium">성과 기준 회차
      <select className={inputClass} value={selectedId} disabled={!selectedId} onChange={e => {
        const next = new URLSearchParams(params.toString());
        next.set("snapshot", e.target.value); next.delete("page"); router.push(`?${next}`);
      }}>
        {!selectedId && <option value="">확정 회차 없음</option>}
        {snapshots.filter(s => isConfirmed(s.status)).map(s => <option key={s.id} value={s.id}>{s.label} · {shortDate(s.taken_at)}</option>)}
      </select>
    </label>
    <p className="text-xs text-ink-3">팔로워 기준 {followersSnapshot ? `${followersSnapshot.label} · ${shortDate(followersSnapshot.taken_at, false)}` : "미측정"}</p>
    <div className="ml-auto"><SnapshotProgress snapshots={snapshots} /></div>
  </div>;
}
