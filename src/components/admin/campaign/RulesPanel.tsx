"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Rules } from "@/lib/campaign/types";
import { saveRulesAction } from "@/app/actions/campaign-results";
import {
  Editor,
  ErrorText,
  inputClass,
  useAction,
} from "./Controls";
export function RulesPanel({
  rules,
  boards,
}: {
  rules: Rules;
  boards: {
    id: string;
    title: string;
    count: number;
  }[];
}) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  return (
    <Editor title="규칙" variant="ghost" open={open} onOpenChange={setOpen}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        action={(form) =>
          action.run(() =>
            saveRulesAction(rules.project_id, {
              audio_id: String(form.get("audio") ?? "") || null,
              required_tags: String(form.get("tags") ?? "")
                .split(/[,\s]+/)
                .filter(Boolean),
              required_mentions: String(form.get("mentions") ?? "")
                .split(/[,\s]+/)
                .filter(Boolean),
              forecast_board_id: String(form.get("board") ?? "") || null,
              first_posted_at: String(form.get("first") ?? "") || null,
            }),
            () => setOpen(false),
          )
        }
      >
        <label>
          공식 음원 ID
          <Input
            name="audio"
            className={`${inputClass} block w-full`}
            defaultValue={rules.audio_id ?? ""}
          />
        </label>
        <div>
          필수 태그
          <ChipsInput name="tags" initial={rules.required_tags} />
        </div>
        <div>
          필수 멘션
          <ChipsInput name="mentions" initial={rules.required_mentions} />
        </div>
        <label>
          예측 기준 보드
          <select
            name="board"
            className={`${inputClass} block w-full`}
            defaultValue={rules.forecast_board_id ?? ""}
          >
            <option value="">선택 없음</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} · {b.count}명
              </option>
            ))}
          </select>
        </label>
        <label>
          T+N 기준 시각 (시간대 포함)
          <Input
            name="first"
            className={`${inputClass} block w-full`}
            defaultValue={rules.first_posted_at ?? ""}
            placeholder="2026-09-07T00:00:00+09:00"
          />
        </label>
        <div className="self-end">
          <Button type="submit" disabled={action.pending}>
            규칙 저장
          </Button>
        </div>
      </form>
      <ErrorText error={action.error} />
    </Editor>
  );
}

function ChipsInput({ name, initial }: { name: string; initial: string[] }) {
  const [values, setValues] = useState(initial), [draft, setDraft] = useState("");
  function add() { setValues(v => [...new Set([...v, ...draft.split(/[,\s]+/).filter(Boolean)])]); setDraft(""); }
  return <span className="mt-2 flex flex-wrap gap-2 rounded-lg border border-border p-2">
    <input type="hidden" name={name} value={[...values, draft].filter(Boolean).join(",")} />
    {values.map(value => <Badge key={value}>{value}<button type="button" aria-label={value + " 삭제"} onClick={() => setValues(v => v.filter(item => item !== value))}>×</button></Badge>)}
    <Input aria-label={name === "tags" ? "태그 추가" : "멘션 추가"} className="min-w-24 flex-1 border-0" value={draft} placeholder="입력 후 Enter" onChange={e => setDraft(e.target.value)} onBlur={add} onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} />
  </span>;
}
