import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { VisaDocumentIntakeForm } from "@/components/visa/VisaDocumentIntakeForm";
import { EMPTY_VISA_DOCUMENT_FORM } from "@/lib/visa/document-intake-schema";
import type { VisaDocumentIntakeContext } from "@/lib/visa/document-intake";

export const metadata: Metadata = {
  title: "Visa document intake preview | deetz",
  robots: {
    index: false,
    follow: false,
  },
};

export default function VisaDocumentsE2EPage() {
  if (process.env.VISA_DOCUMENT_E2E_PREVIEW !== "1") notFound();
  const context: VisaDocumentIntakeContext = {
    applicationId: "00000000-0000-4000-8000-000000000001",
    email: "e2e-applicant@example.com",
    primaryNationalityCode: "JP",
    primaryNationalityLabel: "Japan",
    draftVersion: 4,
    status: "draft",
    lastSavedAt: null,
    submittedAt: null,
    initialData: {
      ...structuredClone(EMPTY_VISA_DOCUMENT_FORM),
      fullNameEnglish: "E2E APPLICANT",
      birthDate: "2000-01-01",
      mobilePhone: "+81 90 0000 0000",
      hasNoHomePhone: true,
      homeCountryAddress: "Tokyo, Japan",
      koreaPlannedAddress: "Seoul, Korea",
      nationalIdNotApplicable: true,
      primaryPassport: {
        id: "primary",
        type: "ordinary",
        number: "E2ETEST123",
        issuingCountry: "JP",
        expiryDate: "2032-01-01",
      },
      emergencyContact: {
        nameEnglish: "E2E CONTACT",
        phone: "+81 90 1111 1111",
        country: "Japan",
        relationship: "Family",
      },
      education: {
        level: "bachelor",
        schoolName: "E2E University",
        city: "Tokyo",
        region: "Tokyo",
        country: "Japan",
      },
      maritalStatus: "single",
      sensitiveCollectionConsent: true,
      truthfulnessConfirmed: true,
    },
  };
  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        <p className="font-bold">관리자 검토용 미리보기입니다.</p>
        <p>화면에서 입력하거나 제출한 내용은 운영 DB에 저장되지 않습니다.</p>
        <p className="mt-1 text-xs">Admin preview only. Changes and submissions on this page are not saved to the production database.</p>
      </div>
      <h1 className="mt-6 text-2xl font-bold">Visa document information</h1>
      <VisaDocumentIntakeForm context={context} preview />
    </main>
  );
}
