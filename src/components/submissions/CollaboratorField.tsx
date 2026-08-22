"use client";

import { useState } from "react";
import { translator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 함께 촬영한 사람의 인스타 아이디를 남긴다. 메모다.
 * 정산 인원 산정과는 무관하고, 운영자가 나중에 보고 판단한다.
 */
export function CollaboratorField({
  token,
  initial,
  locale,
}: {
  token: string;
  initial: string[];
  locale: Locale;
}) {
  const t = translator(locale);
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
      if (!res.ok || !json.ok) throw new Error(json.error ?? t("submit.collab.save_failed"));
      setSaved(json.handles);
      setRows(json.handles.length ? json.handles : [""]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("submit.collab.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">{t("submit.collab.title")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("submit.collab.help")}
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
              aria-label={t("submit.collab.remove_aria", { index: i + 1 })}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
            >
              {t("submit.collab.remove")}
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
          {t("submit.collab.add")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-60"
        >
          {saving ? t("submit.collab.saving") : t("submit.collab.save")}
        </button>
      </div>

      {saved ? (
        <p className="text-xs text-muted-foreground">
          {saved.length
            ? t("submit.collab.saved", { list: saved.map((h) => `@${h}`).join(", ") })
            : t("submit.collab.saved_none")}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
