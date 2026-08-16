import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";

// 토스 실패 리다이렉트 랜딩 — 코드/메시지를 보여주고 상세로 되돌린다.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "결제 실패 · deetz Workshop",
  robots: { index: false },
};

export default async function WorkshopPayFailPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; code?: string; slug?: string }>;
}) {
  const sp = await searchParams;
  const slug = sp.slug?.trim() || null;
  const backHref = slug ? `/workshops/${slug}` : "/workshops";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center break-keep px-6 pb-16 pt-6">
      <div className="mb-12 self-start">
        <Link href="/workshops" aria-label="deetz Workshop 홈">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
      </div>

      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-hairline-2 bg-card p-8 text-center">
        <XCircle className="size-10 text-ink-3" />
        <h1 className="text-xl font-bold tracking-tight">결제가 완료되지 않았습니다</h1>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">{sp.message?.trim() || "결제가 취소되었거나 실패했습니다."}</span>
          {sp.code ? <span className="block font-mono text-[12px] text-ink-4">코드: {sp.code}</span> : null}
          <span className="block">카드를 바꾸거나 계좌이체·PayPal 로 다시 시도해 보세요.</span>
        </p>
        <Link
          href={backHref}
          className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          다시 시도하기
        </Link>
      </div>
    </div>
  );
}
