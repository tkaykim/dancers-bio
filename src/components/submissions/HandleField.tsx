"use client";

import { useState } from "react";
import { translator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 제출자 본인의 인스타그램 아이디. 기본값이 채워져 있고 필요하면 고칠 수 있다.
 * 이 값이 곧 저장될 파일 이름이라, 바뀌면 업로더에도 알려준다.
 */
export function HandleField({
  token,
  initialHandle,
  onChange,
  locale,
}: {
  token: string;
  initialHandle: string;
  onChange: (handle: string) => void;
  locale: Locale;
}) {
  const t = translator(locale);
  const [handle, setHandle] = useState(initialHandle);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/submit/${token}/handle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? t("submit.handle.save_failed"));
      setHandle(json.handle);
      onChange(json.handle);
      setEditing(false);
      setMessage(t("submit.handle.saved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("submit.handle.save_failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">{t("submit.handle.short_label")}</span>
          <span className="flex items-center gap-2 text-sm font-medium">
            @{handle}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold text-muted-foreground underline underline-offset-2"
            >
              {t("submit.handle.edit")}
            </button>
          </span>
        </div>
        {message ? <p className="text-right text-xs text-muted-foreground">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="ig-handle" className="text-sm text-muted-foreground">
        {t("submit.handle.label")}
      </label>
      <div className="flex gap-2">
        <input
          id="ig-handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="instagram_id"
        />
        <button
          type="button"
          disabled={saving || !handle.trim()}
          onClick={() => void save()}
          className="shrink-0 rounded-lg bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-60"
        >
          {saving ? t("submit.handle.saving") : t("submit.handle.save")}
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setHandle(initialHandle);
          setEditing(false);
          setError(null);
        }}
        className="self-start text-xs text-muted-foreground underline underline-offset-2"
      >
        {t("submit.handle.cancel")}
      </button>
      {error ? <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
