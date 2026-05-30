"use client";

import { useState, useTransition } from "react";
import { recomputeAllScoresAction } from "@/app/actions/scoring";
import { Button } from "@/components/ui/button";

/**
 * 경력 점수 전체 재계산 버튼 (관리자). 사전/가중치 변경 또는 대량 임포트 후 사용.
 * 평시엔 경력 추가 시 자동 증분 재계산되므로 수동 실행은 보정용.
 */
export function RecomputeScoresButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">경력 점수 재계산</p>
      <p className="text-xs text-ink-3">
        모든 댄서의 내부 경력 점수를 다시 계산합니다. (디렉토리 정렬용 · 비노출)
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        className="self-start"
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const r = await recomputeAllScoresAction();
            if (!r.ok) {
              setMsg({ kind: "error", text: r.error });
              return;
            }
            setMsg({
              kind: "ok",
              text: `완료 — 경력 ${r.data?.careersScored ?? 0}건, 댄서 ${r.data?.dancersScored ?? 0}명 재계산`,
            });
          });
        }}
      >
        {pending ? "재계산 중..." : "전체 재계산 실행"}
      </Button>
      {msg ? (
        <p
          className={
            "rounded-md px-3 py-2 text-xs " +
            (msg.kind === "ok"
              ? "bg-ok/10 text-ok"
              : "bg-destructive/10 text-destructive")
          }
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
