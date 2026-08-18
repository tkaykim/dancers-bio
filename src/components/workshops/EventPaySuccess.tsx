"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";

import { confirmEventTossPaymentAction } from "@/app/actions/workshop-events";
import { ET, type EventLang } from "@/lib/workshops/event-shared";

// 행사 결제 성공 랜딩 — 예약금의 WorkshopPaySuccess 와 동일 계약.
// Toss 승인은 마운트 후 서버 액션 1회(useRef 가드), PayPal 은 표시만.

type State =
  | { phase: "confirming" }
  | { phase: "done"; orderNo: string | null; chargedLabel: string | null }
  | { phase: "recovery"; orderNo: string | null }
  | { phase: "failed"; error: string };

export function EventPaySuccess({
  provider,
  paymentKey,
  orderId,
  amount,
  paypalOrderNo,
  paypalCharged,
  paypalRecovery = false,
  slug,
  lang,
}: {
  provider: "toss" | "paypal";
  paymentKey: string | null;
  orderId: string | null;
  amount: number | null;
  paypalOrderNo: string | null;
  paypalCharged: string | null;
  paypalRecovery?: boolean;
  slug: string | null;
  lang: EventLang;
}) {
  const t = ET[lang];
  const backHref = slug ? `/workshops/e/${slug}?lang=${lang}` : "/workshops";
  const fired = useRef(false);

  const [state, setState] = useState<State>(() => {
    if (provider === "paypal") {
      return paypalRecovery
        ? { phase: "recovery", orderNo: paypalOrderNo }
        : { phase: "done", orderNo: paypalOrderNo, chargedLabel: paypalCharged };
    }
    if (!paymentKey || !orderId || amount === null || Number.isNaN(amount)) {
      return { phase: "failed", error: t.errGeneric };
    }
    return { phase: "confirming" };
  });

  useEffect(() => {
    if (state.phase !== "confirming" || fired.current) return;
    if (!paymentKey || !orderId || amount === null) return;
    fired.current = true;
    void (async () => {
      const res = await confirmEventTossPaymentAction({ paymentKey, orderId, amount });
      if (res.ok && res.data) {
        setState({ phase: "done", orderNo: res.data.orderNo, chargedLabel: res.data.chargedLabel });
      } else if (!res.ok && res.recovery) {
        setState({ phase: "recovery", orderNo: res.orderNo ?? null });
      } else {
        setState({ phase: "failed", error: res.ok ? t.errGeneric : res.error });
      }
    })();
  }, [state.phase, paymentKey, orderId, amount, t]);

  if (state.phase === "confirming") {
    return (
      <Card icon={<Loader2 className="size-8 animate-spin text-ink-3" />} title={t.confirmingTitle}>
        <p className="text-[13px] leading-relaxed text-ink-2">{t.confirmingBody}</p>
      </Card>
    );
  }

  if (state.phase === "recovery") {
    return (
      <Card icon={<Clock className="size-10 text-warn" />} title={t.recoveryTitle} tone="warn">
        <p className="text-[13px] leading-relaxed text-ink-2">{t.recoveryBody}</p>
        {state.orderNo ? (
          <p className="text-[12px] text-ink-3">
            {t.orderNoLabel} <span className="font-mono font-semibold text-foreground">{state.orderNo}</span>
          </p>
        ) : null}
        <p className="text-[12px] text-ink-4">{t.contact}</p>
      </Card>
    );
  }

  if (state.phase === "failed") {
    return (
      <Card icon={<XCircle className="size-10 text-ink-3" />} title={t.failTitle}>
        <p className="text-[13px] leading-relaxed text-ink-2">
          <span className="block">{state.error}</span>
          <span className="block">{t.failBody}</span>
        </p>
        <Link
          href={backHref}
          className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t.backToEvent}
        </Link>
      </Card>
    );
  }

  return (
    <Card icon={<CheckCircle2 className="size-10 text-primary" />} title={t.successTitle} tone="ok">
      <div className="flex w-full flex-col gap-1.5 rounded-lg bg-background/70 p-4 text-[13px]">
        {state.orderNo ? (
          <p className="flex justify-between">
            <span className="text-ink-3">{t.orderNoLabel}</span>
            <span className="font-mono font-semibold">{state.orderNo}</span>
          </p>
        ) : null}
        {state.chargedLabel ? (
          <p className="flex justify-between">
            <span className="text-ink-3">Total</span>
            <span className="font-bold">{state.chargedLabel}</span>
          </p>
        ) : null}
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">{t.successBody}</p>
      <Link
        href={backHref}
        className="mt-1 flex w-full items-center justify-center rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t.backToEvent}
      </Link>
    </Card>
  );
}

function Card({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "ok" | "warn";
  children: React.ReactNode;
}) {
  const border =
    tone === "ok"
      ? "border-2 border-primary/40 bg-primary/5"
      : tone === "warn"
        ? "border-2 border-warn/50 bg-warn/5"
        : "border border-hairline-2 bg-card";
  return (
    <div className={`flex w-full flex-col items-center gap-4 rounded-2xl p-8 text-center ${border}`}>
      {icon}
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
