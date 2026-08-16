import type { Metadata } from "next";
import Link from "next/link";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { WorkshopPaySuccess } from "@/components/workshops/WorkshopPaySuccess";

// 토스 성공 리다이렉트 랜딩.
// ⚠️ 승인(결제 확정·메일 발송)은 GET 렌더에서 하지 않는다 — 클라이언트가 마운트 후 서버 액션을 1회 호출한다.
//    (GET 은 읽기 의미라 프리페치·재렌더로 부작용이 반복될 수 있다. 전이는 DB에서 원자적이라 중복 호출도 안전하다.)

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "예약금 결제 · deetz Workshop",
  robots: { index: false },
};

export default async function WorkshopPaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    paymentKey?: string;
    orderId?: string;
    amount?: string;
    provider?: string;
    orderNo?: string;
    recovery?: string;
    slug?: string;
  }>;
}) {
  const sp = await searchParams;
  const slug = sp.slug?.trim() || null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center break-keep px-6 pb-16 pt-6">
      <div className="mb-12 self-start">
        <Link href="/workshops" aria-label="deetz Workshop 홈">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
      </div>

      <WorkshopPaySuccess
        provider={sp.provider === "paypal" ? "paypal" : "toss"}
        paymentKey={sp.paymentKey ?? null}
        orderId={sp.orderId ?? null}
        amount={sp.amount ? Number(sp.amount) : null}
        paypalOrderNo={sp.orderNo ?? null}
        paypalRecovery={sp.recovery === "1"}
        slug={slug}
      />
    </div>
  );
}
