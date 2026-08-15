"use client";

import { useState } from "react";

/**
 * 함께 촬영한 사람의 인스타 아이디를 남긴다. 메모다.
 * 정산 인원 산정과는 무관하고, 운영자가 나중에 보고 판단한다.
 */
export function CollaboratorField({
  token,
  initial,
}: {
  token: string;
  initial: string[];
}) {
  const [rows, setRows] = useState<string[]>(initial.length ? initial : [""]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string[] | null>(initial.length ? initial : null);
  const [error, setError] = useState<string | null>(null);

  const setAt = (i: number, v: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? v : r)));
  const removeAt = (i: number) =>
    setRows((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/submit/${token}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handles: rows }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "저장하지 못했습니다.");
      setSaved(json.handles);
      setRows(json.handles.length ? json.handles : [""]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">함께 촬영한 분</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          영상에 다른 댄서가 함께 나오거나 인스타그램 공동 작업자로 올리실 예정이면
          아이디를 남겨 주세요.
          <br />
          확인 후 저희가 개별로 안내드립니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={r}
              onChange={(e) => setAt(i, e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="instagram_id"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label={`${i + 1}번째 삭제`}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
            >
              삭제
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={rows.length >= 10}
          onClick={() => setRows((prev) => [...prev, ""])}
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          + 추가
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-60"
        >
          {saving ? "저장 중" : "저장"}
        </button>
      </div>

      {saved ? (
        <p className="text-xs text-muted-foreground">
          {saved.length ? `저장됨 — ${saved.map((h) => `@${h}`).join(", ")}` : "저장됨 — 없음"}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
