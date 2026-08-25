export type VisaProgressInput = {
  caseStage: string;
  auditionResult: string;
  monthlyEvaluationResult: string;
  contractStatus: string;
  paymentStatus: string;
  paymentProductSlug: string | null;
  basicDocumentsStatus: string;
  detailedDocumentsStatus: string;
  visaIssuedAt: string | null;
};

export type VisaProgress = {
  activeStep: 1 | 2 | 3 | 4 | 5;
  nextStep: 2 | 3 | 4 | 5 | null;
  percent: number;
  qualified: boolean;
  programPaid: boolean;
};

const BASIC_STAGES = new Set(["visa_documents", "visa_documents_basic"]);
const DETAILED_STAGES = new Set(["visa_documents_detailed", "visa_submitted"]);

export function deriveVisaProgress(input: VisaProgressInput): VisaProgress {
  const qualified =
    input.auditionResult === "pass" || input.monthlyEvaluationResult === "pass";
  const programPaid =
    input.paymentStatus === "paid" && input.paymentProductSlug === "training-and-placement";

  let activeStep: VisaProgress["activeStep"] = 1;
  if (qualified || input.caseStage === "contract_and_payment") activeStep = 2;
  if (
    BASIC_STAGES.has(input.caseStage) ||
    input.basicDocumentsStatus !== "not_started" ||
    (input.contractStatus === "signed" && programPaid)
  ) {
    activeStep = 3;
  }
  if (
    DETAILED_STAGES.has(input.caseStage) ||
    input.detailedDocumentsStatus !== "not_started" ||
    input.basicDocumentsStatus === "complete"
  ) {
    activeStep = 4;
  }
  if (input.caseStage === "complete" || Boolean(input.visaIssuedAt)) activeStep = 5;

  return {
    activeStep,
    nextStep: activeStep === 5 ? null : (activeStep + 1) as 2 | 3 | 4 | 5,
    percent: activeStep * 20,
    qualified,
    programPaid,
  };
}

export const VISA_PROGRESS_LABELS = {
  en: [
    "Audition & level test",
    "Contract & program payment",
    "Basic visa documents",
    "Detailed documents & immigration review",
    "Visa issued",
  ],
  ja: [
    "オーディション・レベルテスト",
    "契約書・プログラム決済",
    "1次基本ビザ書類",
    "2次詳細書類・出入国審査",
    "ビザ発給完了",
  ],
  ko: [
    "오디션·레벨테스트",
    "계약서·프로그램 등록 결제",
    "1차 기본 비자 서류",
    "2차 세부 서류·출입국 심사",
    "비자 발급 완료",
  ],
} as const;
