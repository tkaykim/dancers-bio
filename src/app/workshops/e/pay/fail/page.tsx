import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { ET, type EventLang } from "@/lib/workshops/event-shared";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment · deetz Workshop",
  robots: { index: false },
};

export default async function EventPayFailPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; code?: string; slug?: string; lang?: string }>;
}) {
  const sp = await searchParams;
  const lang: EventLang = sp.lang === "ko" ? "ko" : "en";
  const t = ET[lang];
  const backHref = sp.slug?.trim() ? `/workshops/e/${sp.slug.trim()}?lang=${lang}` : "/workshops";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center break-keep px-6 pb-16 pt-6">
      <div className="mb-12 self-start">
        <Link href="/workshops" aria-label="deetz Workshop">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
      </div>
      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-hairline-2 bg-card p-8 text-center">
        <XCircle className="size-10 text-ink-3" />
        <h1 className="text-xl font-bold tracking-tight">{t.failTitle}</h1>
        <p className="text-[13px] leading-relaxed text-ink-2">
          {sp.message?.trim() ? <span className="block">{sp.message.trim()}</span> : null}
          {sp.code ? <span className="block font-mono text-[12px] text-ink-4">code: {sp.code}</span> : null}
          <span className="block">{t.failBody}</span>
        </p>
        <Link
          href={backHref}
          className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t.backToEvent}
        </Link>
      </div>
    </div>
  );
}
