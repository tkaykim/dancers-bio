"use client";

import { useState, useTransition } from "react";
import { submitQuickHeightAction } from "@/app/actions/quick-height";
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

export function QuickHeightForm({
  token,
  name,
  height,
  shoe,
}: {
  token: string;
  name: string;
  height: number | null;
  shoe: number | null;
}) {
  const t = useT(portfolio);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-base font-bold text-foreground">{t("height.done_title")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("height.done_desc")}</p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await submitQuickHeightAction(fd);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setDone(true);
        });
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="height_cm" className="text-sm font-medium">
          {t("height.label_height")}
        </label>
        <input
          id="height_cm"
          name="height_cm"
          type="number"
          inputMode="numeric"
          min={100}
          max={250}
          autoFocus
          defaultValue={height ?? ""}
          placeholder={t("height.placeholder_height")}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base placeholder:text-ink-3"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="shoe_size_mm" className="text-sm font-medium">
          {t("height.label_shoe")}{" "}
          <span className="text-ink-3">{t("height.label_optional")}</span>
        </label>
        <input
          id="shoe_size_mm"
          name="shoe_size_mm"
          type="number"
          inputMode="numeric"
          min={180}
          max={330}
          defaultValue={shoe ?? ""}
          placeholder={t("height.placeholder_shoe")}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base placeholder:text-ink-3"
        />
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? t("height.saving") : t("height.submit")}
      </button>
      <p className="text-center text-[11px] text-ink-3">
        {t("height.footer", { name })}
      </p>
    </form>
  );
}
