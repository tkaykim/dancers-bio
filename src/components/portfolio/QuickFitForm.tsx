"use client";

import { useState, useTransition } from "react";
import {
  submitQuickFitAction,
  TOP_SIZES,
  WAIST_INCHES,
  LENGTH_CMS,
} from "@/app/actions/quick-fit";

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
        <option value="">선택</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {render ? render(o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function QuickFitForm({
  token,
  name,
  top,
  waist,
  length,
}: {
  token: string;
  name: string;
  top: string | null;
  waist: string | null;
  length: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-base font-bold text-foreground">저장됐어요! 🙆</p>
        <p className="mt-1 text-sm text-ink-2">
          사이즈 입력 감사합니다. 이 창은 닫으셔도 됩니다.
        </p>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          const r = await submitQuickFitAction(fd);
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

      <Select
        id="top_size"
        label="상의 사이즈"
        defaultValue={top ?? ""}
        options={TOP_SIZES}
      />

      <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
        <p className="mb-2 text-sm font-medium">하의 사이즈</p>
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="pants_waist_inch"
            label="허리"
            hint="인치"
            defaultValue={waist ?? ""}
            options={WAIST_INCHES}
            render={(v) => `${v}인치`}
          />
          <Select
            id="pants_length_cm"
            label="기장"
            hint="cm"
            defaultValue={length ?? ""}
            options={LENGTH_CMS}
            render={(v) => `${v}cm`}
          />
        </div>
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
        {pending ? "저장 중…" : "제출하기"}
      </button>
      <p className="text-center text-[11px] text-ink-3">
        {name}님의 정보로 저장됩니다. 신발은 검정색으로 직접 지참해 주세요.
      </p>
    </form>
  );
}
