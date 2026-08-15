"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, CircleAlert, Clipboard, Link2, Loader2, Undo2 } from "lucide-react";
import { issueVisaPaymentLinkAction } from "@/app/actions/visa-payment";

// 오디션까지 마친 지원자의 결제 단계.
//
// 결제 정본은 grigoent(별도 시스템)이고 여기 표시되는 값은 결제 콜백으로 넘어온 사본이다.
// 그래서 이 패널은 "링크 발급"만 하고, 결제 완료 여부는 직접 수정하지 못하게 둔다.

const PRODUCTS = [
  { slug: "audition-fee", label: "오디션 참석 확정비", amount: "100,000원" },
  { slug: "training-and-placement", label: "트레이닝 패키지", amount: "4,000,000원" },
] as const;

type ProductSlug = (typeof PRODUCTS)[number]["slug"];

export type VisaPaymentState = {
  applicationId: string;
  paymentStatus: string;
  paymentLinkSentAt: string | null;
  paymentOrderNo: string | null;
  paymentProvider: string | null;
  paymentAmountKrw: number | null;
  paidAt: string | null;
  paymentRefundedAt: string | null;
};

function formatKst(value: string | null): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const PROVIDER_LABEL: Record<string, string> = { toss: "토스페이먼츠", paypal: "PayPal" };

export function VisaPaymentPanel({ state }: { state: VisaPaymentState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [product, setProduct] = useState<ProductSlug>("audition-fee");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const paid = state.paymentStatus === "paid";
  const refunded = state.paymentStatus === "refunded";

  const issue = () => {
    setError(null);
    setLink(null);
    startTransition(async () => {
      const result = await issueVisaPaymentLinkAction({
        applicationId: state.applicationId,
        productSlug: product,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // ActionResult 의 data 는 optional 이라 방어적으로 확인한다.
      if (!result.data?.url) {
        setError("링크를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setLink(result.data.url);
      router.refresh();
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.");
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Link2 className="h-4 w-4" />
          결제
        </h4>
        {paid ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            결제 완료
          </span>
        ) : refunded ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <Undo2 className="h-3.5 w-3.5" />
            환불됨
          </span>
        ) : state.paymentStatus === "link_sent" ? (
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
            링크 발급됨 · 입금 대기
          </span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
            미결제
          </span>
        )}
      </div>

      {paid || refunded ? (
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">주문번호</dt>
            <dd className="font-mono text-zinc-900">{state.paymentOrderNo ?? "-"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">결제수단</dt>
            <dd className="text-zinc-900">
              {state.paymentProvider ? (PROVIDER_LABEL[state.paymentProvider] ?? state.paymentProvider) : "-"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">금액</dt>
            <dd className="text-zinc-900">
              {state.paymentAmountKrw ? `${state.paymentAmountKrw.toLocaleString("ko-KR")}원` : "-"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 text-zinc-500">{refunded ? "환불일시" : "결제일시"}</dt>
            <dd className="text-zinc-900">
              {formatKst(refunded ? state.paymentRefundedAt : state.paidAt)}
            </dd>
          </div>
        </dl>
      ) : null}

      {!paid ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRODUCTS.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => setProduct(item.slug)}
                className={`rounded-md border px-3 py-2 text-left text-xs transition ${
                  product === item.slug
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-500"
                }`}
              >
                <span className="block font-semibold">{item.label}</span>
                <span className="block opacity-80">{item.amount}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={issue}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            결제 링크 발급
          </button>

          {state.paymentLinkSentAt ? (
            <p className="text-xs text-zinc-500">
              마지막 발급 {formatKst(state.paymentLinkSentAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {link ? (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <p className="mb-2 text-xs text-zinc-600">
            이 링크로 결제하면 결제 완료가 이 케이스에 자동으로 표시됩니다. 30일간 유효합니다.
          </p>
          <div className="flex items-start gap-2">
            <code className="min-w-0 flex-1 break-all text-[11px] text-zinc-800">{link}</code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:border-zinc-500"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Clipboard className="h-3.5 w-3.5" />}
              {copied ? "복사됨" : "복사"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-red-600">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </section>
  );
}
