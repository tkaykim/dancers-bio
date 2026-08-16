"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { confirmWorkshopTossPaymentAction } from "@/app/actions/workshop-checkout";
import { won } from "@/lib/workshops/shared";

// 결제 승인 트리거. StrictMode 이중 마운트에 대비해 ref 로 1회만 호출한다.
// (서버 전이도 원자적이라 이중 호출이 나가도 메일은 한 번만 나간다 — 이중 안전장치)

type State =
  | { phase: "confirming" }
  | { phase: "done"; orderNo: string | null; amount: number | null }
  /** 돈은 받았는데 예약 확정이 안 된 상태 — 실패로 표시하면 안 된다. */
  | { phase: "recovery"; orderNo: string | null }
  | { phase: "failed"; error: string };

export function WorkshopPaySuccess({
  provider,
  paymentKey,
  orderId,
  amount,
  paypalOrderNo,
  paypalRecovery = false,
  slug,
}: {
  provider: "toss" | "paypal";
  paymentKey: string | null;
  orderId: string | null;
  amount: number | null;
  paypalOrderNo: string | null;
  paypalRecovery?: boolean;
  slug: string | null;
}) {
  const backHref = slug ? `/workshops/${slug}` : "/workshops";
  const fired = useRef(false);

  const [state, setState] = useState<State>(() => {
    // PayPal 은 버튼 콜백에서 이미 capture 가 끝났다 — 표시만 한다.
    if (provider === "paypal") {
      return paypalRecovery
        ? { phase: "recovery", orderNo: paypalOrderNo }
        : { phase: "done", orderNo: paypalOrderNo, amount: null };
    }
    if (!paymentKey || !orderId || amount === null || Number.isNaN(amount)) {
      return { phase: "failed", error: "결제 정보가 누락되었습니다." };
    }
    return { phase: "confirming" };
  });

  useEffect(() => {
    if (state.phase !== "confirming" || fired.current) return;
    if (!paymentKey || !orderId || amount === null) return;
    fired.current = true;
    void (async () => {
      const res = await confirmWorkshopTossPaymentAction({ paymentKey, orderId, amount });
      if (res.ok && res.data) {
        setState({ phase: "done", orderNo: res.data.orderNo, amount: res.data.amount });
      } else if (!res.ok && res.recovery) {
        setState({ phase: "recovery", orderNo: res.orderNo ?? null });
      } else {
        setState({ phase: "failed", error: res.ok ? "결제 승인에 실패했습니다." : res.error });
      }
    })();
  }, [state.phase, paymentKey, orderId, amount]);

  if (state.phase === "confirming") {
    return (
      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-hairline-2 bg-card p-8 text-center">
        <Loader2 className="size-8 animate-spin text-ink-3" />
        <h1 className="text-lg font-bold tracking-tight">결제를 확인하고 있습니다</h1>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">잠시만 기다려 주세요.</span>
          <span className="block">이 화면을 닫지 말아 주세요.</span>
        </p>
      </div>
    );
  }

  if (state.phase === "recovery") {
    return (
      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-warn/50 bg-warn/5 p-8 text-center">
        <Clock className="size-10 text-warn" />
        <h1 className="text-xl font-bold tracking-tight">결제가 완료되었습니다</h1>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">결제는 정상적으로 처리되었습니다.</span>
          <span className="block">예약 확정에 확인이 필요해 운영진이 직접 살펴보고 있어요.</span>
          <span className="block">곧 메일로 결과를 안내드립니다.</span>
        </p>
        {state.orderNo ? (
          <p className="text-[12px] text-ink-3">
            결제번호 <span className="font-mono font-semibold text-foreground">{state.orderNo}</span>
          </p>
        ) : null}
        <a
          href="mailto:contact@deetz.kr"
          className="mt-1 flex w-full items-center justify-center rounded-lg border border-hairline-2 bg-background px-5 py-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary/50"
        >
          문의하기
        </a>
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className="flex w-full flex-col items-center gap-4 rounded-2xl border border-hairline-2 bg-card p-8 text-center">
        <XCircle className="size-10 text-ink-3" />
        <h1 className="text-xl font-bold tracking-tight">결제를 완료하지 못했습니다</h1>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">{state.error}</span>
          <span className="block">결제가 되었는데 이 화면이 보이면 새로고침해 주세요.</span>
          <span className="block">문제가 반복되면 contact@deetz.kr 로 문의해 주세요.</span>
        </p>
        <Link
          href={backHref}
          className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          다시 시도하기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-primary/40 bg-primary/5 p-8 text-center">
      <CheckCircle2 className="size-10 text-primary" />
      <h1 className="text-xl font-bold tracking-tight">예약금 결제가 완료되었습니다</h1>
      {state.orderNo || state.amount ? (
        <div className="flex w-full flex-col gap-1.5 rounded-lg bg-background/70 p-4 text-[13px]">
          {state.orderNo ? (
            <p className="flex justify-between">
              <span className="text-ink-3">결제번호</span>
              <span className="font-mono font-semibold">{state.orderNo}</span>
            </p>
          ) : null}
          {state.amount ? (
            <p className="flex justify-between">
              <span className="text-ink-3">예약금</span>
              <span className="font-bold">{won(state.amount)}</span>
            </p>
          ) : null}
        </div>
      ) : null}
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
      <Link href="/me/workshops" className="text-[12px] text-ink-3 underline-offset-2 hover:underline">
        내 워크샵 예약 보기
      </Link>
    </div>
  );
}
