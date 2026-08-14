"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkApproveTierAAction } from "@/app/actions/admin-dancer-triage";
import { Button } from "@/components/ui/button";

export type TierARow = {
  id: string;
  name: string;
  careerCount: number;
  hasPhone: boolean;
  hasAccount: boolean;
  /** 동명 프로필이 있어 눈으로 확인이 필요한 경우 — 기본 선택에서 제외한다 */
  needsEyeball: boolean;
  nameCollisionCount: number;
};

const MAX_PER_CALL = 300;

/**
 * A등급 일괄 승인 — 기본 선택은 "동명 충돌이 없는 행"만.
 * 동명 프로필이 있는 행은 체크가 풀린 채로 보여주고, 관리자가 확인 후 직접 켜게 한다.
 * 승인 알림톡은 발송되지 않는다(서버 액션 주석 참조). 그 사실을 UI에 명시한다.
 */
export function TriageBulkApprove({ rows }: { rows: TierARow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.needsEyeball).map((r) => r.id)),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const overCap = selected.size > MAX_PER_CALL;
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.careerCount - a.careerCount),
    [rows],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    setMessage(null);
    const fd = new FormData();
    for (const id of selected) fd.append("id", id);
    startTransition(async () => {
      const result = await bulkApproveTierAAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        `${result.approved}명 승인 완료${result.skipped ? ` (${result.skipped}명 제외됨)` : ""}. 승인 알림톡은 발송되지 않았습니다.`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
        자동 승인 후보가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <span className="text-sm font-semibold">
          {selected.size}명 선택됨 / 후보 {rows.length}명
        </span>
        <button
          type="button"
          onClick={() =>
            setSelected(new Set(rows.filter((r) => !r.needsEyeball).map((r) => r.id)))
          }
          className="text-xs text-ink-2 underline underline-offset-2 hover:text-foreground"
        >
          충돌 없는 항목 전체
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set(rows.map((r) => r.id)))}
          className="text-xs text-ink-2 underline underline-offset-2 hover:text-foreground"
        >
          전체 선택
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="text-xs text-ink-2 underline underline-offset-2 hover:text-foreground"
        >
          전체 해제
        </button>
        <Button
          size="sm"
          disabled={pending || selected.size === 0 || overCap}
          onClick={submit}
          className="ml-auto"
        >
          {pending ? "승인 중…" : `${selected.size}명 일괄 승인`}
        </Button>
      </div>

      {overCap ? (
        <p className="text-xs text-warn">
          한 번에 최대 {MAX_PER_CALL}명까지 승인할 수 있습니다. 선택을 줄여 주세요.
        </p>
      ) : null}
      {message ? <p className="text-xs text-ok">{message}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <p className="text-xs text-ink-3">
        일괄 승인은 승인 알림톡을 발송하지 않습니다.
        <br />
        댄서에게 알리려면 승인 후 별도로 발송해야 합니다.
      </p>

      <ul className="flex flex-col divide-y divide-hairline rounded-xl border border-border bg-card">
        {sortedRows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <input
              type="checkbox"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              className="h-4 w-4 shrink-0 accent-primary"
              aria-label={`${r.name} 승인 대상 선택`}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {r.name}
            </span>
            <span className="shrink-0 text-[11px] text-ink-3">
              경력 {r.careerCount}
            </span>
            {!r.hasPhone ? (
              <span className="shrink-0 rounded-full border border-warn/30 bg-warn/5 px-2 py-0.5 text-[10px] text-warn">
                연락처 없음
              </span>
            ) : null}
            {!r.hasAccount ? (
              <span className="shrink-0 rounded-full border border-hairline-2 px-2 py-0.5 text-[10px] text-ink-3">
                큐레이션
              </span>
            ) : null}
            {r.needsEyeball ? (
              <span className="shrink-0 rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 text-[10px] text-destructive">
                동명 {r.nameCollisionCount}건
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
