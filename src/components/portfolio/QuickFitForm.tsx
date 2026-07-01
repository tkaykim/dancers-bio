"use client";

import { useState, useTransition } from "react";
import { submitQuickFitAction } from "@/app/actions/quick-fit";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export function QuickFitForm({
  token,
  name,
  top,
  bottom,
}: {
  token: string;
  name: string;
  top: string | null;
  bottom: string | null;
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="top_size" className="text-sm font-medium">
          상의 사이즈
        </label>
        <select
          id="top_size"
          name="top_size"
          defaultValue={top ?? ""}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base"
        >
          <option value="">선택</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bottom_size" className="text-sm font-medium">
          하의 사이즈
        </label>
        <select
          id="bottom_size"
          name="bottom_size"
          defaultValue={bottom ?? ""}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base"
        >
          <option value="">선택</option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
