"use client";

import { useState, useTransition } from "react";
import { CircleDollarSign, Home, Loader2, Sparkles } from "lucide-react";

import { reserveVillageFromCaseAction } from "@/app/actions/village-deposit";
import { cn } from "@/lib/utils";

// 오디션 참가비 + Village 사전예약금 선택형 견적.
//
// 설계 (2026-08-16 대표 확정):
// - 항목을 체크/해제하면 "지금 결제할 금액"과 "진행 시 예상 총액"이 같이 바뀐다.
// - 지금 내는 돈은 항상 작게 유지한다. 큰 금액(400만·200만)은 "예상"으로만 보여준다.
// - 모든 선결제는 자리 확정 보증금이다 — 진행하면 다음 결제에서 차감되고, 무산되면 전액 환불.
//   그래서 오디션비는 프로그램 결제에서, Village 예약금은 입주 첫 결제에서 각각 차감된다.
// - Village 는 접힌 "자세히 보기"로 두어, 오디션만 하러 온 사람의 길을 막지 않는다.

type Lang = "en" | "ja" | "ko";

const AUDITION_FEE_KRW = 100_000;
const VILLAGE_DEPOSIT_KRW = 200_000;
const PROGRAM_BASE_KRW = 4_000_000;
/** Village 입주 첫 결제(옵션 A 기준). 옵션 B는 240만원이라 "부터"로 표기한다. */
const VILLAGE_FIRST_PAYMENT_KRW = 2_000_000;

type Copy = {
  title: string;
  lead: string;
  auditionName: string;
  auditionDesc: string;
  villageName: string;
  villageDesc: string;
  villageMore: string;
  villageBullets: string[];
  villageBeta: string;
  payNow: string;
  estimate: string;
  estimateNote: string;
  auditionPaidChip: string;
  villagePaidChip: string;
  payAudition: string;
  payVillage: string;
  paySeq: string;
  err: string;
  approx: (v: string) => string;
};

const T: Record<Lang, Copy> = {
  en: {
    title: "Choose what you want",
    lead: "Tick what you want now. Everything you pay up front is credited back later.",
    auditionName: "Audition · level test",
    auditionDesc: "Confirms your seat. Fully credited to the program payment.",
    villageName: "deetz Village pre-registration",
    villageDesc: "Reserve a room in the dancer house. No key money deposit.",
    villageMore: "See details",
    villageBullets: [
      "Not open yet — we are confirming the building (beta).",
      "₩500,000–600,000 per month, deposit ₩0.",
      "Credited to your first payment when you move in.",
      "Full refund if the opening does not happen, or any time before move-in.",
    ],
    villageBeta: "Beta · pre-registration",
    payNow: "Pay now",
    estimate: "Estimated total if you continue",
    estimateNote: "What you pay now is deducted from these amounts.",
    auditionPaidChip: "Paid",
    villagePaidChip: "Reserved",
    payAudition: "Pay the audition fee",
    payVillage: "Reserve deetz Village",
    paySeq: "Pay one at a time — start with the audition fee.",
    err: "Something went wrong. Please try again.",
    approx: (v) => `about ${v}`,
  },
  ja: {
    title: "必要なものを選んでください",
    lead: "今回申し込むものにチェックしてください。先にお支払いいただいた分は、後で全額差し引かれます。",
    auditionName: "オーディション・レベルテスト",
    auditionDesc: "参加を確定します。プログラム決済から全額差引。",
    villageName: "deetz Village 事前予約",
    villageDesc: "保証金なしのダンサーハウスの入居枠を確保します。",
    villageMore: "詳しく見る",
    villageBullets: [
      "まだオープン前です。物件を確定中（ベータ）。",
      "月50万〜60万ウォン、保証金は0です。",
      "ご入居時に初回のお支払いから全額差し引かれます。",
      "オープンが実現しない場合、また入居開始前ならいつでも全額返金します。",
    ],
    villageBeta: "ベータ · 事前予約",
    payNow: "今回のお支払い",
    estimate: "進める場合の想定総額",
    estimateNote: "今回お支払いいただく分は、この金額から差し引かれます。",
    auditionPaidChip: "お支払い済み",
    villagePaidChip: "予約済み",
    payAudition: "参加費を支払う",
    payVillage: "deetz Village を予約する",
    paySeq: "お支払いは1件ずつです。まず参加費からお願いします。",
    err: "エラーが発生しました。もう一度お試しください。",
    approx: (v) => `約${v}`,
  },
  ko: {
    title: "필요한 것을 선택하세요",
    lead: "지금 신청할 항목을 체크해 주세요. 먼저 내신 금액은 나중에 전액 차감됩니다.",
    auditionName: "오디션·레벨테스트",
    auditionDesc: "참석을 확정합니다. 프로그램 결제에서 전액 차감.",
    villageName: "deetz Village 사전예약",
    villageDesc: "보증금 없는 댄서 하우스 입주 자리를 확보합니다.",
    villageMore: "자세히 보기",
    villageBullets: [
      "아직 오픈 전이며 건물을 확정하는 중입니다(베타).",
      "월 50만~60만원, 보증금은 0원입니다.",
      "입주하시면 첫 결제 금액에서 전액 차감됩니다.",
      "오픈이 무산되거나, 입주 시작 전이라면 언제든 전액 환불해 드립니다.",
    ],
    villageBeta: "베타 · 사전예약",
    payNow: "지금 결제할 금액",
    estimate: "진행 시 예상 총액",
    estimateNote: "지금 결제하신 금액은 이 금액에서 차감됩니다.",
    auditionPaidChip: "결제 완료",
    villagePaidChip: "예약 완료",
    payAudition: "오디션 참가비 결제하기",
    payVillage: "deetz Village 예약하기",
    paySeq: "결제는 한 건씩 진행됩니다. 오디션 참가비부터 결제해 주세요.",
    err: "오류가 발생했습니다. 다시 시도해 주세요.",
    approx: (v) => `약 ${v}`,
  },
};

function won(amount: number, lang: Lang): string {
  if (lang === "en") return `₩${amount.toLocaleString("en-US")}`;
  const man = (amount / 10_000).toLocaleString("en-US");
  return lang === "ja" ? `${man}万ウォン` : `${man}만원`;
}

export function VisaQuoteBuilder({
  lang,
  caseToken,
  auditionPayable,
  auditionPaid,
  auditionPaymentUrl,
  villageDepositStatus,
}: {
  lang: Lang;
  caseToken: string;
  /** 관리자가 오디션 결제 링크를 발급한 상태인가 */
  auditionPayable: boolean;
  auditionPaid: boolean;
  auditionPaymentUrl: string | null;
  villageDepositStatus: string;
}) {
  const t = T[lang];
  const villagePaid = villageDepositStatus === "paid";

  const [wantAudition, setWantAudition] = useState(!auditionPaid);
  const [wantVillage, setWantVillage] = useState(villagePaid);
  const [showVillageDetail, setShowVillageDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 이미 결제한 항목은 "지금 결제"에 넣지 않는다.
  const auditionDue = wantAudition && !auditionPaid;
  const villageDue = wantVillage && !villagePaid;
  const payNow = (auditionDue ? AUDITION_FEE_KRW : 0) + (villageDue ? VILLAGE_DEPOSIT_KRW : 0);

  const goVillage = () => {
    setError(null);
    startTransition(async () => {
      const res = await reserveVillageFromCaseAction({ token: caseToken });
      if (res.ok && res.data) window.location.href = res.data.url;
      else setError(res.ok ? t.err : res.error);
    });
  };

  return (
    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-[13px] font-bold text-foreground">{t.title}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{t.lead}</p>

      <div className="mt-3 flex flex-col gap-2">
        <Row
          checked={wantAudition || auditionPaid}
          disabled={auditionPaid}
          onToggle={() => setWantAudition((v) => !v)}
          icon={<Sparkles className="size-4" />}
          name={t.auditionName}
          desc={t.auditionDesc}
          amount={won(AUDITION_FEE_KRW, lang)}
          chip={auditionPaid ? t.auditionPaidChip : null}
        />

        <div>
          <Row
            checked={wantVillage || villagePaid}
            disabled={villagePaid}
            onToggle={() => setWantVillage((v) => !v)}
            icon={<Home className="size-4" />}
            name={t.villageName}
            desc={t.villageDesc}
            amount={won(VILLAGE_DEPOSIT_KRW, lang)}
            chip={villagePaid ? t.villagePaidChip : t.villageBeta}
          />
          <button
            type="button"
            onClick={() => setShowVillageDetail((v) => !v)}
            className="mt-1 pl-8 text-[12px] font-semibold text-primary hover:underline"
          >
            {t.villageMore} {showVillageDetail ? "▴" : "▾"}
          </button>
          {showVillageDetail ? (
            <ul className="mt-1.5 flex flex-col gap-1 rounded-lg bg-background/70 px-3.5 py-3">
              {t.villageBullets.map((b, i) => (
                <li key={i} className="text-[12.5px] leading-relaxed text-ink-2">
                  · {b}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* 합계 */}
      <div className="mt-3.5 border-t border-primary/20 pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-semibold text-foreground">{t.payNow}</span>
          <span className="text-xl font-bold tracking-tight text-foreground">{won(payNow, lang)}</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-3">
          <span className="text-[12px] text-ink-3">{t.estimate}</span>
          <span className="text-right text-[12px] text-ink-3">
            {t.approx(won(PROGRAM_BASE_KRW, lang))}
            {wantVillage || villagePaid ? ` + ${won(VILLAGE_FIRST_PAYMENT_KRW, lang)}~` : ""}
          </span>
        </div>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-4">{t.estimateNote}</p>
      </div>

      {/* 결제 버튼 — 한 번에 한 건씩. 오디션이 먼저다. */}
      <div className="mt-3 flex flex-col gap-2">
        {auditionDue && auditionPayable && auditionPaymentUrl ? (
          <a
            href={auditionPaymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            <CircleDollarSign className="size-4" />
            {t.payAudition} · {won(AUDITION_FEE_KRW, lang)}
          </a>
        ) : null}

        {villageDue ? (
          <button
            type="button"
            onClick={goVillage}
            disabled={pending}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-colors disabled:opacity-45",
              auditionDue && auditionPayable
                ? "border border-hairline-2 text-foreground hover:bg-secondary"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Home className="size-4" />}
            {t.payVillage} · {won(VILLAGE_DEPOSIT_KRW, lang)}
          </button>
        ) : null}

        {auditionDue && auditionPayable && villageDue ? (
          <p className="text-center text-[11.5px] text-ink-4">{t.paySeq}</p>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-[12.5px] text-destructive">{error}</p> : null}
    </div>
  );
}

function Row({
  checked,
  disabled,
  onToggle,
  icon,
  name,
  desc,
  amount,
  chip,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  name: string;
  desc: string;
  amount: string;
  chip: string | null;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      aria-pressed={checked}
      aria-disabled={disabled}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors",
        checked ? "border-foreground/40 bg-background" : "border-hairline-2 bg-background/50",
        disabled ? "cursor-default opacity-90" : "hover:border-foreground/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded border text-[11px] font-bold",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-hairline-2 text-transparent",
        )}
        aria-hidden
      >
        ✓
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-3">{icon}</span>
          <span className="text-[13px] font-semibold text-foreground">{name}</span>
          {chip ? (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-ink-3">
              {chip}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-2">{desc}</span>
      </span>
      <span className="shrink-0 text-[13px] font-bold text-foreground">{amount}</span>
    </button>
  );
}
