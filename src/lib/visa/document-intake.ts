import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadMemberVisaAccess, type MemberVisaApplication } from "./member-case";
import {
  EMPTY_VISA_DOCUMENT_FORM,
  joinVisaDocumentData,
  type VisaDocumentFormData,
} from "./document-intake-schema";
import { decryptVisaDocumentSensitiveData } from "./document-intake-crypto";
import { isPaidVisaDocumentCase } from "./document-products";

export type VisaDocumentIntakeStatus = "draft" | "submitted" | "needs_revision" | "accepted";

export type VisaDocumentIntakeContext = {
  applicationId: string;
  email: string;
  primaryNationalityCode: string | null;
  primaryNationalityLabel: string | null;
  initialData: VisaDocumentFormData;
  draftVersion: number;
  status: VisaDocumentIntakeStatus;
  lastSavedAt: string | null;
  submittedAt: string | null;
};

type PrivateInfoRow = {
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  nationality_code: string | null;
  nationalities: unknown;
};

function stringMeta(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstNationalityLabel(privateInfo: PrivateInfoRow | null): string | null {
  if (privateInfo?.nationality?.trim()) return privateInfo.nationality.trim();
  if (!Array.isArray(privateInfo?.nationalities)) return null;
  for (const value of privateInfo.nationalities) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const item = value as Record<string, unknown>;
      for (const key of ["name", "label", "country", "code"]) {
        if (typeof item[key] === "string" && item[key].trim()) return item[key].trim();
      }
    }
  }
  return null;
}

export async function loadVisaDocumentIntakeContext(
  userId: string,
): Promise<VisaDocumentIntakeContext | null> {
  const access = await loadMemberVisaAccess(userId);
  if (!access.eligible) return null;

  const admin = createAdminClient();
  const { data: applicationsRaw } = await admin
    .from("dancer_visa_applications")
    .select("*")
    .eq("applicant_profile_id", userId)
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(20);
  const applications = (applicationsRaw ?? []) as unknown as MemberVisaApplication[];
  const application = applications.find(isPaidVisaDocumentCase) ?? null;
  if (!application) return null;

  const [{ data: privateInfoRaw }, { data: dancerRaw }, { data: profileRaw }, { data: intakeRaw }] =
    await Promise.all([
      application.dancer_id
        ? admin
            .from("dancer_private_info")
            .select("birth_date, phone, email, nationality, nationality_code, nationalities")
            .eq("dancer_id", application.dancer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      application.dancer_id
        ? admin
            .from("dancers")
            .select("stage_name, korean_name")
            .eq("id", application.dancer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from("profiles").select("display_name, phone").eq("id", userId).maybeSingle(),
      admin
        .from("visa_document_intakes")
        .select(
          "application_id, status, draft_version, form_data, sensitive_data_ciphertext, last_saved_at, submitted_at",
        )
        .eq("application_id", application.id)
        .maybeSingle(),
    ]);

  const privateInfo = privateInfoRaw as PrivateInfoRow | null;
  const dancer = dancerRaw as { stage_name: string | null; korean_name: string | null } | null;
  const profile = profileRaw as { display_name: string | null; phone: string | null } | null;
  const intake = intakeRaw as {
    status: VisaDocumentIntakeStatus;
    draft_version: number;
    form_data: unknown;
    sensitive_data_ciphertext: string | null;
    last_saved_at: string | null;
    submitted_at: string | null;
  } | null;
  const paymentMeta = application.payment_meta ?? {};
  const primaryNationalityCode = privateInfo?.nationality_code?.trim().toUpperCase() || null;
  const primaryNationalityLabel =
    firstNationalityLabel(privateInfo) ?? stringMeta(paymentMeta, "customer_nationality");
  const namePrefill =
    stringMeta(paymentMeta, "customer_name") ??
    dancer?.stage_name?.trim() ??
    profile?.display_name?.trim() ??
    dancer?.korean_name?.trim() ??
    "";
  const phonePrefill =
    privateInfo?.phone?.trim() ??
    profile?.phone?.trim() ??
    stringMeta(paymentMeta, "customer_phone") ??
    "";
  const prefill: Partial<VisaDocumentFormData> = {
    ...EMPTY_VISA_DOCUMENT_FORM,
    preferredLang:
      application.preferred_lang === "ja" || application.preferred_lang === "ko"
        ? application.preferred_lang
        : "en",
    fullNameEnglish: namePrefill,
    birthDate: privateInfo?.birth_date ?? "",
    mobilePhone: phonePrefill,
    primaryPassport: {
      ...EMPTY_VISA_DOCUMENT_FORM.primaryPassport,
      issuingCountry: primaryNationalityCode ?? primaryNationalityLabel ?? "",
    },
  };
  const sensitive = intake?.sensitive_data_ciphertext
    ? decryptVisaDocumentSensitiveData(application.id, intake.sensitive_data_ciphertext)
    : null;
  const initialData = joinVisaDocumentData(intake?.form_data, sensitive, prefill);
  if (primaryNationalityCode === "JP") {
    initialData.nationalIdNumber = "";
    initialData.nationalIdNotApplicable = true;
  }

  return {
    applicationId: application.id,
    email: application.email,
    primaryNationalityCode,
    primaryNationalityLabel,
    initialData,
    draftVersion: intake?.draft_version ?? 0,
    status: intake?.status ?? "draft",
    lastSavedAt: intake?.last_saved_at ?? null,
    submittedAt: intake?.submitted_at ?? null,
  };
}
