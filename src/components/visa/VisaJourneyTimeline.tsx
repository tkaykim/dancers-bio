"use client";

import { useState } from "react";
import { Check, CircleDollarSign, ExternalLink, FileCheck2, Home, Video } from "lucide-react";
import Link from "next/link";
import { VisaAuditionRsvp } from "@/components/visa/VisaAuditionRsvp";
import { VisaQuoteBuilder } from "@/components/visa/VisaQuoteBuilder";
import { deriveVisaProgress, VISA_PROGRESS_LABELS } from "@/lib/visa/progress";
import { cn } from "@/lib/utils";

export type VisaJourneyLang = "en" | "ja" | "ko";

export type JourneyData = {
  followUpSubmittedAt: string | null;
  caseStage: string;
  meetingAt: string | null;
  meetingUrl: string | null;
  auditionAt: string | null;
  auditionLocation: string | null;
  auditionStatus: string;
  auditionResult: string;
  auditionEndsAt: string | null;
  auditionRsvp: string | null;
  trainingRequired: boolean | null;
  trainingPartner: string | null;
  trainingStartDate: string | null;
  trainingEndDate: string | null;
  monthlyEvaluationAt: string | null;
  monthlyEvaluationResult: string;
  contractStatus: string;
  basicDocumentsStatus: string;
  detailedDocumentsStatus: string;
  visaIssuedAt: string | null;
  paymentStatus: string;
  paymentProductSlug: string | null;
  paymentUrl: string | null;
  paymentAmountKrw: number | null;
  paidAt: string | null;
  wantsHousing: boolean;
  villageDepositStatus: string;
  villageDepositPaidAt: string | null;
};

type StepState = "done" | "now" | "todo";

type Copy = {
  title: string;
  stepOf: (step: number) => string;
  progressNote: string;
  preparation: string;
  application: string;
  questionnaire: string;
  meeting: string;
  waiting: string;
  meetingReviewing: string;
  meetingDone: (when: string) => string;
  meetingConfirmed: string;
  meetingJoin: string;
  auditionWhen: string;
  auditionWhere: string;
  auditionScheduledNote: string;
  auditionConfirmed: string;
  auditionConfirmedThanks: string;
  auditionDeductRemind: string;
  levelPending: string;
  levelPass: string;
  levelTraining: string;
  trainingPartner: string;
  trainingPeriod: string;
  evaluationNext: string;
  contractIntro: string;
  contractLabels: Record<string, string>;
  programUnpaid: string;
  programPaid: string;
  programPayTitle: string;
  programPayBody: string;
  programPayDeduct: string;
  programPay: string;
  basicLabels: Record<string, string>;
  basicBody: string;
  detailedLabels: Record<string, string>;
  detailedBody: string;
  immigrationReview: string;
  issuedPending: string;
  issuedDone: (when: string | null) => string;
  memo: string;
  villageTitleHousing: string;
  villageTitle: string;
  villageBody: string;
  villagePrice: string;
  villageCta: string;
  villageReserved: string;
  villageReservedBody: string;
  villageSeePage: string;
};

const T: Record<VisaJourneyLang, Copy> = {
  en: {
    title: "Visa program progress",
    stepOf: (step) => `Step ${step} of 5`,
    progressNote: "This bar shows program milestones, not an immigration processing deadline.",
    preparation: "Before the program",
    application: "Application received",
    questionnaire: "Details submitted",
    meeting: "Online meeting",
    waiting: "Waiting",
    meetingReviewing: "We are reviewing your available meeting times.",
    meetingDone: (when) => `Held on ${when}`,
    meetingConfirmed: "Your meeting is confirmed.",
    meetingJoin: "Join the meeting",
    auditionWhen: "Date & time",
    auditionWhere: "Venue",
    auditionScheduledNote: "Details may be updated, so please check this page before the day.",
    auditionConfirmed: "Your audition seat is confirmed.",
    auditionConfirmedThanks: "Thank you, and we will see you at the audition.",
    auditionDeductRemind: "The 100,000 KRW attendance fee is deducted from your program payment.",
    levelPending: "Your audition and level-test result will appear here.",
    levelPass: "Passed and ready for the contract stage.",
    levelTraining: "Training is required before the next monthly review.",
    trainingPartner: "Training partner",
    trainingPeriod: "Period",
    evaluationNext: "Next review",
    contractIntro: "We prepare the exclusive agreement and complete program registration after signing and payment.",
    contractLabels: {
      not_started: "Contract preparation has not started.",
      preparing: "deetz is preparing the contract.",
      sent: "The contract was sent for review and signature.",
      signed: "The contract has been signed.",
    },
    programUnpaid: "Program payment has not been confirmed.",
    programPaid: "Program registration payment is complete.",
    programPayTitle: "Complete your program payment",
    programPayBody: "Pay the amount shared with you to complete registration.",
    programPayDeduct: "The 100,000 KRW audition fee is already deducted.",
    programPay: "Go to payment",
    basicLabels: {
      not_started: "Document collection has not started.",
      requested: "The basic document checklist was sent.",
      collecting: "We are collecting your basic documents.",
      reviewing: "deetz is reviewing the basic documents.",
      complete: "The basic document review is complete.",
    },
    basicBody: "This stage covers the initial identity, passport, and career evidence required for your case.",
    detailedLabels: {
      not_started: "Detailed document work has not started.",
      requested: "The detailed document checklist was sent.",
      collecting: "We are collecting the detailed documents.",
      reviewing: "The detailed documents are under review.",
      submitted: "The visa application was submitted to Korea Immigration.",
    },
    detailedBody: "Requirements can differ by case, so deetz will send only the documents assigned to you.",
    immigrationReview: "Korea Immigration is reviewing the application, and the final decision is made by the authorities.",
    issuedPending: "This step is completed only after the visa issuance is officially confirmed.",
    issuedDone: (when) => when ? `Visa issuance confirmed on ${when}.` : "Visa issuance is complete.",
    memo: "Note from deetz",
    villageTitleHousing: "You said you need housing.",
    villageTitle: "Need a place to live in Seoul?",
    villageBody: "deetz Village by GRIGO Entertainment is a dancer house we are preparing with no key-money deposit.",
    villagePrice: "₩500,000–600,000 per month · deposit ₩0 · pre-registration open",
    villageCta: "See details and join the waitlist",
    villageReserved: "deetz Village is reserved",
    villageReservedBody: "We will contact you first with photos, the exact address, and move-in dates.",
    villageSeePage: "See the Village page",
  },
  ja: {
    title: "ビザプログラム進行状況",
    stepOf: (step) => `5段階中 ${step}段階目`,
    progressNote: "このバーはプログラムの進行項目を示すもので、出入国審査の期限を示すものではありません。",
    preparation: "プログラム開始前",
    application: "申込受付",
    questionnaire: "追加情報提出",
    meeting: "オンラインミーティング",
    waiting: "待機中",
    meetingReviewing: "ご提出いただいたミーティング候補日を確認しています。",
    meetingDone: (when) => `${when} 実施済み`,
    meetingConfirmed: "ミーティングが確定しました。",
    meetingJoin: "ミーティングに参加",
    auditionWhen: "日時",
    auditionWhere: "会場",
    auditionScheduledNote: "詳細が変更される場合がありますので、当日前にこのページをご確認ください。",
    auditionConfirmed: "オーディション参加が確定しました。",
    auditionConfirmedThanks: "ありがとうございます。オーディション当日にお会いしましょう。",
    auditionDeductRemind: "参加費10万ウォンはプログラム決済金額から差し引かれます。",
    levelPending: "オーディションとレベルテストの結果がここに表示されます。",
    levelPass: "合格し、契約段階へ進む準備が整いました。",
    levelTraining: "次回の月末評価までトレーニングが必要です。",
    trainingPartner: "提携トレーニング先",
    trainingPeriod: "期間",
    evaluationNext: "次回評価",
    contractIntro: "専属契約書を準備し、署名と決済の完了後にプログラム登録が完了します。",
    contractLabels: {
      not_started: "契約書の準備前です。",
      preparing: "deetzが契約書を準備しています。",
      sent: "契約書を確認と署名のためにお送りしました。",
      signed: "契約書への署名が完了しました。",
    },
    programUnpaid: "プログラム決済はまだ確認されていません。",
    programPaid: "プログラム登録決済が完了しました。",
    programPayTitle: "プログラム決済を完了してください",
    programPayBody: "ご案内した金額を決済すると登録が完了します。",
    programPayDeduct: "オーディション参加費10万ウォンはすでに差し引かれています。",
    programPay: "決済ページへ",
    basicLabels: {
      not_started: "基本書類の収集前です。",
      requested: "基本書類チェックリストをお送りしました。",
      collecting: "基本書類を収集中です。",
      reviewing: "deetzが基本書類を確認しています。",
      complete: "基本書類の確認が完了しました。",
    },
    basicBody: "この段階では、本人確認、パスポート、経歴証明などの基本書類を準備します。",
    detailedLabels: {
      not_started: "詳細書類の準備前です。",
      requested: "詳細書類チェックリストをお送りしました。",
      collecting: "詳細書類を収集中です。",
      reviewing: "詳細書類を確認しています。",
      submitted: "韓国出入国当局へビザ申請を提出しました。",
    },
    detailedBody: "必要書類はケースごとに異なるため、deetzが個別に割り当てた書類のみをご案内します。",
    immigrationReview: "韓国出入国当局が審査中であり、最終判断は当局が行います。",
    issuedPending: "正式なビザ発給確認後にのみ、この段階が完了します。",
    issuedDone: (when) => when ? `${when}にビザ発給を確認しました。` : "ビザ発給が完了しました。",
    memo: "deetzからのメモ",
    villageTitleHousing: "住まいが必要とのことでしたね。",
    villageTitle: "ソウルでの住まいをお探しですか？",
    villageBody: "保証金なしで始められるダンサーハウス、deetz Village by GRIGO Entertainmentを準備しています。",
    villagePrice: "月50万〜60万ウォン · 保証金0円 · 事前登録受付中",
    villageCta: "詳しく見て関心登録する",
    villageReserved: "deetz Villageを予約済みです",
    villageReservedBody: "写真、正確な住所、入居可能日を優先してご連絡します。",
    villageSeePage: "Villageのページを見る",
  },
  ko: {
    title: "비자 프로그램 진행 상황",
    stepOf: (step) => `5단계 중 ${step}단계`,
    progressNote: "이 진행률은 프로그램 업무 단계이며 출입국 심사 기한을 의미하지 않습니다.",
    preparation: "프로그램 시작 전",
    application: "지원서 접수",
    questionnaire: "추가 정보 제출",
    meeting: "온라인 미팅",
    waiting: "대기 중",
    meetingReviewing: "제출한 미팅 후보 일정을 확인하고 있습니다.",
    meetingDone: (when) => `${when} 진행 완료`,
    meetingConfirmed: "미팅 일정이 확정되었습니다.",
    meetingJoin: "미팅 참여하기",
    auditionWhen: "일시",
    auditionWhere: "장소",
    auditionScheduledNote: "세부 내용이 바뀔 수 있으니 당일 전에 이 페이지를 확인해 주세요.",
    auditionConfirmed: "오디션 참석이 확정되었습니다.",
    auditionConfirmedThanks: "감사합니다. 오디션 당일에 뵙겠습니다.",
    auditionDeductRemind: "참석비 10만 원은 프로그램 등록 결제 금액에서 차감됩니다.",
    levelPending: "오디션과 레벨테스트 결과가 이곳에 표시됩니다.",
    levelPass: "평가를 통과해 계약 단계로 진행합니다.",
    levelTraining: "다음 월말평가 전까지 트레이닝이 필요합니다.",
    trainingPartner: "연계 트레이닝 기관",
    trainingPeriod: "기간",
    evaluationNext: "다음 평가",
    contractIntro: "전속계약서를 작성하고 서명과 결제가 끝나면 프로그램 등록이 완료됩니다.",
    contractLabels: {
      not_started: "계약서 작성 전입니다.",
      preparing: "deetz에서 계약서를 작성하고 있습니다.",
      sent: "검토와 서명을 위해 계약서를 전달했습니다.",
      signed: "계약서 서명이 완료되었습니다.",
    },
    programUnpaid: "프로그램 등록 결제가 아직 확인되지 않았습니다.",
    programPaid: "프로그램 등록 결제가 완료되었습니다.",
    programPayTitle: "프로그램 등록 결제를 완료해 주세요",
    programPayBody: "안내한 금액을 결제하면 프로그램 등록이 완료됩니다.",
    programPayDeduct: "오디션 참석비 10만 원은 이미 차감되어 있습니다.",
    programPay: "결제 페이지로 이동",
    basicLabels: {
      not_started: "기본 서류 수집 전입니다.",
      requested: "기본 서류 목록을 전달했습니다.",
      collecting: "기본 서류를 수집하고 있습니다.",
      reviewing: "deetz에서 기본 서류를 검토하고 있습니다.",
      complete: "기본 서류 검토가 끝났습니다.",
    },
    basicBody: "이 단계에서는 신원, 여권, 경력 증빙 등 케이스의 기본 서류를 준비합니다.",
    detailedLabels: {
      not_started: "세부 서류 작업 전입니다.",
      requested: "세부 서류 목록을 전달했습니다.",
      collecting: "세부 서류를 수집하고 있습니다.",
      reviewing: "세부 서류를 검토하고 있습니다.",
      submitted: "한국 출입국 당국에 비자 신청을 접수했습니다.",
    },
    detailedBody: "필요한 서류는 케이스마다 달라 deetz가 배정한 항목만 개별 안내합니다.",
    immigrationReview: "현재 한국 출입국 당국이 심사 중이며 최종 발급 결정은 당국이 내립니다.",
    issuedPending: "공식 발급이 확인된 뒤에만 이 단계가 완료됩니다.",
    issuedDone: (when) => when ? `${when} 비자 발급을 확인했습니다.` : "비자 발급이 완료되었습니다.",
    memo: "deetz 메모",
    villageTitleHousing: "숙소가 필요하다고 알려주셨습니다.",
    villageTitle: "서울에서 지낼 곳을 찾고 계신가요?",
    villageBody: "보증금 없이 시작하는 댄서 하우스, deetz Village by GRIGO Entertainment를 준비하고 있습니다.",
    villagePrice: "월 50만~60만 원 · 보증금 0원 · 사전 등록 진행 중",
    villageCta: "자세히 보고 관심 등록하기",
    villageReserved: "deetz Village 예약이 완료되었습니다",
    villageReservedBody: "사진, 정확한 주소, 입주 가능일을 우선 안내합니다.",
    villageSeePage: "Village 페이지 보기",
  },
};

const LOCALE: Record<VisaJourneyLang, string> = { en: "en-US", ja: "ja-JP", ko: "ko-KR" };

function fmtDateTime(value: string, lang: VisaJourneyLang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const formatted = new Intl.DateTimeFormat(LOCALE[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
  return lang === "ko" ? formatted : `${formatted} (KST)`;
}

function fmtDate(value: string, lang: VisaJourneyLang): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

function stateFor(step: number, activeStep: number, issued: boolean): StepState {
  if (step < activeStep) return "done";
  if (step === activeStep) return step === 5 && issued ? "done" : "now";
  return "todo";
}

export function VisaJourneyTimeline({ data, lang, nextActionNote, caseToken }: {
  data: JourneyData;
  lang: VisaJourneyLang;
  nextActionNote: string | null;
  caseToken: string;
}) {
  const t = T[lang];
  const labels = VISA_PROGRESS_LABELS[lang];
  const [now] = useState(() => Date.now());
  const progress = deriveVisaProgress(data);
  const meetingUpcoming = data.meetingAt ? new Date(data.meetingAt).getTime() > now : false;
  const meetingHeld = data.meetingAt ? new Date(data.meetingAt).getTime() <= now : false;
  const isAuditionFee = data.paymentProductSlug !== "training-and-placement";
  const auditionPaid = data.paymentStatus === "paid" && isAuditionFee;
  const auditionPayable = data.paymentStatus === "link_sent" && isAuditionFee && Boolean(data.paymentUrl);
  const programPayable = data.paymentStatus === "link_sent" && data.paymentProductSlug === "training-and-placement" && Boolean(data.paymentUrl);
  const auditionScheduled = Boolean(data.auditionAt || data.auditionLocation) || data.auditionStatus === "scheduled";
  const auditionDone = data.auditionStatus === "completed" || data.auditionResult === "pass" || data.auditionResult === "training_required";
  const showVillage = auditionPaid || auditionDone || progress.activeStep > 1;
  const issued = Boolean(data.visaIssuedAt) || data.caseStage === "complete";
  const basicDocumentsStatus =
    data.basicDocumentsStatus === "not_started" && ["visa_documents", "visa_documents_basic"].includes(data.caseStage)
      ? "collecting"
      : data.basicDocumentsStatus;
  const detailedDocumentsStatus =
    data.detailedDocumentsStatus === "not_started" && data.caseStage === "visa_submitted"
      ? "submitted"
      : data.detailedDocumentsStatus === "not_started" && data.caseStage === "visa_documents_detailed"
        ? "reviewing"
        : data.detailedDocumentsStatus;

  return (
    <section className="mt-6 rounded-2xl border border-hairline-2 bg-card p-5 md:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-3">{t.title}</h2>
          <p className="mt-1 text-xl font-bold tracking-tight">{t.stepOf(progress.activeStep)}</p>
        </div>
        <span className="text-sm font-bold text-primary">{progress.percent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-4">{t.progressNote}</p>

      <div className="mt-5 rounded-xl bg-secondary/55 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-4">{t.preparation}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <PreparationItem done label={t.application} detail="✓" />
          <PreparationItem done={Boolean(data.followUpSubmittedAt)} label={t.questionnaire} detail={data.followUpSubmittedAt ? "✓" : t.waiting} />
          <PreparationItem done={meetingHeld || progress.activeStep > 1 || auditionScheduled} label={t.meeting} detail={meetingHeld && data.meetingAt ? t.meetingDone(fmtDateTime(data.meetingAt, lang)) : t.waiting} />
        </div>
        {meetingUpcoming && data.meetingAt ? (
          <div className="mt-3 rounded-lg border border-primary/25 bg-background p-3">
            <p className="text-xs font-semibold">{t.meetingConfirmed}</p>
            <p className="mt-1 text-sm font-bold">{fmtDateTime(data.meetingAt, lang)}</p>
            {data.meetingUrl ? (
              <a href={data.meetingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
                <Video className="size-3.5" />
                {t.meetingJoin}
              </a>
            ) : null}
          </div>
        ) : data.followUpSubmittedAt && !meetingHeld && !auditionScheduled ? (
          <p className="mt-3 text-xs text-ink-3">{t.meetingReviewing}</p>
        ) : null}
      </div>

      <ol className="mt-6">
        <Step state={stateFor(1, progress.activeStep, issued)} label={labels[0]} last={false}>
          {(auditionScheduled || auditionPaid) && (data.auditionAt || data.auditionLocation) ? (
            <dl className="grid gap-1 text-[13px]">
              {data.auditionAt ? <div className="flex gap-2"><dt className="shrink-0 text-ink-3">{t.auditionWhen}</dt><dd className="font-semibold">{fmtDateTime(data.auditionAt, lang)}</dd></div> : null}
              {data.auditionLocation ? <div className="flex gap-2"><dt className="shrink-0 text-ink-3">{t.auditionWhere}</dt><dd className="font-semibold">{data.auditionLocation}</dd></div> : null}
            </dl>
          ) : null}
          {auditionScheduled && !auditionPaid && !auditionDone ? (
            <VisaAuditionRsvp lang={lang} token={caseToken} initialRsvp={data.auditionRsvp} paymentUrl={data.paymentStatus === "link_sent" ? data.paymentUrl : null} feeLabel={lang === "en" ? "₩100,000" : lang === "ja" ? "10万ウォン" : "10만 원"} paid={auditionPaid} />
          ) : null}
          {auditionPayable && !auditionDone && data.auditionRsvp !== "unavailable" ? (
            <VisaQuoteBuilder lang={lang} caseToken={caseToken} auditionPayable auditionPaid={false} auditionPaymentUrl={data.paymentUrl} villageDepositStatus={data.villageDepositStatus} />
          ) : auditionPaid && !auditionDone ? (
            <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-700 dark:text-emerald-400"><Check className="size-4" />{t.auditionConfirmed}</p>
              <p className="mt-1 text-[13px] text-ink-2">{t.auditionConfirmedThanks}</p>
              <p className="mt-1 text-[12px] text-ink-3">{t.auditionDeductRemind}</p>
            </div>
          ) : auditionScheduled && !auditionDone ? <p className="mt-1 text-[12.5px] text-ink-3">{t.auditionScheduledNote}</p> : null}
          {progress.qualified ? (
            <StatusLine tone="success">{t.levelPass}</StatusLine>
          ) : data.auditionResult === "training_required" || data.caseStage === "training" || data.caseStage === "monthly_evaluation" ? (
            <div className="mt-2 rounded-xl bg-secondary/55 p-3 text-[13px]">
              <p className="font-semibold">{t.levelTraining}</p>
              {data.trainingPartner ? <p className="mt-1 text-ink-2">{t.trainingPartner}: {data.trainingPartner}</p> : null}
              {data.trainingStartDate || data.trainingEndDate ? <p className="mt-1 text-ink-2">{t.trainingPeriod}: {[data.trainingStartDate, data.trainingEndDate].map((value) => value ? fmtDate(value, lang) : "").filter(Boolean).join(" — ")}</p> : null}
              {data.monthlyEvaluationAt ? <p className="mt-1 text-ink-2">{t.evaluationNext}: {fmtDateTime(data.monthlyEvaluationAt, lang)}</p> : null}
            </div>
          ) : !auditionDone ? <p className="mt-1 text-[13px] text-ink-3">{t.levelPending}</p> : null}
        </Step>

        <Step state={stateFor(2, progress.activeStep, issued)} label={labels[1]} last={false}>
          <p className="text-[13px] leading-relaxed text-ink-2">{t.contractIntro}</p>
          <StatusLine tone={data.contractStatus === "signed" ? "success" : "neutral"}>{t.contractLabels[data.contractStatus] ?? t.contractLabels.not_started}</StatusLine>
          <StatusLine tone={progress.programPaid ? "success" : "neutral"}>{progress.programPaid ? t.programPaid : t.programUnpaid}</StatusLine>
          {programPayable ? (
            <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="text-[13px] font-semibold">{t.programPayTitle}</p>
              <p className="mt-1 text-[13px] text-ink-2">{t.programPayBody}</p>
              <p className="text-[12px] text-ink-3">{t.programPayDeduct}</p>
              <a href={data.paymentUrl!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"><CircleDollarSign className="size-4" />{t.programPay}</a>
            </div>
          ) : null}
        </Step>

        <Step state={stateFor(3, progress.activeStep, issued)} label={labels[2]} last={false}>
          <p className="text-[13px] leading-relaxed text-ink-2">{t.basicBody}</p>
          <StatusLine tone={basicDocumentsStatus === "complete" ? "success" : "neutral"}>{t.basicLabels[basicDocumentsStatus] ?? t.basicLabels.not_started}</StatusLine>
        </Step>

        <Step state={stateFor(4, progress.activeStep, issued)} label={labels[3]} last={false}>
          <p className="text-[13px] leading-relaxed text-ink-2">{t.detailedBody}</p>
          <StatusLine tone={detailedDocumentsStatus === "submitted" ? "success" : "neutral"}>{t.detailedLabels[detailedDocumentsStatus] ?? t.detailedLabels.not_started}</StatusLine>
          {detailedDocumentsStatus === "submitted" ? <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">{t.immigrationReview}</p> : null}
        </Step>

        <Step state={stateFor(5, progress.activeStep, issued)} label={labels[4]} last>
          {issued ? <StatusLine tone="success">{t.issuedDone(data.visaIssuedAt ? fmtDate(data.visaIssuedAt.slice(0, 10), lang) : null)}</StatusLine> : <p className="text-[13px] text-ink-3">{t.issuedPending}</p>}
        </Step>
      </ol>

      {nextActionNote ? <div className="mt-4 rounded-lg bg-secondary/60 px-3.5 py-2.5"><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">{t.memo}</p><p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{nextActionNote}</p></div> : null}

      {showVillage && data.villageDepositStatus === "paid" ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10"><Home className="size-5 text-emerald-700 dark:text-emerald-400" /></div>
          <div><p className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-400"><Check className="size-4" />{t.villageReserved}</p><p className="mt-0.5 text-[13px] text-ink-2">{t.villageReservedBody}</p><Link href={`/village?lang=${lang}`} className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">{t.villageSeePage}<ExternalLink className="size-3.5" /></Link></div>
        </div>
      ) : showVillage ? (
        <Link href={`/village?lang=${lang}`} className="mt-4 flex items-start gap-3 rounded-xl border border-hairline-2 bg-secondary/40 p-4 hover:border-foreground/30">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Home className="size-5 text-primary" /></div>
          <div><p className="text-sm font-bold">{data.wantsHousing ? t.villageTitleHousing : t.villageTitle}</p><p className="mt-0.5 text-[13px] text-ink-2">{t.villageBody}</p><p className="mt-0.5 text-[12px] text-ink-3">{t.villagePrice}</p><span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">{t.villageCta}<ExternalLink className="size-3.5" /></span></div>
        </Link>
      ) : null}
    </section>
  );
}

function PreparationItem({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  return <div className="rounded-lg bg-background px-3 py-2.5"><p className="flex items-center gap-1.5 text-xs font-semibold"><span className={cn("flex size-4 items-center justify-center rounded-full", done ? "bg-emerald-500/15 text-emerald-700" : "bg-secondary text-ink-4")}>{done ? <Check className="size-3" /> : "·"}</span>{label}</p><p className="mt-1 truncate text-[10px] text-ink-4">{detail}</p></div>;
}

function StatusLine({ children, tone }: { children: React.ReactNode; tone: "success" | "neutral" }) {
  return <p className={cn("mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed", tone === "success" ? "bg-emerald-500/8 text-emerald-700 dark:text-emerald-300" : "bg-secondary/60 text-ink-2")}><FileCheck2 className="mt-0.5 size-3.5 shrink-0" />{children}</p>;
}

function Step({ state, label, last, children }: { state: StepState; label: string; last: boolean; children?: React.ReactNode }) {
  return (
    <li className={cn("relative pl-8", !last && "pb-6")}>
      {!last ? <span aria-hidden className="absolute bottom-0 left-[9px] top-6 w-px bg-hairline-2" /> : null}
      <span aria-hidden className={cn("absolute left-0 top-0.5 flex size-[19px] items-center justify-center rounded-full text-[10px] font-bold", state === "done" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", state === "now" && "bg-primary text-primary-foreground", state === "todo" && "bg-secondary text-ink-4")}>{state === "done" ? <Check className="size-3" /> : state === "now" ? "●" : "○"}</span>
      <p className={cn("text-sm leading-snug", state === "now" && "font-bold", state === "done" && "font-semibold text-foreground", state === "todo" && "text-ink-4")}>{label}</p>
      {children && state !== "todo" ? <div className="mt-2">{children}</div> : null}
    </li>
  );
}
