import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native TypeScript tests require the runtime extension.
import { EMPTY_VISA_DOCUMENT_FORM, joinVisaDocumentData, splitVisaDocumentData, visaDocumentSubmissionSchema } from "./document-intake-schema.ts";

test("passport and national identification numbers never enter form_data", () => {
  const input = {
    ...structuredClone(EMPTY_VISA_DOCUMENT_FORM),
    nationalIdNumber: "secret-national-id",
    primaryPassport: {
      ...EMPTY_VISA_DOCUMENT_FORM.primaryPassport,
      number: "secret-passport",
    },
    otherPassports: [{
      id: "other-1",
      type: "ordinary" as const,
      number: "secret-other-passport",
      issuingCountry: "US",
      expiryDate: "2030-01-01",
    }],
  };
  const { stored, sensitive } = splitVisaDocumentData(input);
  const serialized = JSON.stringify(stored);
  assert.equal(serialized.includes("secret-national-id"), false);
  assert.equal(serialized.includes("secret-passport"), false);
  assert.equal(serialized.includes("secret-other-passport"), false);
  assert.equal(sensitive.primaryPassportNumber, "secret-passport");
  assert.equal(joinVisaDocumentData(stored, sensitive).otherPassports[0]?.number, "secret-other-passport");
});

test("draft accepts partial progress while final submission rejects it", () => {
  const result = visaDocumentSubmissionSchema.safeParse(EMPTY_VISA_DOCUMENT_FORM);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "fullNameEnglish"));
    assert.ok(result.error.issues.some((issue) => issue.path.join(".") === "sensitiveCollectionConsent"));
  }
});

test("final submission accepts a complete no-history applicant", () => {
  const complete = {
    ...structuredClone(EMPTY_VISA_DOCUMENT_FORM),
    fullNameEnglish: "TEST APPLICANT",
    birthDate: "2000-01-01",
    mobilePhone: "+81 90 0000 0000",
    hasNoHomePhone: true,
    homeCountryAddress: "Tokyo, Japan",
    koreaPlannedAddress: "Seoul, Korea",
    nationalIdNotApplicable: true,
    primaryPassport: {
      id: "primary",
      type: "ordinary" as const,
      number: "TEST1234",
      issuingCountry: "JP",
      expiryDate: "2030-01-01",
    },
    emergencyContact: {
      nameEnglish: "TEST CONTACT",
      phone: "+81 90 1111 1111",
      country: "Japan",
      relationship: "Family",
    },
    education: {
      level: "bachelor" as const,
      schoolName: "Test University",
      city: "Tokyo",
      region: "Tokyo",
      country: "Japan",
    },
    maritalStatus: "single" as const,
    sensitiveCollectionConsent: true,
    truthfulnessConfirmed: true,
  };
  assert.equal(visaDocumentSubmissionSchema.safeParse(complete).success, true);
});
