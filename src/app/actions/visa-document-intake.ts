"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptVisaDocumentSensitiveData } from "@/lib/visa/document-intake-crypto";
import {
  firstVisaDocumentIssue,
  splitVisaDocumentData,
  visaDocumentDraftSchema,
  visaDocumentSubmissionSchema,
  type VisaDocumentFormData,
} from "@/lib/visa/document-intake-schema";

type SaveResult =
  | { ok: true; data: { version: number; lastSavedAt: string; status: string } }
  | { ok: false; error: string; code?: "conflict" | "forbidden"; currentVersion?: number };

const saveSchema = z.object({
  applicationId: z.string().uuid(),
  expectedVersion: z.number().int().min(0),
  data: visaDocumentDraftSchema,
});

async function ownedPaidApplication(applicationId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dancer_visa_applications")
    .select("id, dancer_id, payment_status, payment_meta")
    .eq("id", applicationId)
    .eq("applicant_profile_id", userId)
    .eq("payment_status", "paid")
    .maybeSingle();
  return {
    admin,
    application: data as {
      id: string;
      dancer_id: string | null;
      payment_meta: Record<string, unknown> | null;
    } | null,
  };
}

async function persist(
  applicationId: string,
  expectedVersion: number,
  data: VisaDocumentFormData,
  submit: boolean,
): Promise<SaveResult> {
  const user = await requireUser();
  const owned = await ownedPaidApplication(applicationId, user.id);
  if (!owned.application) {
    return { ok: false, error: "결제가 완료된 본인 케이스만 제출할 수 있습니다.", code: "forbidden" };
  }

  const normalized = structuredClone(data);
  let nationalityCode: string | null = null;
  if (owned.application.dancer_id) {
    const { data: privateInfo } = await owned.admin
      .from("dancer_private_info")
      .select("nationality_code")
      .eq("dancer_id", owned.application.dancer_id)
      .maybeSingle();
    nationalityCode = typeof privateInfo?.nationality_code === "string"
      ? privateInfo.nationality_code.trim().toUpperCase()
      : null;
  }
  const metaNationality = owned.application.payment_meta?.customer_nationality;
  const isJapaneseApplicant = nationalityCode === "JP" ||
    (typeof metaNationality === "string" && /^(jp|jpn|japan|일본|日本)$/i.test(metaNationality.trim()));
  if (isJapaneseApplicant) {
    normalized.nationalIdNumber = "";
    normalized.nationalIdNotApplicable = true;
  }
  const validation = submit
    ? visaDocumentSubmissionSchema.safeParse(normalized)
    : visaDocumentDraftSchema.safeParse(normalized);
  if (!validation.success) {
    const issue = firstVisaDocumentIssue(validation.error);
    return { ok: false, error: issue.message };
  }

  const { stored, sensitive } = splitVisaDocumentData(validation.data);
  let ciphertext: string;
  try {
    ciphertext = encryptVisaDocumentSensitiveData(applicationId, sensitive);
  } catch (error) {
    console.error("[visa-document-intake] encryption unavailable", error);
    return { ok: false, error: "보안 저장 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요." };
  }

  const now = new Date().toISOString();
  const nextVersion = expectedVersion + 1;
  const nextStatus = submit ? "submitted" : "draft";
  const row = {
    application_id: applicationId,
    schema_version: validation.data.schemaVersion,
    status: nextStatus,
    draft_version: nextVersion,
    form_data: stored,
    sensitive_data_ciphertext: ciphertext,
    last_saved_at: now,
    updated_at: now,
    ...(submit ? { submitted_at: now } : {}),
  };

  if (expectedVersion === 0) {
    const { error } = await owned.admin.from("visa_document_intakes").insert(row);
    if (error?.code === "23505") {
      const { data: current } = await owned.admin
        .from("visa_document_intakes")
        .select("draft_version")
        .eq("application_id", applicationId)
        .maybeSingle();
      return {
        ok: false,
        error: "다른 창에서 저장된 변경사항이 있습니다. 페이지를 새로고침해 주세요.",
        code: "conflict",
        currentVersion: Number(current?.draft_version ?? 0),
      };
    }
    if (error) {
      console.error("[visa-document-intake] insert failed", { code: error.code });
      return { ok: false, error: "임시저장에 실패했습니다. 입력 내용은 이 창에 남아 있습니다." };
    }
  } else {
    const { data: updated, error } = await owned.admin
      .from("visa_document_intakes")
      .update(row)
      .eq("application_id", applicationId)
      .eq("draft_version", expectedVersion)
      .neq("status", "accepted")
      .select("draft_version")
      .maybeSingle();
    if (error) {
      console.error("[visa-document-intake] update failed", { code: error.code });
      return { ok: false, error: "임시저장에 실패했습니다. 입력 내용은 이 창에 남아 있습니다." };
    }
    if (!updated) {
      const { data: current } = await owned.admin
        .from("visa_document_intakes")
        .select("draft_version, status")
        .eq("application_id", applicationId)
        .maybeSingle();
      return {
        ok: false,
        error: current?.status === "accepted"
          ? "검토가 완료된 서류는 수정할 수 없습니다."
          : "다른 창에서 저장된 변경사항이 있습니다. 페이지를 새로고침해 주세요.",
        code: current?.status === "accepted" ? "forbidden" : "conflict",
        currentVersion: Number(current?.draft_version ?? expectedVersion),
      };
    }
  }

  if (owned.application.dancer_id) {
    const profilePatch = {
      birth_date: validation.data.birthDate || null,
      phone: validation.data.mobilePhone || null,
      updated_at: now,
    };
    const { error } = await owned.admin
      .from("dancer_private_info")
      .update(profilePatch)
      .eq("dancer_id", owned.application.dancer_id);
    if (error) console.error("[visa-document-intake] profile prefill sync failed", { code: error.code });
  }

  await owned.admin
    .from("dancer_visa_applications")
    .update(submit
      ? {
          basic_documents_status: "reviewing",
          case_stage: "visa_documents_basic",
          status: "documents",
          next_action: "제출 서류 검토 중",
        }
      : { basic_documents_status: "collecting" })
    .eq("id", applicationId);

  revalidatePath("/me/visa");
  revalidatePath("/me/visa/documents");
  return { ok: true, data: { version: nextVersion, lastSavedAt: now, status: nextStatus } };
}

export async function saveVisaDocumentDraftAction(input: unknown): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };
  return persist(parsed.data.applicationId, parsed.data.expectedVersion, parsed.data.data, false);
}

export async function submitVisaDocumentIntakeAction(input: unknown): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "입력값을 확인해 주세요." };
  return persist(parsed.data.applicationId, parsed.data.expectedVersion, parsed.data.data, true);
}
