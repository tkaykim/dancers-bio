"use client";

import type { Rules } from "@/lib/campaign/types";
import { saveRulesAction } from "@/app/actions/campaign-results";
import {
  buttonClass,
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
  return (
    <Editor title="프로젝트 공통 규칙">
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
          )
        }
      >
        <label>
          공식 음원 ID
          <input
            name="audio"
            className={`${inputClass} block w-full`}
            defaultValue={rules.audio_id ?? ""}
          />
        </label>
        <label>
          필수 태그
          <input
            name="tags"
            className={`${inputClass} block w-full`}
            defaultValue={rules.required_tags.join(", ")}
          />
        </label>
        <label>
          필수 멘션
          <input
            name="mentions"
            className={`${inputClass} block w-full`}
            defaultValue={rules.required_mentions.join(", ")}
          />
        </label>
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
          <input
            name="first"
            className={`${inputClass} block w-full`}
            defaultValue={rules.first_posted_at ?? ""}
            placeholder="2026-09-07T00:00:00+09:00"
          />
        </label>
        <div className="self-end">
          <button className={buttonClass} disabled={action.pending}>
            규칙 저장
          </button>
        </div>
      </form>
      <ErrorText error={action.error} />
    </Editor>
  );
}
