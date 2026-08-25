import assert from "node:assert/strict";
import test from "node:test";
// Node의 native TypeScript runner는 런타임 확장자가 필요하다.
// @ts-expect-error 프로젝트는 allowImportingTsExtensions를 의도적으로 사용하지 않는다.
import { deriveVisaProgress, type VisaProgressInput } from "./progress.ts";

const base: VisaProgressInput = {
  caseStage: "application_received",
  auditionResult: "pending",
  monthlyEvaluationResult: "pending",
  contractStatus: "not_started",
  paymentStatus: "unpaid",
  paymentProductSlug: null,
  basicDocumentsStatus: "not_started",
  detailedDocumentsStatus: "not_started",
  visaIssuedAt: null,
};

test("신청·미팅은 본 프로그램 진행률에 포함하지 않는다", () => {
  const progress = deriveVisaProgress({ ...base, caseStage: "triage_submitted" });
  assert.equal(progress.activeStep, 1);
  assert.equal(progress.nextStep, 2);
});

test("오디션 또는 월말평가 통과 후 계약·등록 결제 단계로 이동한다", () => {
  assert.equal(deriveVisaProgress({ ...base, auditionResult: "pass" }).activeStep, 2);
  assert.equal(deriveVisaProgress({ ...base, monthlyEvaluationResult: "pass" }).activeStep, 2);
});

test("계약 서명과 프로그램 결제가 모두 확인되면 기본 서류 단계로 이동한다", () => {
  assert.equal(deriveVisaProgress({
    ...base,
    auditionResult: "pass",
    contractStatus: "signed",
    paymentStatus: "paid",
    paymentProductSlug: "training-and-placement",
  }).activeStep, 3);
});

test("기본 서류 완료 후 세부 서류와 출입국 심사를 같은 4단계로 표시한다", () => {
  assert.equal(deriveVisaProgress({ ...base, basicDocumentsStatus: "complete" }).activeStep, 4);
  assert.equal(deriveVisaProgress({ ...base, caseStage: "visa_submitted" }).activeStep, 4);
});

test("공식 발급이 확인된 경우에만 마지막 단계로 이동한다", () => {
  const progress = deriveVisaProgress({ ...base, visaIssuedAt: "2026-08-24T00:00:00.000Z" });
  assert.equal(progress.activeStep, 5);
  assert.equal(progress.nextStep, null);
  assert.equal(progress.percent, 100);
});
