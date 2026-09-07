"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/campaign/types";
export const inputClass =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm";
export const buttonClass =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50";
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    done?: (data: T) => void,
  ) {
    setError(null);
    start(async () => {
      try {
        const result = await fn();
        if (!result.ok) setError(result.error);
        else {
          done?.(result.data);
          router.refresh();
        }
      } catch {
        setError("요청에 실패했습니다. 다시 시도해 주세요.");
      }
    });
  }
  return {
    pending,
    error,
    run,
  };
}
export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-red-700">
      {error}
    </p>
  ) : null;
}
export function Editor({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
