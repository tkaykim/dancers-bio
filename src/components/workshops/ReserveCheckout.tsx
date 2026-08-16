"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ANONYMOUS, loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from "@paypal/react-paypal-js";
import { CreditCard, Landmark, Loader2 } from "lucide-react";

import {
  captureWorkshopPaypalOrderAction,
  createWorkshopPaypalOrderAction,
  createWorkshopReservationAction,
  type WorkshopCheckoutSession,
} from "@/app/actions/workshop-checkout";
import { cn } from "@/lib/utils";
import { won } from "@/lib/workshops/shared";

// 예약금 체크아웃 — grigoent /training 의 2단계 패턴 이식.
// ① 예약자 정보 → 예약(주문) 생성  ② 결제수단 타일(카드/계좌이체=토스 결제창, PayPal 버튼)

const useLiveToss = process.env.NEXT_PUBLIC_TOSS_USE_LIVE === "true";
const tossClientKey = useLiveToss
  ? process.env.NEXT_PUBLIC_TOSS_LIVE_CLIENT_KEY || process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
  : process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

type Method = "CARD" | "TRANSFER" | "PAYPAL";

export function ReserveCheckout({
  artistId,
  depositAmount,
  artistSlug,
  defaultName,
  defaultEmail,
}: {
  artistId: string;
  depositAmount: number;
  artistSlug: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [session, setSession] = useState<WorkshopCheckoutSession | null>(null);
  const [method, setMethod] = useState<Method>("CARD");
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [pending, startTransition] = useTransition();

  // 예약자 정보가 바뀌면 기존 주문 세션을 버리고 다시 만든다.
  const invalidate = () => setSession(null);

  const createSession = () => {
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("이름과 이메일을 입력해 주세요.");
      return;
    }
    if (!agreed) {
      setError("예약금·환불 규정에 동의해 주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createWorkshopReservationAction({ artistId, name, email, phone });
      if (res.ok && res.data) {
        setSession(res.data);
      } else {
        setError(res.ok ? "다시 시도해 주세요." : res.error);
      }
    });
  };

  const requestToss = useCallback(
    async (m: "CARD" | "TRANSFER") => {
      if (!session) return;
      if (!tossClientKey) {
        setError("결제 설정이 아직 완료되지 않았습니다.");
        return;
      }
      if (requesting) return;
      setRequesting(true);
      setError(null);
      try {
        const origin = window.location.origin;
        const toss = await loadTossPayments(tossClientKey);
        const payment = toss.payment({ customerKey: session.customerKey || ANONYMOUS });
        const common = {
          amount: { currency: "KRW" as const, value: session.amount },
          orderId: session.pgOrderId,
          orderName: session.orderName,
          successUrl: `${origin}/workshops/pay/success?slug=${encodeURIComponent(artistSlug)}`,
          failUrl: `${origin}/workshops/pay/fail?slug=${encodeURIComponent(artistSlug)}`,
          customerName: session.customerName || undefined,
          customerEmail: session.customerEmail || undefined,
          customerMobilePhone: session.customerPhone || undefined,
        };
        if (m === "TRANSFER") {
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
        console.error("[workshop/toss] requestPayment failed", e);
        const message = e instanceof Error && e.message ? e.message : "결제 요청에 실패했습니다.";
        setError(message);
      } finally {
        setRequesting(false);
      }
    },
    [session, requesting, artistSlug],
  );

  // ── Phase A: 예약자 정보 ─────────────────────────────────────────────
  if (!session) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">
              이름 <span className="text-red-500">*</span>
            </span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-foreground">
              이메일 <span className="text-red-500">*</span>
            </span>
            <input
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-foreground">휴대폰 번호 (선택)</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="확정·일정 안내에 사용합니다"
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
            <span className="block">예약금은 참가비의 일부이며, 인원 미달로 열리지 않으면 전액 환불됩니다.</span>
            <span className="block">확정 후에는 개인 사유 취소·환불이 제한될 수 있고, 양도는 운영진 확인 후 가능합니다.</span>
            <span className="block font-semibold text-foreground">위 예약금·환불 규정을 확인했고 동의합니다.</span>
          </span>
        </label>

        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

        <button
          type="button"
          onClick={createSession}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "예약 생성 중…" : `예약금 ${won(depositAmount)} 결제 진행`}
        </button>
      </div>
    );
  }

  // ── Phase B: 결제수단 ────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border border-hairline-2 bg-secondary/40 px-4 py-3">
        <div>
          <p className="text-[12px] text-ink-3">결제번호</p>
          <p className="font-mono text-[13px] font-semibold text-foreground">{session.orderNo}</p>
        </div>
        <div className="text-right">
          <p className="text-[12px] text-ink-3">예약금</p>
          <p className="text-base font-bold text-foreground">{won(session.amount)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            { key: "CARD", label: "카드", Icon: CreditCard },
            { key: "TRANSFER", label: "계좌이체", Icon: Landmark },
            { key: "PAYPAL", label: "PayPal", Icon: CreditCard },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-[13px] font-semibold transition-colors",
              method === m.key
                ? "border-foreground bg-primary/5 text-foreground"
                : "border-hairline-2 text-ink-3 hover:text-foreground",
            )}
          >
            <m.Icon className="size-4" />
            {m.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-[13px] text-red-600">{error}</p> : null}

      {method === "PAYPAL" ? (
        <WorkshopPayPal
          session={session}
          onSuccess={(orderNo) => {
            router.push(
              `/workshops/pay/success?provider=paypal&orderNo=${encodeURIComponent(orderNo)}&slug=${encodeURIComponent(artistSlug)}`,
            );
          }}
          onRecovery={(orderNo) => {
            // 돈은 받았는데 확정 실패 — 실패 문구 대신 "확인 중" 화면으로 보낸다.
            router.push(
              `/workshops/pay/success?provider=paypal&recovery=1&orderNo=${encodeURIComponent(orderNo ?? "")}&slug=${encodeURIComponent(artistSlug)}`,
            );
          }}
          onError={(m) => setError(m)}
        />
      ) : (
        <button
          type="button"
          onClick={() => requestToss(method as "CARD" | "TRANSFER")}
          disabled={requesting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {requesting ? <Loader2 className="size-4 animate-spin" /> : null}
          {requesting ? "결제창을 여는 중…" : method === "CARD" ? "카드로 결제하기" : "계좌이체로 결제하기"}
        </button>
      )}

      <button
        type="button"
        onClick={invalidate}
        className="text-center text-[12px] text-ink-4 underline-offset-2 hover:underline"
      >
        예약자 정보 수정
      </button>
    </div>
  );
}

// ── PayPal ──────────────────────────────────────────────────────────────────

type PayPalProps = {
  session: WorkshopCheckoutSession;
  onSuccess: (orderNo: string) => void;
  onRecovery: (orderNo: string | null) => void;
  onError: (message: string) => void;
};

function WorkshopPayPal(props: PayPalProps) {
  if (!paypalClientId) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-[13px] text-amber-800">
        PayPal 설정이 아직 완료되지 않았습니다.
      </div>
    );
  }
  return (
    <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "USD", intent: "capture" }}>
      <PayPalInner {...props} />
    </PayPalScriptProvider>
  );
}

function PayPalInner({ session, onSuccess, onRecovery, onError }: PayPalProps) {
  const [{ isPending }] = usePayPalScriptReducer();
  const [processing, setProcessing] = useState(false);

  if (isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-3">
        <Loader2 className="size-4 animate-spin" />
        PayPal 불러오는 중…
      </div>
    );
  }

  return (
    <div>
      {processing ? <p className="mb-3 text-[13px] text-ink-3">결제를 처리하고 있습니다…</p> : null}
      <PayPalButtons
        style={{ layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 48 }}
        disabled={processing}
        createOrder={async () => {
          setProcessing(true);
          try {
            const res = await createWorkshopPaypalOrderAction({
              pgOrderId: session.pgOrderId,
              orderName: session.orderName,
            });
            if (!res.ok || !res.data) throw new Error(res.ok ? "PayPal 주문 생성에 실패했습니다." : res.error);
            return res.data.id;
          } catch (e) {
            const m = e instanceof Error ? e.message : "PayPal 주문 생성에 실패했습니다.";
            onError(m);
            throw e;
          } finally {
            setProcessing(false);
          }
        }}
        onApprove={async (data) => {
          setProcessing(true);
          try {
            const res = await captureWorkshopPaypalOrderAction({
              paypalOrderId: data.orderID,
              pgOrderId: session.pgOrderId,
            });
            if (!res.ok && res.recovery) {
              onRecovery(res.orderNo);
              return;
            }
            if (!res.ok || !res.data) throw new Error(res.ok ? "PayPal 결제 승인에 실패했습니다." : res.error);
            onSuccess(res.data.orderNo);
          } catch (e) {
            onError(e instanceof Error ? e.message : "PayPal 결제 승인에 실패했습니다.");
          } finally {
            setProcessing(false);
          }
        }}
        onError={() => onError("PayPal 결제에 실패했습니다. 다시 시도해 주세요.")}
        onCancel={() => onError("결제가 취소되었습니다.")}
      />
      <p className="mt-3 text-center text-[12px] text-ink-4">
        해외 카드와 PayPal 잔액으로 결제할 수 있습니다 (달러로 환산 청구).
      </p>
    </div>
  );
}
