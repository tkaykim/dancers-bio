"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { submitVisaCaseFollowUpAction } from "@/app/actions/visa-case";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { cn } from "@/lib/utils";
import {
  consultationSlotsFromAnswers,
  formatConsultationAvailability,
  hasThreeUniqueConsultationSlots,
  type ConsultationSlots,
} from "@/lib/visa/consultation-slots";

type Lang = "en" | "ja" | "ko";
type Answers = Record<string, unknown>;

export type VisaCaseInitial = {
  name: string;
  email: string;
  nationality: string | null;
  hasVisa: boolean | null;
  visaLabel: string | null;
  currentlyInKorea: boolean | null;
  skillLevel: number | null;
  danceVideoUrl: string | null;
  preferredLang: string | null;
  followUpAnswers: Answers;
  followUpSubmittedAt: string | null;
  caseStage: string;
  auditionAt: string | null;
  auditionLocation: string | null;
  auditionStatus: string;
  auditionResult: string;
  trainingRequired: boolean | null;
  trainingPartner: string | null;
  trainingStartDate: string | null;
  trainingEndDate: string | null;
  trainingStatus: string;
  monthlyEvaluationAt: string | null;
  monthlyEvaluationResult: string;
  nextAction: string | null;
  basePriceKrw: number;
  quotedPriceKrw: number | null;
};

type Copy = {
  title: string;
  hello: (name: string) => string;
  intro: string;
  stage: string;
  next: string;
  programTitle: string;
  program: { title: string; body: string }[];
  price: string;
  priceDetail: string;
  workNotice: string;
  visaNotice: string;
  existing: string;
  edit: string;
  submitted: string;
  submittedBody: string;
  continue: string;
  back: string;
  submit: string;
  submitting: string;
  updated: string;
  step1: string;
  step2: string;
  step3: string;
  goal: string;
  goalOptions: { value: string; label: string }[];
  passportExpiry: string;
  visaExpiry: string;
  residenceCountry: string;
  immigration: string;
  immigrationOptions: { value: string; label: string }[];
  auditionAvailability: string;
  auditionHelp: string;
  career: string;
  careerHelp: string;
  contract: string;
  contractOptions: { value: string; label: string }[];
  settlement: string;
  settlementOptions: { value: string; label: string }[];
  projectOptIn: string;
  projectHelp: string;
  timezone: string;
  consultation: string;
  consultationHelp: string;
  consultationOption: (index: number) => string;
  processAck: string;
  priceAck: string;
  required: string;
};

const COPY: Record<Lang, Copy> = {
  en: {
    title: "Visa program case",
    hello: (name) => `Hi ${name}, here is your deetz program case.`,
    intro: "We only ask for details that were not included in your first application.",
    stage: "Current stage",
    next: "Next action",
    programTitle: "How the program works",
    program: [
      { title: "Zoom consultation", body: "First, we confirm your visa route and schedule through a Zoom meeting." },
      { title: "Audition lesson", body: "The audition lesson is planned once in August and once in September at a dance studio near Hapjeong or Sinchon." },
      { title: "Pass", body: "If you pass, we begin the visa preparation process right away." },
      { title: "Training track", body: "If more preparation is needed, you join our affiliated academy training and take a month-end evaluation." },
    ],
    price: "Base guide price: about ₩4,000,000",
    priceDetail: "The final quote may be lower or higher after consultation, depending on your visa route, training needs, and optional support.",
    workNotice: "You can also apply to deetz projects for work opportunities, but casting and paid work are not guaranteed.",
    visaNotice: "Visa approval is decided by Korea Immigration and cannot be guaranteed by deetz.",
    existing: "Already received",
    edit: "Update my information",
    submitted: "Additional information received",
    submittedBody: "We will use these answers to arrange your Zoom consultation first.",
    continue: "Continue",
    back: "Back",
    submit: "Submit information",
    submitting: "Submitting…",
    updated: "Your information has been saved.",
    step1: "Goal and visa readiness",
    step2: "Audition plan and career",
    step3: "Support and confirmation",
    goal: "What is your main goal?",
    goalOptions: [
      { value: "new_visa", label: "Prepare a new work visa" },
      { value: "visa_change", label: "Change or extend my current visa" },
      { value: "career", label: "Build a dance career in Korea" },
      { value: "unsure", label: "I need help choosing the right route" },
    ],
    passportExpiry: "Passport expiry date",
    visaExpiry: "Current visa expiry date",
    residenceCountry: "Country where you currently live",
    immigration: "Have you had an overstay, visa refusal, or immigration issue that we should review?",
    immigrationOptions: [
      { value: "none", label: "No" },
      { value: "needs_review", label: "Yes, I need a review" },
      { value: "private_consultation", label: "I prefer to discuss this privately" },
    ],
    auditionAvailability: "Audition attendance notes (optional)",
    auditionHelp: "The audition lesson is not fixed yet. It is planned once in August and once in September at a dance studio near Hapjeong or Sinchon in Seoul.",
    career: "Recent credits or career evidence not already submitted",
    careerHelp: "List up to three recent projects, artists, stages, awards, or links.",
    contract: "Are you ready to review and sign a Korean work contract?",
    contractOptions: [
      { value: "ready", label: "Yes" },
      { value: "needs_translation", label: "I need a translated version" },
      { value: "needs_explanation", label: "I need a detailed explanation" },
    ],
    settlement: "What support may you need?",
    settlementOptions: [
      { value: "housing", label: "Housing" },
      { value: "korean", label: "Korean language" },
      { value: "banking", label: "Banking and phone" },
      { value: "transport", label: "Arrival and transport" },
      { value: "none", label: "None" },
    ],
    projectOptIn: "I want to receive deetz project opportunities that match my profile.",
    projectHelp: "This is permission to share opportunities, not a promise of casting or paid work.",
    timezone: "Time zone for these options",
    consultation: "Choose three Zoom meeting time options",
    consultationHelp: "Choose three different dates and times in your current time zone. We will confirm one option with you.",
    consultationOption: (index) => `Option ${index}`,
    processAck: "I understand that the audition result determines whether I move directly to visa preparation or first enter the training track.",
    priceAck: "I understand that ₩4,000,000 is a guide price and the final amount may decrease or increase after consultation.",
    required: "Please complete the required fields and confirmations.",
  },
  ja: {
    title: "ビザプログラム専用ページ",
    hello: (name) => `${name}様のdeetzプログラム進行ページです。`,
    intro: "最初のお申し込みで未確認の内容のみ追加で伺います。",
    stage: "現在の段階",
    next: "次のアクション",
    programTitle: "プログラムの流れ",
    program: [
      { title: "Zoom相談", body: "まずZoomでビザ経路とスケジュールを確認します。" },
      { title: "オーディションレッスン", body: "オーディションレッスンは8月に1回、9月に1回、ソウルの合井または新村近くのダンススタジオで実施予定です。" },
      { title: "合格", body: "合格した場合は、すぐにビザ準備へ進みます。" },
      { title: "トレーニング", body: "補完が必要な場合は提携ダンスアカデミーの専門トレーニングを受講し、月末評価を行います。" },
    ],
    price: "基本目安料金：約400万ウォン",
    priceDetail: "ビザ経路、トレーニング、追加サポートにより、最終費用は相談後に安くなる場合も高くなる場合もあります。",
    workNotice: "deetzのプロジェクトにも応募できますが、キャスティングや仕事の提供を保証するものではありません。",
    visaNotice: "ビザ発給の最終判断は韓国の出入国当局が行い、deetzが発給を保証することはできません。",
    existing: "確認済み情報",
    edit: "情報を更新する",
    submitted: "追加情報を受け付けました",
    submittedBody: "回答をもとに、まずZoom相談の日程をご案内します。",
    continue: "次へ",
    back: "戻る",
    submit: "情報を送信",
    submitting: "送信中…",
    updated: "情報を保存しました。",
    step1: "目標とビザ準備",
    step2: "オーディション予定と経歴",
    step3: "サポートと確認",
    goal: "主な目標を選んでください。",
    goalOptions: [
      { value: "new_visa", label: "新しい就労ビザを準備したい" },
      { value: "visa_change", label: "現在のビザを変更・延長したい" },
      { value: "career", label: "韓国でダンスキャリアを築きたい" },
      { value: "unsure", label: "適切な方法を相談したい" },
    ],
    passportExpiry: "パスポート有効期限",
    visaExpiry: "現在のビザ有効期限",
    residenceCountry: "現在居住している国",
    immigration: "オーバーステイ、ビザ拒否など、事前確認が必要な出入国履歴はありますか？",
    immigrationOptions: [
      { value: "none", label: "ありません" },
      { value: "needs_review", label: "あります。確認が必要です" },
      { value: "private_consultation", label: "個別相談で話したいです" },
    ],
    auditionAvailability: "オーディション参加に関する補足（任意）",
    auditionHelp: "オーディション日程は未定です。8月に1回、9月に1回、ソウルの合井または新村近くのダンススタジオで実施予定です。",
    career: "未提出の最近の主な経歴",
    careerHelp: "最近の案件、アーティスト、舞台、受賞歴、リンクを最大3件まで記入してください。",
    contract: "韓国の業務契約書を確認し、署名できますか？",
    contractOptions: [
      { value: "ready", label: "はい" },
      { value: "needs_translation", label: "翻訳版が必要です" },
      { value: "needs_explanation", label: "詳しい説明が必要です" },
    ],
    settlement: "必要なサポートを選んでください。",
    settlementOptions: [
      { value: "housing", label: "住居" },
      { value: "korean", label: "韓国語" },
      { value: "banking", label: "銀行・携帯電話" },
      { value: "transport", label: "入国・交通" },
      { value: "none", label: "不要" },
    ],
    projectOptIn: "プロフィールに合うdeetzプロジェクトの案内を受け取ります。",
    projectHelp: "案件案内への同意であり、キャスティングや有償の仕事を約束するものではありません。",
    timezone: "以下の候補日時のタイムゾーン",
    consultation: "Zoom相談が可能な日時を3つ選んでください。",
    consultationHelp: "現在のタイムゾーンで異なる候補日時を3つ選んでください。相談日時はdeetzから改めて確定します。",
    consultationOption: (index) => `候補 ${index}`,
    processAck: "オーディション結果により、すぐにビザ準備へ進むか、先にトレーニングを受けるかが決まることを理解しました。",
    priceAck: "400万ウォンは目安であり、相談後に最終費用が増減する可能性があることを理解しました。",
    required: "必須項目と確認事項を入力してください。",
  },
  ko: {
    title: "비자 프로그램 케이스",
    hello: (name) => `${name}님의 deetz 프로그램 진행 페이지입니다.`,
    intro: "최초 지원서에서 확인하지 못한 내용만 추가로 질문합니다.",
    stage: "현재 단계",
    next: "다음 할 일",
    programTitle: "프로그램 진행 방식",
    program: [
      { title: "Zoom 상담", body: "먼저 Zoom 미팅으로 비자 경로와 진행 일정을 확인합니다." },
      { title: "오디션 레슨", body: "오디션 레슨은 8월 1회, 9월 1회 합정 또는 신촌 근방 댄스 스튜디오에서 진행할 예정입니다." },
      { title: "통과", body: "레벨테스트를 통과하면 즉시 비자 준비 절차를 시작합니다." },
      { title: "트레이닝", body: "보완이 필요하면 제휴 댄스학원의 전문 트레이닝을 수강하고 월말평가를 진행합니다." },
    ],
    price: "기본 안내 단가 약 400만원",
    priceDetail: "비자 경로, 트레이닝 필요 여부, 추가 지원 범위에 따라 상담 후 최종 비용이 내려가거나 추가될 수 있습니다.",
    workNotice: "deetz 프로젝트에 지원해 일거리 기회를 받을 수 있지만, 캐스팅이나 일거리 제공을 보장하지는 않습니다.",
    visaNotice: "비자 발급 여부는 한국 출입국 당국이 최종 결정하며, deetz가 발급을 보장할 수는 없습니다.",
    existing: "이미 확인한 정보",
    edit: "정보 수정하기",
    submitted: "추가 정보가 접수됐어요",
    submittedBody: "답변을 바탕으로 먼저 Zoom 상담 일정을 안내하겠습니다.",
    continue: "다음",
    back: "이전",
    submit: "정보 제출하기",
    submitting: "제출 중…",
    updated: "정보가 저장됐어요.",
    step1: "목표와 비자 준비 상태",
    step2: "오디션 예정과 활동 경력",
    step3: "지원 항목과 확인",
    goal: "가장 중요한 목표는 무엇인가요?",
    goalOptions: [
      { value: "new_visa", label: "새로운 취업 비자 준비" },
      { value: "visa_change", label: "현재 비자 변경 또는 연장" },
      { value: "career", label: "한국에서 댄스 커리어 시작" },
      { value: "unsure", label: "적절한 경로 상담 필요" },
    ],
    passportExpiry: "여권 만료일",
    visaExpiry: "현재 비자 만료일",
    residenceCountry: "현재 거주 중인 국가",
    immigration: "오버스테이, 비자 거절 등 사전 검토가 필요한 출입국 이력이 있나요?",
    immigrationOptions: [
      { value: "none", label: "없음" },
      { value: "needs_review", label: "있음, 사전 검토 필요" },
      { value: "private_consultation", label: "개별 상담에서 설명 희망" },
    ],
    auditionAvailability: "오디션 참석 관련 참고사항 (선택)",
    auditionHelp: "오디션 일정은 아직 미정입니다. 8월 1회, 9월 1회 합정 또는 신촌 근방 댄스 스튜디오에서 진행할 예정입니다.",
    career: "아직 제출하지 않은 최근 주요 경력",
    careerHelp: "최근 프로젝트, 참여 아티스트, 무대, 수상 이력이나 링크를 최대 3개까지 적어주세요.",
    contract: "한국어 업무 계약서를 검토하고 서명할 준비가 됐나요?",
    contractOptions: [
      { value: "ready", label: "준비됨" },
      { value: "needs_translation", label: "번역본 필요" },
      { value: "needs_explanation", label: "상세 설명 필요" },
    ],
    settlement: "필요할 수 있는 지원을 선택해 주세요.",
    settlementOptions: [
      { value: "housing", label: "주거" },
      { value: "korean", label: "한국어" },
      { value: "banking", label: "은행·휴대폰" },
      { value: "transport", label: "입국·교통" },
      { value: "none", label: "필요 없음" },
    ],
    projectOptIn: "내 프로필에 맞는 deetz 프로젝트 기회를 안내받겠습니다.",
    projectHelp: "프로젝트 안내 수신 동의이며, 캐스팅이나 유급 일감을 약속하는 것은 아닙니다.",
    timezone: "아래 후보 일정의 시간대",
    consultation: "Zoom 미팅 가능한 날짜와 시간을 3개 선택해 주세요.",
    consultationHelp: "현재 시간대를 기준으로 서로 다른 후보 3개를 선택해 주세요. 최종 미팅 일정은 deetz가 다시 확인해 드립니다.",
    consultationOption: (index) => `후보 ${index}`,
    processAck: "오디션 결과에 따라 바로 비자 준비로 가거나, 먼저 트레이닝을 받게 된다는 점을 이해했습니다.",
    priceAck: "400만원은 기본 안내 단가이며, 상담 후 최종 비용이 내려가거나 추가될 수 있다는 점을 이해했습니다.",
    required: "필수 항목과 확인 사항을 모두 입력해 주세요.",
  },
};

const STAGE_LABEL: Record<Lang, Record<string, string>> = {
  en: { application_received: "Application received", triage_submitted: "Information review", audition_scheduled: "Audition scheduled", audition_complete: "Audition complete", training: "Training", monthly_evaluation: "Month-end evaluation", visa_documents: "Visa documents", visa_submitted: "Visa submitted", complete: "Complete", on_hold: "On hold" },
  ja: { application_received: "申込受付", triage_submitted: "情報確認", audition_scheduled: "オーディション予定", audition_complete: "オーディション完了", training: "トレーニング", monthly_evaluation: "月末評価", visa_documents: "ビザ書類準備", visa_submitted: "ビザ申請済み", complete: "完了", on_hold: "保留" },
  ko: { application_received: "지원서 접수", triage_submitted: "추가 정보 검토", audition_scheduled: "오디션 예정", audition_complete: "오디션 완료", training: "전문 트레이닝", monthly_evaluation: "월말평가", visa_documents: "비자 서류 준비", visa_submitted: "비자 신청 접수", complete: "완료", on_hold: "보류" },
};

const OPERATIONS_COPY: Record<Lang, {
  title: string;
  auditionAt: string;
  auditionLocation: string;
  auditionResult: string;
  trainingPartner: string;
  trainingPeriod: string;
  evaluationAt: string;
  evaluationResult: string;
  auditionResults: Record<string, string>;
  evaluationResults: Record<string, string>;
}> = {
  en: {
    title: "Audition schedule and results",
    auditionAt: "Audition lesson",
    auditionLocation: "Location",
    auditionResult: "Audition result",
    trainingPartner: "Training partner",
    trainingPeriod: "Training period",
    evaluationAt: "Month-end evaluation",
    evaluationResult: "Evaluation result",
    auditionResults: { pass: "Passed — visa preparation", training_required: "Training required", no_show: "No-show" },
    evaluationResults: { pass: "Passed — visa preparation", continue: "Continue training", hold: "On hold" },
  },
  ja: {
    title: "オーディション日程と結果",
    auditionAt: "オーディションレッスン",
    auditionLocation: "場所",
    auditionResult: "オーディション結果",
    trainingPartner: "提携トレーニング先",
    trainingPeriod: "トレーニング期間",
    evaluationAt: "月末評価",
    evaluationResult: "評価結果",
    auditionResults: { pass: "合格 — ビザ準備へ", training_required: "トレーニングが必要", no_show: "不参加" },
    evaluationResults: { pass: "合格 — ビザ準備へ", continue: "トレーニング継続", hold: "保留" },
  },
  ko: {
    title: "오디션 일정·결과",
    auditionAt: "오디션 레슨",
    auditionLocation: "장소",
    auditionResult: "오디션 결과",
    trainingPartner: "연계 트레이닝 기관",
    trainingPeriod: "트레이닝 기간",
    evaluationAt: "월말평가",
    evaluationResult: "평가 결과",
    auditionResults: { pass: "통과 — 비자 준비 진행", training_required: "전문 트레이닝 필요", no_show: "불참" },
    evaluationResults: { pass: "통과 — 비자 준비 진행", continue: "트레이닝 계속", hold: "보류" },
  },
};

const PORTAL_LOCALE: Record<Lang, string> = { en: "en-US", ja: "ja-JP", ko: "ko-KR" };

function formatPortalDateTime(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(PORTAL_LOCALE[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatPortalDate(value: string, lang: Lang): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(PORTAL_LOCALE[lang], {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function textValue(answers: Answers, key: string): string {
  return typeof answers[key] === "string" ? (answers[key] as string) : "";
}

function arrayValue(answers: Answers, key: string): string[] {
  return Array.isArray(answers[key]) ? (answers[key] as unknown[]).filter((v): v is string => typeof v === "string") : [];
}

export function VisaCasePortal({ token, initial }: { token: string; initial: VisaCaseInitial }) {
  const router = useRouter();
  const initialLang: Lang = initial.preferredLang === "ja" || initial.preferredLang === "ko" ? initial.preferredLang : "en";
  const [lang, setLang] = useState<Lang>(initialLang);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(!initial.followUpSubmittedAt);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const a = initial.followUpAnswers;
  const [goal, setGoal] = useState(textValue(a, "goal"));
  const [passportExpiry, setPassportExpiry] = useState(textValue(a, "passportExpiry"));
  const [visaExpiry, setVisaExpiry] = useState(textValue(a, "visaExpiry"));
  const [residenceCountry, setResidenceCountry] = useState(textValue(a, "residenceCountry"));
  const [immigrationHistory, setImmigrationHistory] = useState(textValue(a, "immigrationHistory"));
  const [auditionAvailability, setAuditionAvailability] = useState(textValue(a, "auditionAvailability"));
  const [careerHighlights, setCareerHighlights] = useState(textValue(a, "careerHighlights"));
  const [contractReadiness, setContractReadiness] = useState(textValue(a, "contractReadiness"));
  const [settlementNeeds, setSettlementNeeds] = useState<string[]>(arrayValue(a, "settlementNeeds"));
  const [projectOptIn, setProjectOptIn] = useState(a.projectOpportunityOptIn === true);
  const [timezone, setTimezone] = useState(textValue(a, "consultationTimezone") || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [consultationSlots, setConsultationSlots] = useState<ConsultationSlots>(
    () => consultationSlotsFromAnswers(a),
  );
  const [processAck, setProcessAck] = useState(a.processAcknowledged === true);
  const [priceAck, setPriceAck] = useState(a.priceAcknowledged === true);
  const t = COPY[lang];
  const operationsCopy = OPERATIONS_COPY[lang];

  const existing = useMemo(() => {
    const visaHeld = lang === "ko" ? "한국 비자 보유" : lang === "ja" ? "韓国ビザあり" : "Korean visa held";
    const noVisa = lang === "ko" ? "현재 한국 비자 없음" : lang === "ja" ? "現在の韓国ビザなし" : "No current Korean visa";
    const inKorea = lang === "ko" ? "현재 한국 거주" : lang === "ja" ? "現在韓国に居住" : "Currently in Korea";
    const outsideKorea = lang === "ko" ? "현재 해외 거주" : lang === "ja" ? "現在韓国外に居住" : "Currently outside Korea";
    const video = lang === "ko" ? "댄스 영상 확인됨" : lang === "ja" ? "ダンス映像確認済み" : "Dance video received";
    return [
      initial.email,
      initial.nationality,
      initial.hasVisa == null ? null : initial.hasVisa ? initial.visaLabel || visaHeld : noVisa,
      initial.currentlyInKorea == null ? null : initial.currentlyInKorea ? inKorea : outsideKorea,
      initial.danceVideoUrl ? video : null,
    ].filter(Boolean) as string[];
  }, [initial, lang]);

  const canContinue = step === 0
    ? Boolean(goal && immigrationHistory && (initial.hasVisa ? visaExpiry : passportExpiry) && (initial.currentlyInKorea !== false || residenceCountry))
    : step === 1
      ? Boolean(contractReadiness)
      : Boolean(timezone.trim() && hasThreeUniqueConsultationSlots(consultationSlots) && processAck && priceAck);

  const operationalDetails = [
    initial.auditionAt
      ? { label: operationsCopy.auditionAt, value: formatPortalDateTime(initial.auditionAt, lang) }
      : null,
    initial.auditionLocation
      ? { label: operationsCopy.auditionLocation, value: initial.auditionLocation }
      : null,
    initial.auditionResult !== "pending"
      ? { label: operationsCopy.auditionResult, value: operationsCopy.auditionResults[initial.auditionResult] ?? initial.auditionResult }
      : null,
    initial.trainingPartner
      ? { label: operationsCopy.trainingPartner, value: initial.trainingPartner }
      : null,
    initial.trainingStartDate || initial.trainingEndDate
      ? {
          label: operationsCopy.trainingPeriod,
          value: [initial.trainingStartDate, initial.trainingEndDate]
            .map((value) => value ? formatPortalDate(value, lang) : "")
            .filter(Boolean)
            .join(" — "),
        }
      : null,
    initial.monthlyEvaluationAt
      ? { label: operationsCopy.evaluationAt, value: formatPortalDateTime(initial.monthlyEvaluationAt, lang) }
      : null,
    initial.monthlyEvaluationResult !== "pending"
      ? { label: operationsCopy.evaluationResult, value: operationsCopy.evaluationResults[initial.monthlyEvaluationResult] ?? initial.monthlyEvaluationResult }
      : null,
  ].filter((detail): detail is { label: string; value: string } => Boolean(detail?.value));

  const toggleNeed = (value: string) => {
    setSettlementNeeds((prev) => {
      if (value === "none") return prev.includes("none") ? [] : ["none"];
      const withoutNone = prev.filter((v) => v !== "none");
      return withoutNone.includes(value) ? withoutNone.filter((v) => v !== value) : [...withoutNone, value];
    });
  };

  const updateConsultationSlot = (index: number, value: string) => {
    setConsultationSlots((current) =>
      current.map((slot, slotIndex) =>
        slotIndex === index ? value : slot,
      ) as ConsultationSlots,
    );
  };

  const submit = () => {
    if (!canContinue) {
      setError(t.required);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitVisaCaseFollowUpAction({
        token,
        goal: goal as "new_visa" | "visa_change" | "career" | "unsure",
        passportExpiry,
        visaExpiry,
        residenceCountry,
        immigrationHistory: immigrationHistory as "none" | "needs_review" | "private_consultation",
        auditionAvailability,
        careerHighlights,
        contractReadiness: contractReadiness as "ready" | "needs_translation" | "needs_explanation",
        settlementNeeds: settlementNeeds as ("housing" | "korean" | "banking" | "transport" | "none")[],
        projectOpportunityOptIn: projectOptIn,
        consultationTimezone: timezone,
        consultationSlots,
        consultationAvailability: formatConsultationAvailability(
          consultationSlots,
          timezone,
        ),
        processAcknowledged: processAck as true,
        priceAcknowledged: priceAck as true,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setEditing(false);
      setStep(0);
      router.refresh();
    });
  };

  return (
    <main className={cn("mx-auto min-h-screen w-full max-w-3xl px-5 py-7 md:px-8 md:py-10", lang === "ko" && "break-keep")}>
      <header className="mb-8 flex items-center justify-between">
        <DeetzLogo className="h-7 w-auto" priority />
        <div className="flex gap-1">
          {(["en", "ja", "ko"] as Lang[]).map((value) => (
            <button key={value} type="button" onClick={() => setLang(value)} className={cn("rounded-md border px-2 py-1 text-xs", value === lang ? "border-foreground text-foreground" : "border-hairline-2 text-ink-3")}>
              {value === "ja" ? "日本語" : value === "ko" ? "한국어" : "EN"}
            </button>
          ))}
        </div>
      </header>

      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-3">{t.title}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{t.hello(initial.name)}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.intro}</p>

      <section className="mt-6 grid gap-3 rounded-2xl border border-hairline-2 bg-card p-5 md:grid-cols-2">
        <div>
          <p className="text-xs text-ink-3">{t.stage}</p>
          <p className="mt-1 font-semibold text-foreground">{STAGE_LABEL[lang][initial.caseStage] ?? initial.caseStage}</p>
        </div>
        <div>
          <p className="text-xs text-ink-3">{t.next}</p>
          <p className="mt-1 font-semibold text-foreground">{initial.nextAction || (lang === "ko" ? "Zoom 상담 일정 협의" : lang === "ja" ? "Zoom相談日程の調整" : "Arrange Zoom consultation")}</p>
        </div>
      </section>

      {operationalDetails.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" />
            <h2 className="font-bold">{operationsCopy.title}</h2>
          </div>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            {operationalDetails.map((detail) => (
              <div key={detail.label} className="rounded-xl border border-hairline-2 bg-background/90 p-3.5">
                <dt className="text-xs text-ink-3">{detail.label}</dt>
                <dd className="mt-1 text-sm font-semibold leading-relaxed text-foreground">{detail.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h2 className="font-bold">{t.programTitle}</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {t.program.map((item, index) => (
            <div key={item.title} className="flex items-start gap-3 rounded-xl bg-background/80 p-3.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-hairline-2 bg-background p-4">
          <p className="text-sm font-bold">{initial.quotedPriceKrw ? `₩${initial.quotedPriceKrw.toLocaleString()}` : t.price}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{t.priceDetail}</p>
        </div>
        <div className="mt-3 grid gap-2 text-xs leading-relaxed text-ink-2 md:grid-cols-2">
          <p className="flex items-start gap-2"><BriefcaseBusiness className="mt-0.5 size-4 shrink-0" />{t.workNotice}</p>
          <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" />{t.visaNotice}</p>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-hairline-2 bg-card p-5">
        <p className="text-xs font-semibold text-ink-3">{t.existing}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {existing.map((value) => <span key={value} className="rounded-full bg-secondary px-3 py-1 text-xs text-ink-2">{value}</span>)}
        </div>
      </section>

      {!editing ? (
        <section className="mt-4 flex flex-col items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-7 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <h2 className="mt-3 font-bold">{saved ? t.updated : t.submitted}</h2>
          <p className="mt-1 text-sm text-ink-2">{t.submittedBody}</p>
          <button type="button" onClick={() => setEditing(true)} className="mt-5 rounded-lg border border-hairline-2 bg-background px-4 py-2 text-sm font-medium hover:bg-secondary">{t.edit}</button>
        </section>
      ) : (
        <section className="mt-4 rounded-2xl border border-hairline-2 bg-card p-5 md:p-7">
          <div className="mb-6 flex items-center gap-2">
            {[t.step1, t.step2, t.step3].map((label, index) => (
              <div key={label} className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-secondary")} aria-label={label} />
            ))}
          </div>
          <h2 className="mb-5 text-lg font-bold">{[t.step1, t.step2, t.step3][step]}</h2>

          {step === 0 ? (
            <div className="space-y-5">
              <ChoiceGroup label={t.goal} options={t.goalOptions} value={goal} onChange={setGoal} />
              <Field label={initial.hasVisa ? t.visaExpiry : t.passportExpiry}>
                <input type="date" value={initial.hasVisa ? visaExpiry : passportExpiry} onChange={(e) => initial.hasVisa ? setVisaExpiry(e.target.value) : setPassportExpiry(e.target.value)} className="w-full rounded-xl border border-hairline-2 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none" />
              </Field>
              {initial.currentlyInKorea === false ? <Field label={t.residenceCountry}><input value={residenceCountry} onChange={(e) => setResidenceCountry(e.target.value)} className="w-full rounded-xl border border-hairline-2 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none" /></Field> : null}
              <ChoiceGroup label={t.immigration} options={t.immigrationOptions} value={immigrationHistory} onChange={setImmigrationHistory} />
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-5">
              <Field label={t.auditionAvailability} help={t.auditionHelp}><textarea rows={4} value={auditionAvailability} onChange={(e) => setAuditionAvailability(e.target.value)} className="w-full resize-none rounded-xl border border-hairline-2 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none" /></Field>
              <Field label={t.career} help={t.careerHelp}><textarea rows={4} value={careerHighlights} onChange={(e) => setCareerHighlights(e.target.value)} className="w-full resize-none rounded-xl border border-hairline-2 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none" /></Field>
              <ChoiceGroup label={t.contract} options={t.contractOptions} value={contractReadiness} onChange={setContractReadiness} />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <div>
                <p className="mb-2 text-sm font-semibold">{t.settlement}</p>
                <div className="flex flex-wrap gap-2">
                  {t.settlementOptions.map((option) => <button key={option.value} type="button" onClick={() => toggleNeed(option.value)} className={cn("rounded-lg border px-3 py-2 text-sm", settlementNeeds.includes(option.value) ? "border-primary bg-primary/10 text-primary" : "border-hairline-2 text-ink-2")}>{option.label}</button>)}
                </div>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-hairline-2 p-4">
                <input type="checkbox" checked={projectOptIn} onChange={(e) => setProjectOptIn(e.target.checked)} className="mt-1 size-4" />
                <span><span className="block text-sm font-semibold">{t.projectOptIn}</span><span className="mt-1 block text-xs leading-relaxed text-ink-3">{t.projectHelp}</span></span>
              </label>
              <Field label={t.timezone}><input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full rounded-xl border border-hairline-2 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none" /></Field>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">{t.consultation}</legend>
                <div className="grid gap-2.5">
                  {consultationSlots.map((slot, index) => (
                    <label key={index} className="flex items-center gap-3 rounded-xl border border-hairline-2 bg-background p-3 focus-within:border-primary">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-ink-2">
                        {index + 1}
                      </span>
                      <span className="sr-only">{t.consultationOption(index + 1)}</span>
                      <input
                        type="datetime-local"
                        step={900}
                        value={slot}
                        onChange={(event) => updateConsultationSlot(index, event.target.value)}
                        aria-label={t.consultationOption(index + 1)}
                        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
                      />
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-3">{t.consultationHelp}</p>
              </fieldset>
              <CheckLabel checked={processAck} onChange={setProcessAck} label={t.processAck} />
              <CheckLabel checked={priceAck} onChange={setPriceAck} label={t.priceAck} />
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-rose-600">{error}</p> : null}
          <div className="mt-7 flex items-center justify-between">
            <button type="button" onClick={() => step === 0 ? (initial.followUpSubmittedAt ? setEditing(false) : router.push("/program")) : setStep((value) => value - 1)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-secondary"><ArrowLeft className="size-4" />{t.back}</button>
            {step < 2 ? (
              <button type="button" onClick={() => canContinue ? (setError(null), setStep((value) => value + 1)) : setError(t.required)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">{t.continue}<ArrowRight className="size-4" /></button>
            ) : (
              <button type="button" onClick={submit} disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{pending ? t.submitting : t.submit}</button>
            )}
          </div>
        </section>
      )}

      <footer className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-4">
        <CalendarDays className="size-3.5" />
        <span>deetz × GRIGO Entertainment</span>
      </footer>
    </main>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}{help ? <span className="mt-1.5 block text-xs leading-relaxed text-ink-3">{help}</span> : null}</label>;
}

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <div><p className="mb-2 text-sm font-semibold">{label}</p><div className="grid gap-2">{options.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={cn("flex items-center gap-3 rounded-xl border p-3 text-left text-sm", value === option.value ? "border-primary bg-primary/5 text-foreground" : "border-hairline-2 text-ink-2")}><CircleDot className={cn("size-4 shrink-0", value === option.value ? "text-primary" : "text-ink-4")} />{option.label}</button>)}</div></div>;
}

function CheckLabel({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="flex items-start gap-3 rounded-xl border border-hairline-2 p-4"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4" /><span className="text-sm leading-relaxed text-ink-2">{label}</span></label>;
}
