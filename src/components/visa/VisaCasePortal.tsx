"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  PauseCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  resumeVisaCaseAction,
  submitVisaCaseDeclineAction,
  submitVisaCaseFollowUpAction,
} from "@/app/actions/visa-case";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { VisaJourneyTimeline } from "@/components/visa/VisaJourneyTimeline";
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
  auditionEndsAt: string | null;
  auditionRsvp: string | null;
  trainingRequired: boolean | null;
  trainingPartner: string | null;
  trainingStartDate: string | null;
  trainingEndDate: string | null;
  trainingStatus: string;
  monthlyEvaluationAt: string | null;
  monthlyEvaluationResult: string;
  nextAction: string | null;
  // 확정된 온라인 미팅 (visa_meeting_invites 최신 sent 행)
  meetingAt: string | null;
  meetingUrl: string | null;
  // 결제 미러링 (정본=grigoent)
  paymentStatus: string;
  paymentProductSlug: string | null;
  paymentUrl: string | null;
  paymentAmountKrw: number | null;
  paidAt: string | null;
  // Village 사전예약금 (village_waitlist 미러링)
  villageDepositStatus: string;
  villageDepositPaidAt: string | null;
  basePriceKrw: number;
  quotedPriceKrw: number | null;
  declinedAt: string | null;
  declineReason: string | null;
  declineReasonDetail: string | null;
};

export const DECLINE_REASONS = [
  "other_agency",
  "price",
  "schedule",
  "not_ready",
  "other",
] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number];

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
  declineEntry: string;
  declineEntryCta: string;
  declineTitle: string;
  declineIntro: string;
  declineReasonLabel: string;
  declineOptions: { value: DeclineReason; label: string }[];
  declineDetail: string;
  declineDetailHelp: string;
  declineSubmit: string;
  declineCancel: string;
  declineRequired: string;
  declinedTitle: string;
  declinedBody: string;
  declinedReasonLabel: string;
  resume: string;
};

const COPY: Record<Lang, Copy> = {
  en: {
    title: "Visa program page",
    hello: (name) => `Hi ${name}, this is your deetz program page.`,
    intro: "We only ask for details that were not included in your first application.",
    stage: "Current stage",
    next: "Next action",
    programTitle: "What happens next",
    program: [
      { title: "Online meeting", body: "We review your situation in an online meeting first." },
      { title: "Next step guide", body: "After the meeting, we let you know whether we can move forward and what schedule is realistic." },
      { title: "Visa preparation", body: "If your route is ready, we begin preparing the visa documents with you." },
      { title: "Training first, if needed", body: "If more preparation is needed, we may recommend training before moving into the visa process." },
    ],
    price: "Estimated fee: about ₩4,000,000",
    priceDetail: "The estimated ₩4,000,000 fee includes dance training, audition-related costs, contract preparation, and administrative handling for the visa process. The final amount may be lower or higher after the online consultation.",
    workNotice: "You can also apply to deetz projects for work opportunities, but casting and paid work are not guaranteed.",
    visaNotice: "Visa approval is decided by Korea Immigration and cannot be guaranteed by deetz.",
    existing: "Already received",
    edit: "Update my information",
    submitted: "Additional information received",
    submittedBody: "We will use these answers to arrange your online meeting first.",
    continue: "Continue",
    back: "Back",
    submit: "Submit information",
    submitting: "Submitting…",
    updated: "Your information has been saved.",
    step1: "Goal and visa readiness",
    step2: "Evaluation plan and career",
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
    auditionAvailability: "In-person evaluation notes (optional)",
    auditionHelp: "The schedule is not fixed yet. After the online meeting, we will let you know if an in-person evaluation is needed and share the next available schedule.",
    career: "Recent credits or proof of your career not already submitted",
    careerHelp: "List up to three recent projects, artists, stages, awards, or links.",
    contract: "If we move forward, are you ready to review and sign a Korean work contract?",
    contractOptions: [
      { value: "ready", label: "Yes" },
      { value: "needs_translation", label: "I need a translated version" },
      { value: "needs_explanation", label: "I need a detailed explanation" },
    ],
    settlement: "Select the deetz support you may need for your activities in Korea.",
    settlementOptions: [
      { value: "training", label: "Dance training" },
      { value: "housing", label: "Housing" },
      { value: "korean", label: "Korean language" },
      { value: "transport", label: "Arrival and transport" },
      { value: "none", label: "None" },
    ],
    projectOptIn: "I want to receive deetz project opportunities that match my profile.",
    projectHelp: "This is permission to share opportunities, not a promise of casting or paid work.",
    timezone: "Time zone for these options",
    consultation: "Choose three times when you can join an online meeting (Zoom or Google Meet).",
    consultationHelp: "You can use your own time zone. The deetz team will also review the options in Korea time before confirming one meeting time.",
    consultationOption: (index) => `Option ${index}`,
    processAck: "I understand that deetz will review my information first and may recommend either visa preparation or training before visa preparation.",
    priceAck: "I understand that the estimated ₩4,000,000 fee includes dance training, audition-related costs, contract preparation, and administrative handling for the visa process, and that the final amount may be lower or higher after the online consultation.",
    required: "Please complete the required fields and confirmations.",
    declineEntry: "Not planning to continue right now?",
    declineEntryCta: "Tell us you are not continuing",
    declineTitle: "You are not continuing for now",
    declineIntro: "Nothing else is required from you. A short reason helps us improve the program, and you can come back to this page any time.",
    declineReasonLabel: "Main reason",
    declineOptions: [
      { value: "other_agency", label: "I found another agency or route" },
      { value: "price", label: "The cost is too high for me" },
      { value: "schedule", label: "The timing does not work for me" },
      { value: "not_ready", label: "I am not ready to decide yet" },
      { value: "other", label: "Other reason" },
    ],
    declineDetail: "Anything you would like to add (optional)",
    declineDetailHelp: "If you selected Other, please write the reason here.",
    declineSubmit: "Submit",
    declineCancel: "Cancel",
    declineRequired: "Please select a reason.",
    declinedTitle: "We have noted that you are not continuing",
    declinedBody: "Thank you for letting us know. We will keep your application on hold and will not send further steps.",
    declinedReasonLabel: "Reason you shared",
    resume: "I would like to continue after all",
  },
  ja: {
    title: "ビザプログラム専用ページ",
    hello: (name) => `${name}様のdeetzプログラム進行ページです。`,
    intro: "最初のお申し込みで未確認の内容のみ追加で伺います。",
    stage: "現在の段階",
    next: "次のアクション",
    programTitle: "今後の流れ",
    program: [
      { title: "オンライン相談", body: "まずオンラインミーティングで現在の状況を詳しく確認します。" },
      { title: "次のステップ案内", body: "相談後、進行可能かどうかと現実的なスケジュールをご案内します。" },
      { title: "ビザ準備", body: "すぐに進行できる場合は、ビザ書類の準備を一緒に始めます。" },
      { title: "必要に応じたトレーニング", body: "準備が必要な場合は、ビザ準備の前にトレーニングをご案内することがあります。" },
    ],
    price: "想定料金：約400万ウォン",
    priceDetail: "想定料金400万ウォンには、ダンストレーニング、オーディション関連費用、契約書作成、ビザ発給のための行政手続き費用が含まれます。オンライン相談後、費用が下がる場合も上がる場合もあります。",
    workNotice: "deetzのプロジェクトにも応募できますが、キャスティングや仕事の提供を保証するものではありません。",
    visaNotice: "ビザ発給の最終判断は韓国の出入国当局が行い、deetzが発給を保証することはできません。",
    existing: "確認済み情報",
    edit: "情報を更新する",
    submitted: "追加情報を受け付けました",
    submittedBody: "回答をもとに、まずオンライン相談の日程をご案内します。",
    continue: "次へ",
    back: "戻る",
    submit: "情報を送信",
    submitting: "送信中…",
    updated: "情報を保存しました。",
    step1: "目標とビザ準備",
    step2: "対面評価の予定と経歴",
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
    auditionAvailability: "対面評価に関する補足（任意）",
    auditionHelp: "日程はまだ確定していません。オンライン相談後、対面での確認が必要な場合に、次に可能な日程をご案内します。",
    career: "未提出の最近の主な経歴",
    careerHelp: "最近の案件、アーティスト、舞台、受賞歴、リンクを最大3件まで記入してください。",
    contract: "進行する場合、韓国の業務契約書を確認し、署名できますか？",
    contractOptions: [
      { value: "ready", label: "はい" },
      { value: "needs_translation", label: "翻訳版が必要です" },
      { value: "needs_explanation", label: "詳しい説明が必要です" },
    ],
    settlement: "韓国での活動のために、deetzのサポートが必要な項目を選んでください。",
    settlementOptions: [
      { value: "training", label: "ダンストレーニング" },
      { value: "housing", label: "住居" },
      { value: "korean", label: "韓国語" },
      { value: "transport", label: "入国・交通" },
      { value: "none", label: "不要" },
    ],
    projectOptIn: "プロフィールに合うdeetzプロジェクトの案内を受け取ります。",
    projectHelp: "案件案内への同意であり、キャスティングや有償の仕事を約束するものではありません。",
    timezone: "候補日時のタイムゾーン",
    consultation: "オンラインミーティング（ZoomまたはGoogle Meet）が可能な日時を3つ選んでください。",
    consultationHelp: "ご自身のタイムゾーンを入力できます。deetzは韓国時間でも確認したうえで、最終ミーティング日時をご案内します。",
    consultationOption: (index) => `候補 ${index}`,
    processAck: "deetzが情報を確認したうえで、ビザ準備または事前トレーニングをご案内する場合があることを理解しました。",
    priceAck: "想定料金400万ウォンには、ダンストレーニング、オーディション関連費用、契約書作成、ビザ発給のための行政手続き費用が含まれ、オンライン相談後に費用が下がる場合も上がる場合もあることを理解しました。",
    required: "必須項目と確認事項を入力してください。",
    declineEntry: "今回は進めない場合はこちらからお知らせください。",
    declineEntryCta: "進行しないことを伝える",
    declineTitle: "今回は進行しない",
    declineIntro: "これ以上のご対応は不要です。簡単な理由をお聞かせいただけると今後のプログラム改善に役立ちます。いつでもこのページから再開できます。",
    declineReasonLabel: "主な理由",
    declineOptions: [
      { value: "other_agency", label: "他のエージェンシーや方法が見つかった" },
      { value: "price", label: "費用の負担が大きい" },
      { value: "schedule", label: "スケジュールが合わない" },
      { value: "not_ready", label: "まだ決心がつかない" },
      { value: "other", label: "その他の理由" },
    ],
    declineDetail: "補足があればご記入ください（任意）",
    declineDetailHelp: "「その他の理由」を選んだ場合はこちらにご記入ください。",
    declineSubmit: "送信する",
    declineCancel: "キャンセル",
    declineRequired: "理由を選択してください。",
    declinedTitle: "進行しないご意向を承りました",
    declinedBody: "ご連絡ありがとうございます。お申し込みは保留として扱い、次のステップのご案内は送りません。",
    declinedReasonLabel: "お知らせいただいた理由",
    resume: "やはり進めたいです",
  },
  ko: {
    title: "비자 프로그램 진행 페이지",
    hello: (name) => `${name}님의 deetz 프로그램 진행 페이지입니다.`,
    intro: "최초 지원서에서 확인하지 못한 내용만 추가로 질문합니다.",
    stage: "현재 단계",
    next: "다음 할 일",
    programTitle: "프로그램 진행 방식",
    program: [
      { title: "온라인 상담", body: "먼저 온라인 미팅으로 현재 상황을 자세히 확인합니다." },
      { title: "다음 단계 안내", body: "상담 후 진행 가능 여부와 현실적인 일정을 안내드립니다." },
      { title: "비자 준비", body: "바로 진행 가능한 경우 비자 서류 준비를 함께 시작합니다." },
      { title: "필요 시 트레이닝", body: "준비가 더 필요한 경우 비자 준비 전에 트레이닝을 안내할 수 있습니다." },
    ],
    price: "예상 단가 약 400만원",
    priceDetail: "예상 단가 400만원에는 댄스 트레이닝, 오디션 비용, 계약서 작성, 비자 발급을 위한 행정 처리 비용이 포함됩니다. 온라인 상담 후 비용이 더 낮아지거나 올라갈 수 있습니다.",
    workNotice: "deetz 프로젝트에 지원해 일거리 기회를 받을 수 있지만, 캐스팅이나 일거리 제공을 보장하지는 않습니다.",
    visaNotice: "비자 발급 여부는 한국 출입국 당국이 최종 결정하며, deetz가 발급을 보장할 수는 없습니다.",
    existing: "이미 확인한 정보",
    edit: "정보 수정하기",
    submitted: "추가 정보가 접수됐어요",
    submittedBody: "답변을 바탕으로 먼저 온라인 상담 일정을 안내하겠습니다.",
    continue: "다음",
    back: "이전",
    submit: "정보 제출하기",
    submitting: "제출 중…",
    updated: "정보가 저장됐어요.",
    step1: "목표와 비자 준비 상태",
    step2: "대면 확인 일정과 활동 경력",
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
    auditionAvailability: "대면 확인 관련 참고사항 (선택)",
    auditionHelp: "일정은 아직 확정되지 않았습니다. 온라인 상담 후 대면 확인이 필요한 경우 가능한 일정을 다시 안내드립니다.",
    career: "아직 제출하지 않은 최근 주요 경력",
    careerHelp: "최근 프로젝트, 참여 아티스트, 무대, 수상 이력이나 링크를 최대 3개까지 적어주세요.",
    contract: "진행하게 될 경우 한국어 업무 계약서를 검토하고 서명할 준비가 됐나요?",
    contractOptions: [
      { value: "ready", label: "준비됨" },
      { value: "needs_translation", label: "번역본 필요" },
      { value: "needs_explanation", label: "상세 설명 필요" },
    ],
    settlement: "한국 활동을 위해 deetz의 지원이 필요한 것들을 선택해 주세요.",
    settlementOptions: [
      { value: "training", label: "댄스 트레이닝" },
      { value: "housing", label: "주거 (집, 살 곳)" },
      { value: "korean", label: "한국어 언어" },
      { value: "transport", label: "입국·교통" },
      { value: "none", label: "필요 없음" },
    ],
    projectOptIn: "내 프로필에 맞는 deetz 프로젝트 기회를 안내받겠습니다.",
    projectHelp: "프로젝트 안내 수신 동의이며, 캐스팅이나 유급 일감을 약속하는 것은 아닙니다.",
    timezone: "후보 일정의 시간대 (한국 현지 시각 기준으로 다시 확인됩니다)",
    consultation: "온라인 미팅 (Zoom 또는 Google Meet)이 가능한 날짜와 시간을 3개 선택해 주세요.",
    consultationHelp: "본인의 시간대를 입력해도 됩니다. deetz가 한국 현지 시각 기준으로 다시 확인한 뒤 최종 미팅 일정을 안내드립니다.",
    consultationOption: (index) => `후보 ${index}`,
    processAck: "deetz가 정보를 먼저 검토한 뒤 비자 준비 또는 사전 트레이닝을 안내할 수 있다는 점을 이해했습니다.",
    priceAck: "예상 단가 400만원에는 댄스 트레이닝, 오디션 비용, 계약서 작성, 비자 발급을 위한 행정 처리 비용이 포함되며, 온라인 상담 후 비용이 더 낮아지거나 올라갈 수 있다는 점을 이해했습니다.",
    required: "필수 항목과 확인 사항을 모두 입력해 주세요.",
    declineEntry: "지금은 진행을 원하지 않으시나요?",
    declineEntryCta: "진행하지 않겠다고 알리기",
    declineTitle: "지금은 진행하지 않기",
    declineIntro: "더 하실 일은 없습니다. 간단한 사유를 남겨주시면 프로그램을 개선하는 데 큰 도움이 됩니다. 마음이 바뀌시면 언제든 이 페이지에서 다시 진행할 수 있습니다.",
    declineReasonLabel: "가장 가까운 사유",
    declineOptions: [
      { value: "other_agency", label: "다른 에이전시나 다른 경로를 찾았어요" },
      { value: "price", label: "비용이 부담돼요" },
      { value: "schedule", label: "일정이 맞지 않아요" },
      { value: "not_ready", label: "아직 마음의 준비가 안 됐어요" },
      { value: "other", label: "기타 사유" },
    ],
    declineDetail: "더 남기고 싶은 말씀 (선택)",
    declineDetailHelp: "기타 사유를 선택하셨다면 여기에 직접 적어주세요.",
    declineSubmit: "제출하기",
    declineCancel: "취소",
    declineRequired: "사유를 선택해 주세요.",
    declinedTitle: "진행하지 않는 것으로 접수됐어요",
    declinedBody: "알려주셔서 감사합니다. 신청은 보류 상태로 두고, 다음 단계 안내는 보내지 않겠습니다.",
    declinedReasonLabel: "남겨주신 사유",
    resume: "다시 진행하고 싶어요",
  },
};

function isOnlineMeetingNextAction(nextAction: string): boolean {
  const normalized = nextAction.replace(/\s+/g, " ").trim().toLowerCase();
  if ([
    "온라인 상담 일정 협의",
    "온라인 미팅 일정 협의",
    "zoom 상담 일정 협의",
    "arrange online meeting",
    "arrange online meeting time",
    "schedule online consultation",
    "オンライン相談日程の調整",
    "オンラインミーティング日程の調整",
  ].some((label) => label.toLowerCase() === normalized)) {
    return true;
  }
  return [
    /zoom/i,
    /google\s*meet/i,
    /online\s*(meeting|consultation)/i,
    /온라인\s*(상담|미팅)\s*일정\s*협의/,
    /オンライン\s*(相談|ミーティング)\s*日程の調整/,
  ].some((pattern) => pattern.test(nextAction));
}

function textValue(answers: Answers, key: string): string {
  return typeof answers[key] === "string" ? (answers[key] as string) : "";
}

function arrayValue(answers: Answers, key: string): string[] {
  return Array.isArray(answers[key]) ? (answers[key] as unknown[]).filter((v): v is string => typeof v === "string") : [];
}

export function VisaCasePortal({
  token,
  initial,
  declineRequested = false,
  editRequested = null,
}: {
  token: string;
  initial: VisaCaseInitial;
  declineRequested?: boolean;
  /** 메일에서 "다시 제출" 링크로 들어온 경우 — "slots"면 일정 입력 단계로 바로 연다. */
  editRequested?: "form" | "slots" | null;
}) {
  const router = useRouter();
  const initialLang: Lang = initial.preferredLang === "ja" || initial.preferredLang === "ko" ? initial.preferredLang : "en";
  const [lang, setLang] = useState<Lang>(initialLang);
  const trackingToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("vt");
  }, []);
  const [step, setStep] = useState(editRequested === "slots" ? 2 : 0);
  const [editing, setEditing] = useState(Boolean(editRequested) || !initial.followUpSubmittedAt);
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
  const [declinedAt, setDeclinedAt] = useState<string | null>(initial.declinedAt);
  const [declineReason, setDeclineReason] = useState<string>(initial.declineReason ?? "");
  const [declineDetail, setDeclineDetail] = useState<string>(initial.declineReasonDetail ?? "");
  const [declineOpen, setDeclineOpen] = useState(declineRequested && !initial.declinedAt);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const t = COPY[lang];
  const trackingStartedAt = useRef<number | null>(null);
  const trackingVisitSent = useRef(false);
  const trackingKeysSent = useRef<Set<string>>(new Set());
  const maxScrollDepth = useRef(0);

  const sendTrackingEvent = useCallback((
    eventType: string,
    data: {
      eventKey?: string;
      step?: number | null;
      scrollDepth?: number | null;
      metadata?: Record<string, unknown>;
      beacon?: boolean;
    } = {},
  ) => {
    if (!trackingToken || typeof window === "undefined") return;
    const body = JSON.stringify({
      t: trackingToken,
      eventType,
      eventKey: data.eventKey,
      lang,
      step: data.step ?? null,
      scrollDepth: data.scrollDepth ?? null,
      pagePath: window.location.pathname,
      metadata: data.metadata ?? {},
    });
    if (data.beacon && "sendBeacon" in navigator) {
      navigator.sendBeacon("/api/track/visa-case/event", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/track/visa-case/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Tracking must never interrupt the case form.
    });
  }, [lang, trackingToken]);

  const trackingDurationMs = useCallback(() => {
    if (trackingStartedAt.current == null) trackingStartedAt.current = Date.now();
    return Date.now() - trackingStartedAt.current;
  }, []);

  useEffect(() => {
    if (!trackingToken || trackingVisitSent.current) return;
    trackingStartedAt.current = Date.now();
    trackingVisitSent.current = true;
    sendTrackingEvent("case_visit", {
      eventKey: "initial",
      metadata: {
        preferredLang: initial.preferredLang,
        submitted: Boolean(initial.followUpSubmittedAt),
      },
    });
  }, [initial.followUpSubmittedAt, initial.preferredLang, sendTrackingEvent, trackingToken]);

  useEffect(() => {
    if (!trackingToken) return;
    const key = `language_view:${lang}`;
    if (trackingKeysSent.current.has(key)) return;
    trackingKeysSent.current.add(key);
    sendTrackingEvent("language_view", { eventKey: `lang_${lang}` });
  }, [lang, sendTrackingEvent, trackingToken]);

  useEffect(() => {
    if (!trackingToken) return;
    const currentStep = editing ? step + 1 : 0;
    const eventKey = editing ? `step_${currentStep}` : "submitted_view";
    const key = `step_view:${eventKey}`;
    if (trackingKeysSent.current.has(key)) return;
    trackingKeysSent.current.add(key);
    sendTrackingEvent("step_view", {
      eventKey,
      step: currentStep,
      metadata: { editing, submittedView: !editing },
    });
  }, [editing, sendTrackingEvent, step, trackingToken]);

  useEffect(() => {
    if (!trackingToken || typeof window === "undefined") return;
    const reportDepth = () => {
      const doc = document.documentElement;
      const total = Math.max(doc.scrollHeight, document.body.scrollHeight);
      const seen = window.scrollY + window.innerHeight;
      const depth = total <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((seen / total) * 100)));
      maxScrollDepth.current = Math.max(maxScrollDepth.current, depth);
      for (const threshold of [25, 50, 75, 100]) {
        if (depth < threshold) continue;
        const key = `scroll_depth:${threshold}`;
        if (trackingKeysSent.current.has(key)) continue;
        trackingKeysSent.current.add(key);
        sendTrackingEvent("scroll_depth", {
          eventKey: `scroll_${threshold}`,
          scrollDepth: threshold,
          metadata: { actualDepth: depth },
        });
      }
    };
    reportDepth();
    window.addEventListener("scroll", reportDepth, { passive: true });
    window.addEventListener("resize", reportDepth);
    return () => {
      window.removeEventListener("scroll", reportDepth);
      window.removeEventListener("resize", reportDepth);
    };
  }, [sendTrackingEvent, trackingToken]);

  useEffect(() => {
    if (!trackingToken || typeof window === "undefined") return;
    const sendExit = (eventKey: string) => {
      sendTrackingEvent("case_exit", {
        eventKey,
        step: editing ? step + 1 : 0,
        scrollDepth: maxScrollDepth.current,
        beacon: true,
        metadata: {
          durationMs: trackingDurationMs(),
          editing,
          saved,
          submittedView: !editing,
        },
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") sendExit("visibility_hidden");
    };
    const onPageHide = () => sendExit("pagehide");
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [editing, saved, sendTrackingEvent, step, trackingDurationMs, trackingToken]);

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
        settlementNeeds: settlementNeeds as ("training" | "housing" | "korean" | "banking" | "transport" | "none")[],
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
      sendTrackingEvent("follow_up_submit_success", {
        eventKey: "submit_success",
        step: 3,
        scrollDepth: maxScrollDepth.current,
        beacon: true,
        metadata: {
          durationMs: trackingDurationMs(),
        },
      });
      setSaved(true);
      setEditing(false);
      setStep(0);
      router.refresh();
    });
  };

  const openDecline = useCallback((source: string) => {
    setDeclineOpen(true);
    setDeclineError(null);
    sendTrackingEvent("decline_open", { eventKey: source });
  }, [sendTrackingEvent]);

  // 메일의 "진행하지 않겠습니다" 링크로 들어온 경우는 열림 상태가 이미 서버에서 정해지므로
  // 여기서는 추적 이벤트만 한 번 남긴다.
  useEffect(() => {
    if (!declineRequested || declinedAt) return;
    const key = "decline_open:email_link";
    if (trackingKeysSent.current.has(key)) return;
    trackingKeysSent.current.add(key);
    sendTrackingEvent("decline_open", { eventKey: "email_link" });
  }, [declineRequested, declinedAt, sendTrackingEvent]);

  const submitDecline = () => {
    if (!declineReason) {
      setDeclineError(t.declineRequired);
      return;
    }
    setDeclineError(null);
    startTransition(async () => {
      const result = await submitVisaCaseDeclineAction({
        token,
        reason: declineReason as DeclineReason,
        reasonDetail: declineDetail,
      });
      if (!result.ok) {
        setDeclineError(result.error);
        return;
      }
      sendTrackingEvent("decline_submit_success", {
        eventKey: declineReason,
        beacon: true,
        metadata: { hasDetail: declineDetail.trim().length > 0 },
      });
      setDeclinedAt(result.data?.declinedAt ?? new Date().toISOString());
      setDeclineOpen(false);
      setEditing(false);
      router.refresh();
    });
  };

  const resumeCase = () => {
    setDeclineError(null);
    startTransition(async () => {
      const result = await resumeVisaCaseAction({ token });
      if (!result.ok) {
        setDeclineError(result.error);
        return;
      }
      sendTrackingEvent("resume_after_decline", { eventKey: declineReason || "unknown" });
      setDeclinedAt(null);
      setDeclineOpen(false);
      setEditing(!initial.followUpSubmittedAt);
      router.refresh();
    });
  };

  const declineReasonLabel = t.declineOptions.find((option) => option.value === declineReason)?.label ?? null;

  // 관리자가 next_action 에 직접 적은 안내만 타임라인 아래 메모로 보여준다.
  // 일반 상태 문구(일정 협의)와 내부 자동 문구(결제 링크 발송)는 타임라인이 이미 표현하므로 거른다.
  const journeyNote = (() => {
    const raw = initial.nextAction?.trim();
    if (!raw) return null;
    if (isOnlineMeetingNextAction(raw)) return null;
    if (raw.includes("결제 링크 발송")) return null;
    if (raw.includes("결제 완료") || raw.includes("결제 취소")) return null;
    // 타임라인이 이미 보여주는 일반 상태 문구는 메모로 반복하지 않는다.
    if (/^(온라인\s*(미팅|상담)\s*예정|온라인 미팅 완료.*|Online meeting scheduled|オンラインミーティング予定)$/i.test(raw)) return null;
    return raw;
  })();

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

      {/* 내 여정 타임라인 — 미팅 확정·오디션·결제·Village가 전부 이 안에서 단계별로 보인다. */}
      <VisaJourneyTimeline
        data={{
          followUpSubmittedAt: initial.followUpSubmittedAt,
          caseStage: initial.caseStage,
          meetingAt: initial.meetingAt,
          meetingUrl: initial.meetingUrl,
          auditionAt: initial.auditionAt,
          auditionLocation: initial.auditionLocation,
          auditionStatus: initial.auditionStatus,
          auditionResult: initial.auditionResult,
          auditionEndsAt: initial.auditionEndsAt,
          auditionRsvp: initial.auditionRsvp,
          trainingRequired: initial.trainingRequired,
          trainingPartner: initial.trainingPartner,
          trainingStartDate: initial.trainingStartDate,
          trainingEndDate: initial.trainingEndDate,
          monthlyEvaluationAt: initial.monthlyEvaluationAt,
          monthlyEvaluationResult: initial.monthlyEvaluationResult,
          paymentStatus: initial.paymentStatus,
          paymentProductSlug: initial.paymentProductSlug,
          paymentUrl: initial.paymentUrl,
          paymentAmountKrw: initial.paymentAmountKrw,
          paidAt: initial.paidAt,
          wantsHousing: arrayValue(a, "settlementNeeds").includes("housing"),
          villageDepositStatus: initial.villageDepositStatus,
          villageDepositPaidAt: initial.villageDepositPaidAt,
        }}
        lang={lang}
        nextActionNote={journeyNote}
        caseToken={token}
      />

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

      {declinedAt ? (
        <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-7">
          <div className="flex flex-col items-center text-center">
            <PauseCircle className="size-10 text-amber-600" />
            <h2 className="mt-3 font-bold">{t.declinedTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-2">{t.declinedBody}</p>
          </div>
          {declineReasonLabel ? (
            <div className="mt-5 rounded-xl border border-hairline-2 bg-background p-4">
              <p className="text-xs text-ink-3">{t.declinedReasonLabel}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{declineReasonLabel}</p>
              {declineDetail.trim() ? (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">{declineDetail}</p>
              ) : null}
            </div>
          ) : null}
          {declineError ? <p className="mt-4 text-center text-sm text-rose-600">{declineError}</p> : null}
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={resumeCase}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline-2 bg-background px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {t.resume}
            </button>
          </div>
        </section>
      ) : !editing ? (
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

      {!declinedAt ? (
        declineOpen ? (
          <section className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 md:p-7">
            <div className="flex items-center gap-2">
              <PauseCircle className="size-5 text-amber-600" />
              <h2 className="font-bold">{t.declineTitle}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.declineIntro}</p>
            <div className="mt-5 space-y-5">
              <ChoiceGroup
                label={t.declineReasonLabel}
                options={t.declineOptions}
                value={declineReason}
                onChange={(value) => {
                  setDeclineReason(value);
                  setDeclineError(null);
                }}
              />
              <Field label={t.declineDetail} help={t.declineDetailHelp}>
                <textarea
                  rows={3}
                  value={declineDetail}
                  onChange={(event) => setDeclineDetail(event.target.value)}
                  className="w-full resize-none rounded-xl border border-hairline-2 bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
            {declineError ? <p className="mt-4 text-sm text-rose-600">{declineError}</p> : null}
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setDeclineOpen(false);
                  setDeclineError(null);
                }}
                className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-secondary"
              >
                {t.declineCancel}
              </button>
              <button
                type="button"
                onClick={submitDecline}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t.declineSubmit}
              </button>
            </div>
          </section>
        ) : (
          <section className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-hairline-2 bg-card p-5 text-center">
            <p className="text-sm text-ink-2">{t.declineEntry}</p>
            <button
              type="button"
              onClick={() => openDecline("portal_link")}
              className="text-sm font-semibold text-ink-3 underline underline-offset-4 hover:text-foreground"
            >
              {t.declineEntryCta}
            </button>
          </section>
        )
      ) : null}

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
