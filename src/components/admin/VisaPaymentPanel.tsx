"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, CircleAlert, Clipboard, Link2, Loader2, Undo2 } from "lucide-react";
import { issueVisaPaymentLinkAction } from "@/app/actions/visa-payment";

// 오디션까지 마친 지원자의 결제 단계.
//
// 결제 정본은 grigoent(별도 시스템)이고 여기 표시되는 값은 결제 콜백으로 넘어온 사본이다.
// 그래서 이 패널은 "링크 발급"만 하고, 결제 완료 여부는 직접 수정하지 못하게 둔다.
//
// 트레이닝 패키지 링크는 관리자가 금액을 정해 발급한다. 오디션 참가비를 이미 낸 지원자는
// 기본값이 3,900,000원이다. 같은 상품 링크는 주소가 그대로라, 금액만 바꿔 다시 발급해도 된다.

const PRODUCTS = [
  { slug: "audition-fee", label: "오디션 참석 확정비" },
  { slug: "training-and-placement", label: "트레이닝 패키지" },
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
  /** 마지막으로 발급한 링크의 상품. null 이면 옛 오디션비 링크다. */
  issuedProductSlug: string | null;
  auditionFeePaid: boolean;
  /** 지금 발급돼 있는 트레이닝 패키지 링크 금액 */
  programAmountIssued: number | null;
  /** 금액 입력칸 기본값 (오디션비 결제자 3,900,000 / 그 외 4,000,000) */
  programAmountDefault: number;
};

function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

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
  const paid = state.paymentStatus === "paid";
  const refunded = state.paymentStatus === "refunded";
  // 오디션비만 결제된 상태면 다음 결제(트레이닝 패키지) 링크를 발급할 수 있다.
  const auditionOnlyPaid = paid && (state.issuedProductSlug ?? "audition-fee") === "audition-fee";
  const canIssue = !paid || auditionOnlyPaid;
  const products = auditionOnlyPaid ? PRODUCTS.filter((item) => item.slug !== "audition-fee") : PRODUCTS;

  const [product, setProduct] = useState<ProductSlug>(
    auditionOnlyPaid || state.issuedProductSlug === "training-and-placement" ? "training-and-placement" : "audition-fee",
  );
  const [amountInput, setAmountInput] = useState(state.programAmountDefault.toLocaleString("ko-KR"));
  const amount = Number(amountInput.replace(/[^0-9]/g, ""));
  const amountValid = Number.isInteger(amount) && amount >= 10_000 && amount <= 20_000_000;
  const [link, setLink] = useState<string | null>(null);
  const [issuedAmount, setIssuedAmount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = () => {
    setError(null);
    setLink(null);
    if (product === "training-and-placement" && !amountValid) {
      setError("결제 금액은 10,000원 이상 20,000,000원 이하로 입력해 주세요.");
      return;
    }
    startTransition(async () => {
      const result = await issueVisaPaymentLinkAction({
        applicationId: state.applicationId,
        productSlug: product,
        ...(product === "training-and-placement" ? { amountKrw: amount } : {}),
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
      setIssuedAmount(result.data.amountKrw ?? null);
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
            {auditionOnlyPaid ? "오디션비 결제 완료" : "결제 완료"}
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

      {canIssue ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {products.map((item) => (
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
                <span className="block opacity-80">
                  {item.slug === "audition-fee" ? "100,000원" : "금액 직접 입력"}
                </span>
              </button>
            ))}
          </div>

          {product === "training-and-placement" ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700" htmlFor={`program-amount-${state.applicationId}`}>
                결제 금액
              </label>
              <div className="flex max-w-xs items-center gap-2">
                <input
                  id={`program-amount-${state.applicationId}`}
                  inputMode="numeric"
                  value={amountInput}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/[^0-9]/g, "").slice(0, 9);
                    setAmountInput(digits ? Number(digits).toLocaleString("ko-KR") : "");
                  }}
                  className="admin-input w-full text-right font-semibold"
                />
                <span className="shrink-0 text-xs text-zinc-600">원</span>
              </div>
              <p className="text-xs text-zinc-500">
                {state.auditionFeePaid
                  ? "오디션 참가비 100,000원 결제가 확인돼 3,900,000원이 기본으로 들어가 있습니다."
                  : "오디션 참가비 결제 기록이 없어 4,000,000원이 기본으로 들어가 있습니다."}
              </p>
              {state.programAmountIssued !== null ? (
                <p className="text-xs text-sky-700">
                  지금 보낸 링크의 금액은 {formatWon(state.programAmountIssued)}입니다. 금액을 바꿔 다시 발급하면 같은
                  링크에서 새 금액으로 결제됩니다.
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={issue}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {product === "training-and-placement" && amountValid ? `${formatWon(amount)} 결제 링크 발급` : "결제 링크 발급"}
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
            {issuedAmount !== null ? `결제 금액 ${formatWon(issuedAmount)} · ` : ""}이 링크로 결제하면 결제 완료가 이 케이스에
            자동으로 표시됩니다. 링크에는 유효기간이 없습니다.
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
