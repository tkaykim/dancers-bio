import type { Metadata } from "next";
import Link from "next/link";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { EventPaySuccess } from "@/components/workshops/EventPaySuccess";
import { getRequestedLocale } from "@/lib/i18n/server";
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
  // `lang` 은 미들웨어가 요청 언어로 바꿔 주므로 여기서 직접 읽지 않는다.
  // 이 화면은 ko·en 두 언어뿐이라 ja 요청은 en 으로 떨어진다.
  const [sp, requested] = await Promise.all([searchParams, getRequestedLocale()]);
  const lang: EventLang = requested === "ko" ? "ko" : "en";

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
