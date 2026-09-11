"use client";

import { useState, useTransition } from "react";
import {
  submitQuickFitAction,
  submitFitBySessionAction,
} from "@/app/actions/quick-fit";
import { TOP_SIZES, WAIST_INCHES, LENGTH_CMS } from "@/lib/fit/sizes";
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

function Select({
  id,
  label,
  hint,
  defaultValue,
  options,
  render,
}: {
  id: string;
  label: string;
  hint?: string;
  defaultValue: string;
  options: string[];
  render?: (v: string) => string;
}) {
  const t = useT(portfolio);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {hint ? <span className="text-ink-3"> · {hint}</span> : null}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        className="h-12 rounded-xl border border-border bg-background px-4 text-base"
      >
        <option value="">{t("fit.select_placeholder")}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

// 드롭다운 추천 + 직접 숫자 입력 콤보. (네이티브 input+datalist)
function ComboNumber({
  id,
  label,
  unit,
  defaultValue,
  options,
}: {
  id: string;
  label: string;
  unit: string;
  defaultValue: string;
  options: string[];
}) {
  const t = useT(portfolio);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span className="text-ink-3">· {unit}</span>
      </label>
      <input
        id={id}
        name={id}
        list={`${id}-list`}
        type="number"
        inputMode="numeric"
        defaultValue={defaultValue}
        placeholder={t("fit.combo_placeholder", { unit })}
        className="h-12 rounded-xl border border-border bg-background px-4 text-base placeholder:text-ink-3"
      />
      <datalist id={`${id}-list`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

export function QuickFitForm({
  token,
  code,
  name,
  top,
  waist,
  length,
}: {
  token?: string;
  code?: string;
  name: string;
  top: string | null;
  waist: string | null;
  length: string | null;
}) {
  const t = useT(portfolio);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-base font-bold text-foreground">{t("fit.done_title")}</p>
        <p className="mt-1 text-sm text-ink-2">{t("fit.done_desc")}</p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = code
            ? await submitFitBySessionAction(fd)
            : await submitQuickFitAction(fd);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setDone(true);
        });
      }}
      className="flex flex-col gap-4"
    >
      {code ? (
        <input type="hidden" name="code" value={code} />
      ) : (
        <input type="hidden" name="token" value={token ?? ""} />
      )}

      <Select
        id="top_size"
        label={t("fit.top_size")}
        defaultValue={top ?? ""}
        options={TOP_SIZES}
      />

      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        <p className="mb-2 text-sm font-medium">{t("fit.bottom_size")}</p>
        <div className="grid grid-cols-2 gap-3">
          <ComboNumber
            id="pants_waist_inch"
            label={t("fit.waist")}
            unit={t("fit.waist_unit")}
            defaultValue={waist ?? ""}
            options={WAIST_INCHES}
          />
          <ComboNumber
            id="pants_length_cm"
            label={t("fit.length")}
            unit="cm"
            defaultValue={length ?? ""}
            options={LENGTH_CMS}
          />
        </div>
        <p className="mt-2 text-[11px] text-ink-3">
          {t("fit.combo_hint")}
        </p>
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
        {pending ? t("fit.saving") : t("fit.submit")}
      </button>
      <p className="text-center text-[11px] text-ink-3">
        {t("fit.footer", { name })}
      </p>
    </form>
  );
}
