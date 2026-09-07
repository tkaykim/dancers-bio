import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: "neutral" | "success" | "warning" | "danger" }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", {
    neutral: "bg-secondary text-ink-2",
    success: "bg-ok/10 text-ok",
    warning: "bg-warn/10 text-warn",
    danger: "bg-destructive/10 text-destructive",
  }[tone], className)} {...props} />;
}
