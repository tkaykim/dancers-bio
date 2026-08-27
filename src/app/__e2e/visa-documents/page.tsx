import { notFound } from "next/navigation";
import { VisaDocumentIntakeForm } from "@/components/visa/VisaDocumentIntakeForm";
import { EMPTY_VISA_DOCUMENT_FORM } from "@/lib/visa/document-intake-schema";
import type { VisaDocumentIntakeContext } from "@/lib/visa/document-intake";

export default function VisaDocumentsE2EPage() {
  if (process.env.NODE_ENV !== "development") notFound();
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
      <h1 className="text-2xl font-bold">Visa document E2E preview</h1>
      <VisaDocumentIntakeForm context={context} preview />
    </main>
  );
}
