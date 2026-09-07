"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-4 rounded-2xl border border-border p-8">
    <h2 className="font-semibold">캠페인 성과를 불러오지 못했습니다.</h2>
    <p className="text-sm text-ink-3">잠시 후 다시 시도해 주세요.</p>
    <div className="flex items-center gap-4"><Button onClick={reset}>다시 시도</Button><Link href="/tools/campaigns" className="text-sm text-ink-3">캠페인 목록으로</Link></div>
  </div>;
}
