import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { confirmWorkshopTossPayment } from "@/lib/workshops/payments";
import { won } from "@/lib/workshops/shared";

// 토스 성공 리다이렉트 랜딩.
// 결제 승인은 이 서버 컴포넌트에서 직접 수행한다(멱등 — 새로고침 안전).
// PayPal 은 버튼 콜백에서 이미 승인이 끝났으므로 provider=paypal 이면 표시만 한다.

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
    slug?: string;
  }>;
}) {
  const sp = await searchParams;
  const slug = sp.slug?.trim() || null;
  const backHref = slug ? `/workshops/${slug}` : "/workshops";

  let ok = false;
  let error: string | null = null;
  let orderNo: string | null = null;
  let amountLabel: string | null = null;

  if (sp.provider === "paypal") {
    ok = true;
    orderNo = sp.orderNo?.trim() || null;
  } else if (sp.paymentKey && sp.orderId && sp.amount) {
    const result = await confirmWorkshopTossPayment({
      paymentKey: sp.paymentKey,
      orderId: sp.orderId,
      amount: Number(sp.amount),
    });
    if (result.ok) {
      ok = true;
      orderNo = result.orderNo;
      amountLabel = won(result.amount);
    } else {
      error = result.error;
    }
  } else {
    error = "결제 정보가 누락되었습니다.";
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center break-keep px-6 pb-16 pt-6">
      <div className="mb-12 self-start">
        <Link href="/workshops" aria-label="deetz Workshop 홈">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
      </div>

      {ok ? (
        <div className="flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-primary/40 bg-primary/5 p-8 text-center">
          <CheckCircle2 className="size-10 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">예약금 결제가 완료되었습니다</h1>
          <div className="flex w-full flex-col gap-1.5 rounded-lg bg-background/70 p-4 text-[13px]">
            {orderNo ? (
              <p className="flex justify-between">
                <span className="text-ink-3">결제번호</span>
                <span className="font-mono font-semibold">{orderNo}</span>
              </p>
            ) : null}
            {amountLabel ? (
              <p className="flex justify-between">
                <span className="text-ink-3">예약금</span>
                <span className="font-bold">{amountLabel}</span>
              </p>
            ) : null}
          </div>
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="block">결제 확인 메일을 보내드렸어요.</span>
            <span className="block">최소 인원이 모이면 초청 확정과 잔금 안내를 드립니다.</span>
            <span className="block">미달 시 예약금은 전액 환불됩니다.</span>
          </p>
          <Link
            href={backHref}
            className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            워크샵 진행 상황 보기
          </Link>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-hairline-2 bg-card p-8 text-center">
          <XCircle className="size-10 text-ink-3" />
          <h1 className="text-xl font-bold tracking-tight">결제를 완료하지 못했습니다</h1>
          <p className="text-[13px] leading-relaxed text-ink-2">
            <span className="block">{error ?? "잠시 후 다시 시도해 주세요."}</span>
            <span className="block">이미 결제가 되었다면 새로고침해 주세요.</span>
            <span className="block">문제가 반복되면 contact@deetz.kr 로 문의해 주세요.</span>
          </p>
          <Link
            href={backHref}
            className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            다시 시도하기
          </Link>
        </div>
      )}
    </div>
  );
}
