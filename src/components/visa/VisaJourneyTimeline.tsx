"use client";

import { useState } from "react";
import { Check, CircleDollarSign, ExternalLink, Home, Video } from "lucide-react";
import Link from "next/link";
import { VisaAuditionRsvp } from "@/components/visa/VisaAuditionRsvp";
import { VisaQuoteBuilder } from "@/components/visa/VisaQuoteBuilder";
import { cn } from "@/lib/utils";

// 비자 프로그램 케이스 포털의 "내 여정" 타임라인.
//
// 설계 원칙 (2026-08-16 대표 확정):
// - 정본 화면은 케이스 포털 하나. 미팅 확정·오디션 일정·결제가 전부 여기 보인다.
// - 정보를 잠그지 않는다 — 오디션 일시·장소는 입력되는 대로 공개한다.
//   참가비는 정보 열람 대가가 아니라 "참석 확정 + 노쇼 방지" 장치다.
// - 결제까지 가는 길이 귀찮아지면 안 된다: 현재 단계 카드에 버튼 1개, 설명은 3문장 이내.
// - 완료 단계는 한 줄로 접고, 미래 단계는 제목만 보여준다.

type Lang = "en" | "ja" | "ko";

export type JourneyData = {
  followUpSubmittedAt: string | null;
  caseStage: string;
  // 미팅 (visa_meeting_invites 최신 sent 행)
  meetingAt: string | null;
  meetingUrl: string | null;
  // 오디션
  auditionAt: string | null;
  auditionLocation: string | null;
  auditionStatus: string;
  auditionResult: string;
  auditionEndsAt: string | null;
  auditionRsvp: string | null;
  // 트레이닝 분기
  trainingRequired: boolean | null;
  trainingPartner: string | null;
  trainingStartDate: string | null;
  trainingEndDate: string | null;
  monthlyEvaluationAt: string | null;
  monthlyEvaluationResult: string;
  // 결제 (grigoent 미러링)
  paymentStatus: string;
  paymentProductSlug: string | null;
  paymentUrl: string | null;
  paymentAmountKrw: number | null;
  paidAt: string | null;
  // Village 개인화·사전예약
  wantsHousing: boolean;
  villageDepositStatus: string;
  villageDepositPaidAt: string | null;
};

// 금액 상수는 선택형 견적(VisaQuoteBuilder)이 정본으로 들고 있다.

type StepState = "done" | "now" | "todo";

type Copy = {
  title: string;
  steps: {
    apply: string;
    info: string;
    meeting: string;
    audition: string;
    levelTest: string;
    visaDocs: string;
  };
  infoNow: string;
  meetingReviewing: string;
  meetingDone: (when: string) => string;
  meetingJoin: string;
  meetingConfirmed: string;
  auditionFeeTitle: string;
  auditionFeePurpose: string;
  auditionFeeDeduct: string;
  auditionFeePay: string;
  auditionConfirmed: string;
  auditionConfirmedThanks: string;
  auditionDeductRemind: string;
  auditionScheduledNote: string;
  auditionWhen: string;
  auditionWhere: string;
  programPayTitle: string;
  programPayBody: string;
  programPayDeduct: string;
  programPay: string;
  levelPass: string;
  levelTraining: string;
  trainingPartner: string;
  trainingPeriod: string;
  evaluationNext: string;
  docsNow: string;
  docsSubmitted: string;
  done: string;
  villageTitleHousing: string;
  villageTitle: string;
  villageBody: string;
  villagePrice: string;
  villageCta: string;
  memo: string;
  villageReserved: string;
  villageReservedBody: string;
  villageSeePage: string;
};

const T: Record<Lang, Copy> = {
  en: {
    title: "Your journey",
    steps: {
      apply: "Application received",
      info: "Details & meeting times",
      meeting: "Online meeting",
      audition: "Audition seat",
      levelTest: "Audition · level test",
      visaDocs: "Visa documents & application",
    },
    infoNow: "Please fill in the questionnaire below.",
    meetingReviewing: "We are reviewing your time options. You will see the confirmed time here and by email.",
    meetingDone: (when) => `Held on ${when}`,
    meetingJoin: "Join the meeting",
    meetingConfirmed: "Your meeting is confirmed.",
    auditionFeeTitle: "Audition attendance fee",
    auditionFeePurpose: "This fee confirms your seat and prevents no-shows.",
    auditionFeeDeduct: "If you continue with the program, the full amount is deducted from the program payment.",
    auditionFeePay: "Pay and confirm my seat",
    auditionConfirmed: "Your seat is confirmed",
    auditionConfirmedThanks: "Thank you — see you at the audition.",
    auditionDeductRemind: "Your payment will be fully deducted from the program payment if you continue.",
    auditionScheduledNote: "Details may be updated — check this page before the day.",
    auditionWhen: "Date & time",
    auditionWhere: "Venue",
    programPayTitle: "Program payment",
    programPayBody: "Please pay the amount we shared with you to start your program.",
    programPayDeduct: "Your audition fee (₩100,000) is deducted from this amount.",
    programPay: "Go to payment",
    levelPass: "Passed — ready for visa preparation",
    levelTraining: "Training first, then a monthly review",
    trainingPartner: "Training partner",
    trainingPeriod: "Period",
    evaluationNext: "Next review",
    docsNow: "We are guiding you through the required documents.",
    docsSubmitted: "Your application is under review by Korea Immigration.",
    done: "Complete",
    villageTitleHousing: "You said you need housing.",
    villageTitle: "Need a place to live in Seoul?",
    villageBody: "deetz Village by GRIGO Entertainment is a dancer house we are preparing — no key money deposit.",
    villagePrice: "₩500,000–600,000 / month · deposit ₩0 · pre-registration open",
    villageCta: "See details & join the waitlist",
    memo: "Note from deetz",
    villageReserved: "deetz Village is reserved",
    villageReservedBody: "We will contact you first with photos, the exact address, and move-in dates.",
    villageSeePage: "See the Village page",
  },
  ja: {
    title: "あなたの進行状況",
    steps: {
      apply: "申込受付",
      info: "追加情報・ミーティング日程",
      meeting: "オンラインミーティング",
      audition: "オーディション参加確定",
      levelTest: "オーディション・レベルテスト",
      visaDocs: "ビザ書類・申請",
    },
    infoNow: "下の質問フォームにご記入ください。",
    meetingReviewing: "ご提出いただいた候補日程を確認しています。確定次第、こことメールでお知らせします。",
    meetingDone: (when) => `${when} 実施済み`,
    meetingJoin: "ミーティングに参加",
    meetingConfirmed: "ミーティングが確定しました。",
    auditionFeeTitle: "オーディション参加確定費",
    auditionFeePurpose: "参加確定と無断欠席防止のための費用です。",
    auditionFeeDeduct: "プログラムを進める場合、本決済の金額から全額差し引かれます。",
    auditionFeePay: "支払って参加を確定する",
    auditionConfirmed: "参加が確定しました",
    auditionConfirmedThanks: "お支払いありがとうございます。当日お会いしましょう。",
    auditionDeductRemind: "お支払い分は、プログラム進行時に本決済の金額から全額差し引かれます。",
    auditionScheduledNote: "詳細は更新される場合があります。当日前にこのページをご確認ください。",
    auditionWhen: "日時",
    auditionWhere: "会場",
    programPayTitle: "プログラム決済",
    programPayBody: "ご案内した金額のお支払いでプログラムが始まります。",
    programPayDeduct: "オーディション参加費（₩100,000）はこの金額から差し引かれています。",
    programPay: "決済ページへ",
    levelPass: "合格 — ビザ準備へ進めます",
    levelTraining: "まずトレーニング、その後月末評価",
    trainingPartner: "提携トレーニング先",
    trainingPeriod: "期間",
    evaluationNext: "次回評価",
    docsNow: "必要書類をご案内しています。",
    docsSubmitted: "韓国出入国当局で審査中です。",
    done: "完了",
    villageTitleHousing: "住まいが必要とのことでしたね。",
    villageTitle: "ソウルでの住まいをお探しですか？",
    villageBody: "保証金なしで始められるダンサーハウス、deetz Village by GRIGO Entertainment を準備しています。",
    villagePrice: "月50万〜60万ウォン · 保証金0円 · 事前登録受付中",
    villageCta: "詳しく見て関心登録する",
    memo: "deetzからのメモ",
    villageReserved: "deetz Village を予約済みです",
    villageReservedBody: "写真・正確な住所・入居可能日を最初にご連絡します。",
    villageSeePage: "Villageのページを見る",
  },
  ko: {
    title: "나의 진행 상황",
    steps: {
      apply: "지원서 접수",
      info: "추가 정보·미팅 일정",
      meeting: "온라인 미팅",
      audition: "오디션 참석 확정",
      levelTest: "오디션·레벨테스트",
      visaDocs: "비자 서류·신청",
    },
    infoNow: "아래 질문지를 작성해 주세요.",
    meetingReviewing: "제출하신 후보 일정을 확인하고 있어요. 확정되면 이곳과 이메일로 안내드립니다.",
    meetingDone: (when) => `${when} 진행 완료`,
    meetingJoin: "미팅 참여하기",
    meetingConfirmed: "미팅이 확정됐어요.",
    auditionFeeTitle: "오디션 참석 확정비",
    auditionFeePurpose: "참석 확정과 노쇼 방지를 위한 비용입니다.",
    auditionFeeDeduct: "프로그램을 진행하시면 본 결제 금액에서 전액 차감됩니다.",
    auditionFeePay: "결제하고 참석 확정하기",
    auditionConfirmed: "참석이 확정됐어요",
    auditionConfirmedThanks: "결제해 주셔서 감사합니다. 오디션에서 뵙겠습니다.",
    auditionDeductRemind: "결제하신 금액은 프로그램 진행 시 본 결제 금액에서 전액 차감됩니다.",
    auditionScheduledNote: "세부 내용이 바뀔 수 있으니 당일 전에 이 페이지를 확인해 주세요.",
    auditionWhen: "일시",
    auditionWhere: "장소",
    programPayTitle: "프로그램 결제",
    programPayBody: "안내드린 금액을 결제하시면 프로그램이 시작됩니다.",
    programPayDeduct: "오디션 참가비 ₩100,000은 이 금액에서 차감되어 있습니다.",
    programPay: "결제 페이지로 이동",
    levelPass: "통과 — 비자 준비를 진행할 수 있어요",
    levelTraining: "트레이닝을 먼저 진행하고 월말평가로 확인해요",
    trainingPartner: "연계 트레이닝 기관",
    trainingPeriod: "기간",
    evaluationNext: "다음 평가",
    docsNow: "필요한 서류를 안내드리고 있어요.",
    docsSubmitted: "한국 출입국 당국에서 심사 중이에요.",
    done: "완료",
    villageTitleHousing: "숙소가 필요하다고 하셨죠.",
    villageTitle: "서울에서 지낼 곳을 찾고 계신가요?",
    villageBody: "보증금 없이 시작하는 댄서 하우스, deetz Village by GRIGO Entertainment 를 준비하고 있습니다.",
    villagePrice: "월 50만~60만원 · 보증금 0원 · 사전 등록 진행 중",
    villageCta: "자세히 보고 관심 등록하기",
    memo: "deetz 메모",
    villageReserved: "deetz Village 예약이 완료됐어요",
    villageReservedBody: "사진, 정확한 주소, 입주 가능일을 가장 먼저 연락드립니다.",
    villageSeePage: "Village 페이지 보기",
  },
};

const LOCALE: Record<Lang, string> = { en: "en-US", ja: "ja-JP", ko: "ko-KR" };

function fmtDateTime(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const text = new Intl.DateTimeFormat(LOCALE[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
  // 해외 지원자가 자기 시간대로 오해하지 않게 KST를 명시한다.
  return lang === "ko" ? text : `${text} (KST)`;
}

function fmtDate(value: string, lang: Lang): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

const POST_AUDITION_STAGES = new Set([
  "training",
  "monthly_evaluation",
  "visa_documents",
  "visa_submitted",
  "complete",
]);

export function VisaJourneyTimeline({
  data,
  lang,
  nextActionNote,
  caseToken,
}: {
  data: JourneyData;
  lang: Lang;
  /** 관리자가 next_action 에 직접 적은 안내 (일반 문구는 걸러진 상태로 전달됨) */
  nextActionNote: string | null;
  caseToken: string;
}) {
  const t = T[lang];
  // "미팅이 지났는가" 판정 기준 시각. 렌더 순수성을 위해 마운트 시 1회만 고정한다.
  const [now] = useState(() => Date.now());

  const infoDone = Boolean(data.followUpSubmittedAt);
  const meetingUpcoming = data.meetingAt ? new Date(data.meetingAt).getTime() > now : false;
  const meetingHeld = data.meetingAt ? new Date(data.meetingAt).getTime() <= now : false;

  const isAuditionFee = data.paymentProductSlug !== "training-and-placement";
  const auditionPaid = data.paymentStatus === "paid" && isAuditionFee;
  const auditionPayable = data.paymentStatus === "link_sent" && isAuditionFee && Boolean(data.paymentUrl);
  const programPayable =
    data.paymentStatus === "link_sent" && data.paymentProductSlug === "training-and-placement" && Boolean(data.paymentUrl);

  const auditionScheduled = Boolean(data.auditionAt || data.auditionLocation) || data.auditionStatus === "scheduled";
  const auditionDone = data.auditionStatus === "completed" || data.auditionResult === "pass" || data.auditionResult === "training_required";
  const pastAudition = POST_AUDITION_STAGES.has(data.caseStage) || data.auditionResult === "pass" || data.auditionResult === "training_required";

  // ── 단계 상태 계산 ────────────────────────────────────────────────────────
  const meetingState: StepState = meetingHeld || pastAudition || auditionScheduled || auditionPayable || auditionPaid
    ? "done"
    : meetingUpcoming
      ? "now"
      : infoDone
        ? "now"
        : "todo";

  const auditionSeatState: StepState = auditionPaid || auditionDone || pastAudition
    ? "done"
    : auditionPayable || auditionScheduled
      ? "now"
      : "todo";

  const levelState: StepState = data.auditionResult === "pass"
    ? "done"
    : data.auditionResult === "training_required" || data.caseStage === "training" || data.caseStage === "monthly_evaluation"
      ? "now"
      : auditionSeatState === "done"
        ? "now"
        : "todo";

  const docsState: StepState = data.caseStage === "complete"
    ? "done"
    : data.caseStage === "visa_documents" || data.caseStage === "visa_submitted"
      ? "now"
      : "todo";

  const showVillage = auditionPaid || pastAudition;

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <section className="mt-6 rounded-2xl border border-hairline-2 bg-card p-5 md:p-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3">{t.title}</h2>

      <ol className="mt-4">
        {/* 1. 접수 */}
        <Step state="done" label={t.steps.apply} last={false} />

        {/* 2. 추가 정보·일정 */}
        <Step state={infoDone ? "done" : "now"} label={t.steps.info} last={false}>
          {!infoDone ? <p className="text-[13px] text-ink-2">{t.infoNow}</p> : null}
        </Step>

        {/* 3. 온라인 미팅 */}
        <Step state={meetingState} label={t.steps.meeting} last={false}>
          {meetingUpcoming && data.meetingAt ? (
            <div className="mt-1 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-[13px] font-semibold text-foreground">{t.meetingConfirmed}</p>
              <p className="mt-1 text-lg font-bold tracking-tight text-foreground">
                {fmtDateTime(data.meetingAt, lang)}
              </p>
              {data.meetingUrl ? (
                <a
                  href={data.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  <Video className="size-4" />
                  {t.meetingJoin}
                </a>
              ) : null}
            </div>
          ) : meetingHeld && data.meetingAt ? (
            <p className="text-[12.5px] text-ink-3">{t.meetingDone(fmtDateTime(data.meetingAt, lang))}</p>
          ) : meetingState === "now" ? (
            <p className="text-[13px] text-ink-2">{t.meetingReviewing}</p>
          ) : null}
        </Step>

        {/* 4. 오디션 참석 확정 */}
        <Step state={auditionSeatState} label={t.steps.audition} last={false}>
          {/* 일시·장소는 입력되는 대로 공개한다 — 결제로 잠그지 않는다(대표 결정). */}
          {(auditionScheduled || auditionPaid) && (data.auditionAt || data.auditionLocation) ? (
            <dl className="mt-1 grid gap-1 text-[13px]">
              {data.auditionAt ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-3">{t.auditionWhen}</dt>
                  <dd className="font-semibold text-foreground">{fmtDateTime(data.auditionAt, lang)}</dd>
                </div>
              ) : null}
              {data.auditionLocation ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-3">{t.auditionWhere}</dt>
                  <dd className="font-semibold text-foreground">{data.auditionLocation}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {/* 오디션 일정이 잡혔으면 먼저 참석 여부를 묻는다 — 결제보다 앞선다. */}
          {auditionScheduled && !auditionPaid ? (
            <VisaAuditionRsvp
              lang={lang}
              token={caseToken}
              initialRsvp={data.auditionRsvp}
              paymentUrl={data.paymentStatus === "link_sent" ? data.paymentUrl : null}
              feeLabel={lang === "en" ? "₩100,000" : lang === "ja" ? "10万ウォン" : "10만원"}
              paid={auditionPaid}
            />
          ) : null}

          {auditionPayable && data.auditionRsvp !== "unavailable" ? (
            <VisaQuoteBuilder
              lang={lang}
              caseToken={caseToken}
              auditionPayable
              auditionPaid={false}
              auditionPaymentUrl={data.paymentUrl}
              villageDepositStatus={data.villageDepositStatus}
            />
          ) : auditionPaid ? (
            <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-400">
                <Check className="size-4" />
                {t.auditionConfirmed}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.auditionConfirmedThanks}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{t.auditionDeductRemind}</p>
            </div>
          ) : auditionScheduled ? (
            <p className="mt-1 text-[12.5px] text-ink-3">{t.auditionScheduledNote}</p>
          ) : null}
        </Step>

        {/* 5. 오디션·레벨테스트 결과 */}
        <Step state={levelState} label={t.steps.levelTest} last={false}>
          {data.auditionResult === "pass" ? (
            <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">{t.levelPass}</p>
          ) : data.auditionResult === "training_required" || data.caseStage === "training" || data.caseStage === "monthly_evaluation" ? (
            <div className="mt-1 grid gap-1 text-[13px]">
              <p className="text-ink-2">{t.levelTraining}</p>
              {data.trainingPartner ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-3">{t.trainingPartner}</dt>
                  <dd className="font-semibold text-foreground">{data.trainingPartner}</dd>
                </div>
              ) : null}
              {data.trainingStartDate || data.trainingEndDate ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-3">{t.trainingPeriod}</dt>
                  <dd className="font-semibold text-foreground">
                    {[data.trainingStartDate, data.trainingEndDate]
                      .map((v) => (v ? fmtDate(v, lang) : ""))
                      .filter(Boolean)
                      .join(" — ")}
                  </dd>
                </div>
              ) : null}
              {data.monthlyEvaluationAt ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-ink-3">{t.evaluationNext}</dt>
                  <dd className="font-semibold text-foreground">{fmtDateTime(data.monthlyEvaluationAt, lang)}</dd>
                </div>
              ) : null}
            </div>
          ) : null}
        </Step>

        {/* 6. 비자 서류·신청 */}
        <Step state={docsState} label={t.steps.visaDocs} last>
          {data.caseStage === "visa_documents" ? (
            <p className="text-[13px] text-ink-2">{t.docsNow}</p>
          ) : data.caseStage === "visa_submitted" ? (
            <p className="text-[13px] text-ink-2">{t.docsSubmitted}</p>
          ) : data.caseStage === "complete" ? (
            <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">{t.done}</p>
          ) : null}
          {programPayable ? (
            <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-[13px] font-semibold text-foreground">{t.programPayTitle}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t.programPayBody}</p>
              <p className="text-[12px] leading-relaxed text-ink-3">{t.programPayDeduct}</p>
              <a
                href={data.paymentUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <CircleDollarSign className="size-4" />
                {t.programPay}
              </a>
            </div>
          ) : null}
        </Step>
      </ol>

      {/* 관리자가 직접 적은 안내가 있으면 마지막에 한 줄로 보여준다. */}
      {nextActionNote ? (
        <div className="mt-3 rounded-lg bg-secondary/60 px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t.memo}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{nextActionNote}</p>
        </div>
      ) : null}

      {/* Village — 오디션 확정 이후에만, 결제 흐름을 방해하지 않게 타임라인 밖 하단 카드로. */}
      {showVillage && data.villageDepositStatus === "paid" ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <Home className="size-5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400">
              <Check className="size-4" />
              {t.villageReserved}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{t.villageReservedBody}</p>
            <Link
              href={`/village?lang=${lang}`}
              className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
            >
              {t.villageSeePage}
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </div>
      ) : showVillage ? (
        <Link
          href={`/village?lang=${lang}`}
          className="mt-4 flex items-start gap-3 rounded-xl border border-hairline-2 bg-secondary/40 p-4 transition-colors hover:border-foreground/30"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Home className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {data.wantsHousing ? t.villageTitleHousing : t.villageTitle}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{t.villageBody}</p>
            <p className="mt-0.5 text-[12px] text-ink-3">{t.villagePrice}</p>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
              {t.villageCta}
              <ExternalLink className="size-3.5" />
            </span>
          </div>
        </Link>
      ) : null}
    </section>
  );
}

function Step({
  state,
  label,
  last,
  children,
}: {
  state: StepState;
  label: string;
  last: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className={cn("relative pl-8", !last && "pb-5")}>
      {!last ? <span aria-hidden className="absolute bottom-0 left-[9px] top-6 w-px bg-hairline-2" /> : null}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-0.5 flex size-[19px] items-center justify-center rounded-full text-[10px] font-bold",
          state === "done" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
          state === "now" && "bg-primary text-primary-foreground",
          state === "todo" && "bg-secondary text-ink-4",
        )}
      >
        {state === "done" ? <Check className="size-3" /> : state === "now" ? "●" : "○"}
      </span>
      <p
        className={cn(
          "text-sm leading-snug",
          state === "done" && "text-ink-3",
          state === "now" && "font-bold text-foreground",
          state === "todo" && "text-ink-4",
        )}
      >
        {label}
      </p>
      {children ? <div className="mt-1">{children}</div> : null}
    </li>
  );
}
