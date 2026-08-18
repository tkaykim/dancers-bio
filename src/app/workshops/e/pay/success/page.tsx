import type { Metadata } from "next";
import Link from "next/link";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { EventPaySuccess } from "@/components/workshops/EventPaySuccess";
import type { EventLang } from "@/lib/workshops/event-shared";

// 행사 결제 성공 리다이렉트 랜딩 — 승인은 클라이언트가 서버 액션으로 1회 수행(GET 부작용 금지).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment · deetz Workshop",
  robots: { index: false },
};

export default async function EventPaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentKey?: string;
    orderId?: string;
    amount?: string;
    provider?: string;
    orderNo?: string;
    charged?: string;
    recovery?: string;
    slug?: string;
    lang?: string;
  }>;
}) {
  const sp = await searchParams;
  const lang: EventLang = sp.lang === "ko" ? "ko" : "en";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center break-keep px-6 pb-16 pt-6">
      <div className="mb-12 self-start">
        <Link href="/workshops" aria-label="deetz Workshop">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
      </div>
      <EventPaySuccess
        provider={sp.provider === "paypal" ? "paypal" : "toss"}
        paymentKey={sp.paymentKey ?? null}
        orderId={sp.orderId ?? null}
        amount={sp.amount ? Number(sp.amount) : null}
        paypalOrderNo={sp.orderNo ?? null}
        paypalCharged={sp.charged ?? null}
        paypalRecovery={sp.recovery === "1"}
        slug={sp.slug?.trim() || null}
        lang={lang}
      />
    </div>
  );
}
