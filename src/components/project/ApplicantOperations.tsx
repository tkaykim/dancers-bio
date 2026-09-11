"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function ApplicantOperations({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left lg:hidden">
        <span className="min-w-0"><span className="block text-sm font-semibold">프로젝트 운영 도구</span><span className="mt-1 block break-keep text-xs text-ink-3">공지 · 일정 · 정산 · 공동관리자</span></span>
        <ChevronDown size={18} aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={id} className={`${open ? "flex" : "hidden"} min-w-0 flex-col gap-5 lg:flex`}>{children}</div>
    </aside>
  );
}
