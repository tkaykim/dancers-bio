"use client";

import { useState, useTransition } from "react";
import { submitQuickHeightAction } from "@/app/actions/quick-height";

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
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-ok/30 bg-ok/10 p-6 text-center">
        <p className="text-base font-bold text-foreground">저장됐어요! 🙆</p>
        <p className="mt-1 text-sm text-ink-2">
          입력해 주셔서 감사합니다. 이 창은 닫으셔도 됩니다.
        </p>
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
          키 (cm)
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
          placeholder="예: 178"
          className="h-12 rounded-xl border border-border bg-background px-4 text-base placeholder:text-ink-3"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="shoe_size_mm" className="text-sm font-medium">
          신발 사이즈 (mm) <span className="text-ink-3">· 선택</span>
        </label>
        <input
          id="shoe_size_mm"
          name="shoe_size_mm"
          type="number"
          inputMode="numeric"
          min={180}
          max={330}
          defaultValue={shoe ?? ""}
          placeholder="예: 270"
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
        {pending ? "저장 중…" : "제출하기"}
      </button>
      <p className="text-center text-[11px] text-ink-3">
        {name}님의 정보로 저장됩니다. 키·신발 정보는 본인과 캐스팅 관리자에게만 보입니다.
      </p>
    </form>
  );
}
