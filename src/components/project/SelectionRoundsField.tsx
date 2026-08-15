"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SELECTION_ROUNDS, roundLabel } from "@/lib/application-stage";

const ROUND_OPTIONS = [
  {
    value: 1,
    title: "1단계",
    desc: "지원 → 최종 합격. 중간 단계 없이 바로 확정합니다.",
  },
  {
    value: 2,
    title: "2단계",
    desc: "지원 → 1차 합격 → 최종 합격. 클라이언트 확정이 있는 캐스팅에 적합합니다.",
  },
  {
    value: 3,
    title: "3단계",
    desc: "지원 → 1차 합격 → 2차 합격 → 최종 합격. 오디션이 낀 모집에 적합합니다.",
  },
] as const;

// 공고 생성·수정 공용. 단계 수를 고르면 그 수만큼 이름 입력칸이 나온다.
// 이름을 비우면 "N차 합격 / 최종 합격" 기본값이 쓰인다.
export function SelectionRoundsField({
  defaultRounds = 2,
  defaultLabels = null,
}: {
  defaultRounds?: number;
  defaultLabels?: string[] | null;
}) {
  const [rounds, setRounds] = useState(() =>
    Math.min(Math.max(defaultRounds || 2, 1), MAX_SELECTION_ROUNDS),
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-1">
        <Label>선발 단계</Label>
        <p className="text-xs text-muted-foreground">
          마지막 단계가 최종 합격입니다.
          <br />
          최종 합격 전까지는 지원자가 직접 참여를 포기할 수 있고, 최종 합격
          이후에는 포기할 수 없습니다.
        </p>
      </div>

      <input type="hidden" name="selection_rounds" value={rounds} />

      <div className="flex flex-col gap-1.5">
        {ROUND_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRounds(opt.value)}
            aria-pressed={rounds === opt.value}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
              rounds === opt.value
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-secondary/50"
            }`}
          >
            <span className="text-sm font-semibold">{opt.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {opt.desc}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          단계 이름 (선택 — 비우면 기본 이름으로 표시됩니다)
        </p>
        {Array.from({ length: rounds }, (_, i) => i + 1).map((n) => (
          <div key={n} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-ink-3">{n}단계</span>
            <Input
              name={`round_label_${n}`}
              defaultValue={defaultLabels?.[n - 1] ?? ""}
              maxLength={20}
              placeholder={roundLabel(n, { selection_rounds: rounds })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
