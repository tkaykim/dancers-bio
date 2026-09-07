"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/campaign/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings2, Plus } from "lucide-react";
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
    <p role="alert" className="text-sm text-destructive">
      {error.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[내부 식별자]")}
    </p>
  ) : null;
}
export function Editor({
  title,
  children,
  variant = "outline",
  open,
  onOpenChange,
}: {
  title: string;
  children: ReactNode;
  variant?: "default" | "outline" | "ghost";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant={variant} size="lg" />}>
        {title === "규칙" ? <Settings2 aria-hidden /> : title.includes("추가") ? <Plus aria-hidden /> : null}{title}
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] overflow-y-auto p-6 sm:max-w-2xl">
        <DialogTitle className="pr-6 text-lg font-semibold">{title}</DialogTitle>
        <div className="space-y-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
