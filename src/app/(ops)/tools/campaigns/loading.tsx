import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <div role="status" className="space-y-6">
    <p className="flex items-center gap-2 text-sm text-ink-3"><LoaderCircle className="size-4 animate-spin" aria-hidden />캠페인 성과를 불러오고 있습니다.</p>
    <div aria-hidden className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-secondary" />)}</div>
  </div>;
}
