"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { Check, CreditCard, Landmark, Loader2 } from "lucide-react";

import {
  captureEventPaypalOrderAction,
  createEventOrderAction,
  createEventPaypalOrderAction,
  type EventCheckoutSession,
} from "@/app/actions/workshop-events";
import { cn } from "@/lib/utils";
import {
  ET,
  formatBaht,
  formatKrw,
  hhmm,
  type EventLang,
  type PublicEvent,
  type PublicEventSession,
} from "@/lib/workshops/event-shared";

// 행사 신청 클라이언트 — 세션 다중 선택 → 신청자 정보 → 결제(PayPal THB / Toss KRW).
// ⚠️ 정원·잔여석은 어떤 형태로도 표시하지 않는다. 마감 세션은 "Sold out" 배지뿐이다.

const useLiveToss = process.env.NEXT_PUBLIC_TOSS_USE_LIVE === "true";
const tossClientKey = useLiveToss
  ? process.env.NEXT_PUBLIC_TOSS_LIVE_CLIENT_KEY || process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
  : process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

export function EventRegisterClient({
  event,
  sessions,
  lang,
  defaultName,
  defaultEmail,
}: {
  event: PublicEvent;
  sessions: PublicEventSession[];
  lang: EventLang;
  defaultName: string;
  defaultEmail: string;
}) {
  const t = ET[lang];
  const router = useRouter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"schedule" | "info" | "pay">("schedule");
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [session, setSession] = useState<EventCheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [krwOpen, setKrwOpen] = useState(false);

  const dates = useMemo(() => {
    const map = new Map<string, PublicEventSession[]>();
    for (const s of sessions) {
      const list = map.get(s.session_date) ?? [];
      list.push(s);
      map.set(s.session_date, list);
    }
    return [...map.entries()];
  }, [sessions]);

  const chosen = sessions.filter((s) => selected.has(s.id));
  const totalKrw = chosen.reduce((sum, s) => sum + s.price_krw, 0);
  const totalThb = chosen.every((s) => s.price_thb !== null)
    ? chosen.reduce((sum, s) => sum + (s.price_thb ?? 0), 0)
    : null;

  const toggle = (s: PublicEventSession) => {
    if (s.is_closed) return;
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
    setSession(null); // 선택이 바뀌면 기존 주문 무효
  };

  const createOrder = () => {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError(t.errNeedFields);
      return;
    }
    if (!agreed) {
      setError(t.errAgree);
      return;
    }
    setPending(true);
    void (async () => {
      try {
        const res = await createEventOrderAction({
          eventId: event.id,
          sessionIds: [...selected],
          name,
          email,
          phone,
          lang,
        });
        if (res.ok && "data" in res && res.data) {
          setSession(res.data);
          setPhase("pay");
        } else if (!res.ok && "code" in res) {
          const msg = t.seatErrors[res.code] ?? t.errGeneric;
          setError(res.session ? `${msg} (${res.session})` : msg);
          if (res.code === "FULL" || res.code === "SESSION_CLOSED") {
            router.refresh(); // 마감 반영
            setPhase("schedule");
          }
        } else {
          setError(!res.ok && "error" in res ? res.error : t.errGeneric);
        }
      } finally {
        setPending(false);
      }
    })();
  };

  const requestToss = useCallback(
    async (method: "CARD" | "TRANSFER") => {
      if (!session || !tossClientKey || requesting) return;
      setRequesting(true);
      setError(null);
      try {
        const origin = window.location.origin;
        const toss = await loadTossPayments(tossClientKey);
        const payment = toss.payment({ customerKey: session.customerKey ?? ANONYMOUS });
        const common = {
          amount: { currency: "KRW" as const, value: session.amountKrw },
          orderId: session.pgOrderId,
          orderName: `${event.title} (${session.sessionCount})`,
          successUrl: `${origin}/workshops/e/pay/success?slug=${encodeURIComponent(event.slug)}&lang=${lang}`,
          failUrl: `${origin}/workshops/e/pay/fail?slug=${encodeURIComponent(event.slug)}&lang=${lang}`,
          customerName: session.customerName || undefined,
          customerEmail: session.customerEmail || undefined,
          customerMobilePhone: session.customerPhone || undefined,
        };
        if (method === "TRANSFER") {
          await payment.requestPayment({
            ...common,
            method: "TRANSFER",
            transfer: { cashReceipt: { type: "소득공제" }, useEscrow: false },
          });
        } else {
          await payment.requestPayment({
            ...common,
            method: "CARD",
            card: { useEscrow: false, flowMode: "DEFAULT", useCardPoint: false, useAppCardOnly: false },
          });
        }
      } catch (e) {
        console.error("[event/toss] requestPayment failed", e);
        setError(e instanceof Error && e.message ? e.message : t.errGeneric);
      } finally {
        setRequesting(false);
      }
    },
    [session, requesting, event.slug, event.title, lang, t],
  );

  // ── 시간표 ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-lg font-bold tracking-tight">{t.scheduleTitle}</h2>
        <div className="flex flex-col gap-5">
          {dates.map(([date, list]) => (
            <div key={date}>
              {dates.length > 1 ? (
                <p className="mb-2 text-[13px] font-bold text-ink-2">{date}</p>
              ) : null}
              <div className="flex flex-col gap-2.5">
                {list.map((s) => {
                  const isSel = selected.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s)}
                      disabled={s.is_closed}
                      className={cn(
                        "flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-colors md:p-4",
                        s.is_closed
                          ? "cursor-not-allowed border-hairline-2 bg-secondary/30 opacity-60"
                          : isSel
                            ? "border-foreground bg-primary/5"
                            : "border-hairline-2 bg-card hover:border-foreground/40",
                      )}
                    >
                      <div className="size-12 shrink-0 overflow-hidden rounded-full bg-secondary md:size-14">
                        {s.instructor_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.instructor_image_url} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center text-base font-bold text-ink-4">
                            {s.instructor_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11.5px] text-ink-3">
                          {hhmm(s.start_time)}–{hhmm(s.end_time)}
                        </p>
                        <p className="truncate text-[15px] font-bold text-foreground">{s.title}</p>
                        <p className="truncate text-[12px] text-ink-3">
                          {s.instructor_name}
                          {s.level ? ` · ${s.level}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {s.is_closed ? (
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-ink-3">
                            {t.closed}
                          </span>
                        ) : (
                          <>
                            <p className="text-[14px] font-bold text-foreground">
                              {s.price_thb !== null ? formatBaht(s.price_thb) : formatKrw(s.price_krw)}
                            </p>
                            <p className="text-[10.5px] text-ink-4">
                              {s.price_thb !== null ? formatKrw(s.price_krw) : t.perClass}
                            </p>
                            <span
                              className={cn(
                                "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold",
                                isSel
                                  ? "border-foreground bg-primary text-primary-foreground"
                                  : "border-hairline-2 text-ink-3",
                              )}
                            >
                              {isSel ? <Check className="size-3" /> : null}
                              {isSel ? t.selected : t.select}
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 선택 요약 + 다음 단계 */}
      {phase === "schedule" && selected.size > 0 ? (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border-2 border-foreground bg-background p-4 shadow-lg">
          <div>
            <p className="text-[12px] text-ink-3">{t.totalLabel(selected.size)}</p>
            <p className="text-lg font-bold tracking-tight">
              {totalThb !== null ? formatBaht(totalThb) : formatKrw(totalKrw)}
              {totalThb !== null ? (
                <span className="ml-1.5 text-[12px] font-normal text-ink-3">{formatKrw(totalKrw)}</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPhase("info")}
            className="rounded-lg bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.registerCta}
          </button>
        </div>
      ) : null}

      {/* 신청자 정보 */}
      {phase === "info" ? (
        <section className="rounded-2xl border-2 border-primary/40 bg-card p-5 md:p-6">
          <h2 className="mb-4 text-lg font-bold tracking-tight">{t.formTitle}</h2>
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">
                  {t.name} <span className="text-red-500">*</span>
                </span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">
                  {t.email} <span className="text-red-500">*</span>
                </span>
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
                <span className="text-[11.5px] text-ink-4">{t.emailNote}</span>
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">
                {t.phone} <span className="font-normal text-ink-4">{t.phoneOptional}</span>
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-hairline-2 bg-secondary/40 px-4 py-3">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-4 accent-black"
              />
              <span className="text-[12px] leading-relaxed text-ink-2">
                <span className="block">{t.agree1}</span>
                <span className="block">{t.agree2}</span>
                <span className="block font-semibold text-foreground">{t.agreeConfirm}</span>
              </span>
            </label>

            {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhase("schedule")}
                className="rounded-lg border border-hairline-2 px-4 py-3.5 text-sm font-semibold text-ink-2 transition-colors hover:text-foreground"
              >
                {t.backToSchedule}
              </button>
              <button
                type="button"
                onClick={createOrder}
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {pending ? t.creating : t.createOrder}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* 결제 */}
      {phase === "pay" && session ? (
        <section className="rounded-2xl border-2 border-primary/40 bg-card p-5 md:p-6">
          <h2 className="mb-3 text-lg font-bold tracking-tight">{t.payTitle}</h2>
          <div className="mb-4 flex items-center justify-between rounded-lg border border-hairline-2 bg-secondary/40 px-4 py-3">
            <div>
              <p className="text-[12px] text-ink-3">{t.orderNoLabel}</p>
              <p className="font-mono text-[13px] font-semibold">{session.orderNo}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-ink-3">{t.totalLabel(session.sessionCount)}</p>
              <p className="text-base font-bold">
                {session.amountThb !== null ? formatBaht(session.amountThb) : formatKrw(session.amountKrw)}
              </p>
            </div>
          </div>

          {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}

          <p className="mb-1.5 text-[13px] font-bold">{t.payPaypal}</p>
          <p className="mb-3 text-[12px] leading-relaxed text-ink-4">{t.paypalNote}</p>
          <EventPayPal
            session={session}
            orderName={`${event.title} (${session.sessionCount})`}
            lang={lang}
            onSuccess={(orderNo, charged) => {
              router.push(
                `/workshops/e/pay/success?provider=paypal&orderNo=${encodeURIComponent(orderNo)}&charged=${encodeURIComponent(charged ?? "")}&slug=${encodeURIComponent(event.slug)}&lang=${lang}`,
              );
            }}
            onRecovery={(orderNo) => {
              router.push(
                `/workshops/e/pay/success?provider=paypal&recovery=1&orderNo=${encodeURIComponent(orderNo ?? "")}&slug=${encodeURIComponent(event.slug)}&lang=${lang}`,
              );
            }}
            onError={(m) => setError(m)}
          />

          <div className="mt-4 border-t border-hairline-2 pt-4">
            <button
              type="button"
              onClick={() => setKrwOpen((v) => !v)}
              className="text-[13px] font-bold text-foreground underline-offset-2 hover:underline"
            >
              {t.payKrw} · {formatKrw(session.amountKrw)}
            </button>
            <p className="mt-0.5 text-[11.5px] text-ink-4">{t.krwNote}</p>
            {krwOpen ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => requestToss("CARD")}
                  disabled={requesting}
                  className="flex items-center justify-center gap-2 rounded-lg border border-hairline-2 px-4 py-3 text-[13px] font-bold transition-colors hover:bg-secondary/50 disabled:opacity-45"
                >
                  <CreditCard className="size-4" /> {t.payKrwCard}
                </button>
                <button
                  type="button"
                  onClick={() => requestToss("TRANSFER")}
                  disabled={requesting}
                  className="flex items-center justify-center gap-2 rounded-lg border border-hairline-2 px-4 py-3 text-[13px] font-bold transition-colors hover:bg-secondary/50 disabled:opacity-45"
                >
                  <Landmark className="size-4" /> {t.payKrwTransfer}
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              setSession(null);
              setPhase("info");
            }}
            className="mt-4 w-full text-center text-[12px] text-ink-4 underline-offset-2 hover:underline"
          >
            {t.editInfo}
          </button>
        </section>
      ) : null}
    </div>
  );
}

// ── PayPal ──────────────────────────────────────────────────────────────────

type EventPayPalProps = {
  session: EventCheckoutSession;
  orderName: string;
  lang: EventLang;
  onSuccess: (orderNo: string, chargedLabel: string | null) => void;
  onRecovery: (orderNo: string | null) => void;
  onError: (message: string) => void;
};

function EventPayPal(props: EventPayPalProps) {
  if (!paypalClientId) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800">
        PayPal is not configured yet.
      </div>
    );
  }
  const currency = props.session.amountThb !== null ? "THB" : "USD";
  return (
    <PayPalScriptProvider options={{ clientId: paypalClientId, currency, intent: "capture" }}>
      <EventPayPalInner {...props} />
    </PayPalScriptProvider>
  );
}

function EventPayPalInner({ session, orderName, lang, onSuccess, onRecovery, onError }: EventPayPalProps) {
  const t = ET[lang];
  const [{ isPending }] = usePayPalScriptReducer();
  const [processing, setProcessing] = useState(false);

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-3">
        <Loader2 className="size-4 animate-spin" /> PayPal…
      </div>
    );
  }

  return (
    <div>
      {processing ? <p className="mb-2 text-[13px] text-ink-3">…</p> : null}
      <PayPalButtons
        style={{ layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 48 }}
        disabled={processing}
        createOrder={async () => {
          setProcessing(true);
          try {
            const res = await createEventPaypalOrderAction({
              pgOrderId: session.pgOrderId,
              description: orderName,
            });
            if (!res.ok || !res.data) throw new Error(res.ok ? t.errGeneric : res.error);
            return res.data.id;
          } catch (e) {
            onError(e instanceof Error ? e.message : t.errGeneric);
            throw e;
          } finally {
            setProcessing(false);
          }
        }}
        onApprove={async (data) => {
          setProcessing(true);
          try {
            const res = await captureEventPaypalOrderAction({
              paypalOrderId: data.orderID,
              pgOrderId: session.pgOrderId,
            });
            if (!res.ok && res.recovery) {
              onRecovery(res.orderNo);
              return;
            }
            if (!res.ok || !res.data) throw new Error(res.ok ? t.errGeneric : res.error);
            onSuccess(res.data.orderNo, res.data.chargedLabel);
          } catch (e) {
            onError(e instanceof Error ? e.message : t.errGeneric);
          } finally {
            setProcessing(false);
          }
        }}
        onError={() => onError(t.errGeneric)}
      />
    </div>
  );
}
