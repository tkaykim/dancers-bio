"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  failStaleSnapshotAction,
  pollSnapshotAction,
  startSnapshotAction,
} from "@/app/actions/campaign-results";
import type { Snapshot } from "@/lib/campaign/types";
import {
  buttonClass,
  Editor,
  ErrorText,
  inputClass,
  useAction,
} from "./Controls";
export function SnapshotDialog({
  projectId,
  postsTotal,
  snapshots,
}: {
  projectId: string;
  postsTotal: number;
  snapshots: Snapshot[];
}) {
  const [label, setLabel] = useState(""),
    [shares, setShares] = useState(false),
    [followers, setFollowers] = useState(true),
    [pollError, setPollError] = useState<string | null>(null);
  const action = useAction(),
    router = useRouter();
  const [now, setNow] = useState(0);
  const activeIds = snapshots
    .filter((s) => s.status === "running" || s.status === "reserved")
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    if (!activeIds) return;
    let cancelled = false,
      busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      setNow(Date.now());
      try {
        for (const id of activeIds.split(",")) {
          const r = await pollSnapshotAction(id);
          if (cancelled) return;
          if (!r.ok) setPollError(r.error);
          else {
            setPollError(null);
            if (["succeeded", "partial", "failed"].includes(r.data.status))
              router.refresh();
          }
        }
      } catch {
        if (!cancelled)
          setPollError(
            "진행 상태를 확인하지 못했습니다. 자동으로 다시 확인합니다.",
          );
      } finally {
        busy = false;
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeIds, router]);
  return (
    <Editor title="스냅샷 실행">
      <p>수집 대상 {postsTotal}개 · 회당 최대 300개 · 프로젝트 하루 3회</p>
      <label className="block">
        회차 라벨{" "}
        <input
          className={inputClass}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="비우면 자동 T+N"
        />
      </label>
      <label className="mr-4">
        <input
          type="checkbox"
          checked={shares}
          onChange={(e) => setShares(e.target.checked)}
        />{" "}
        공유 수 수집
      </label>
      <label>
        <input
          type="checkbox"
          checked={followers}
          onChange={(e) => setFollowers(e.target.checked)}
        />{" "}
        팔로워 수집
      </label>
      <div>
        <button
          className={buttonClass}
          disabled={action.pending || postsTotal === 0}
          onClick={() =>
            action.run(() =>
              startSnapshotAction(projectId, {
                label,
                includeShares: shares,
                collectFollowers: followers,
              }),
            )
          }
        >
          수집 시작
        </button>
      </div>
      {snapshots
        .filter((s) => ["reserved", "running"].includes(s.status))
        .map((s) => (
          <p key={s.id}>
            {s.label}: {s.status === "reserved" ? "예약됨" : "수집 중"}
            {now - Date.parse(s.created_at) >= 1800000 && (
              <button
                className={`${buttonClass} ml-2`}
                disabled={action.pending}
                onClick={() => action.run(() => failStaleSnapshotAction(s.id))}
              >
                실패 처리
              </button>
            )}
          </p>
        ))}
      <ErrorText error={action.error ?? pollError} />
    </Editor>
  );
}
