"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  VISA_ATTACHMENT_KINDS,
  VISA_ATTACHMENT_MAX_SORT_ORDER,
  VISA_DOCUMENTS_BUCKET,
  validateVisaAttachmentMetadata,
  type VisaAttachmentKind,
  type VisaDocumentAttachment,
} from "@/lib/visa/document-attachments";
import { isPaidVisaDocumentCase } from "@/lib/visa/document-products";

type AttachmentActionError =
  | "accepted"
  | "forbidden"
  | "invalid_file"
  | "slot_occupied"
  | "storage_error"
  | "not_found";

type AttachmentResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: AttachmentActionError; detail?: string };

const prepareSchema = z.object({
  applicationId: z.string().uuid(),
  kind: z.enum(VISA_ATTACHMENT_KINDS),
  sortOrder: z.number().int().min(0).max(VISA_ATTACHMENT_MAX_SORT_ORDER),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
});

const completeSchema = prepareSchema.extend({
  storagePath: z.string().trim().min(1).max(500),
});

const attachmentSchema = z.object({
  applicationId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

const cleanupSchema = z.object({
  applicationId: z.string().uuid(),
  storagePath: z.string().trim().min(1).max(500),
});

type ApplicationRow = {
  id: string;
  applicant_profile_id: string | null;
  dancer_id: string | null;
  payment_status: string | null;
  payment_meta: Record<string, unknown> | null;
  program_product_slug: string | null;
};

type AttachmentRow = {
  id: string;
  application_id: string;
  kind: VisaAttachmentKind;
  sort_order: number;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

function toAttachment(row: AttachmentRow, viewUrl: string | null): VisaDocumentAttachment {
  return {
    id: row.id,
    kind: row.kind,
    sortOrder: row.sort_order,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.created_at,
    viewUrl,
  };
}

function expectedSortOrder(kind: VisaAttachmentKind, sortOrder: number): number | null {
  if (kind === "activity_photo") {
    return sortOrder >= 0 && sortOrder <= VISA_ATTACHMENT_MAX_SORT_ORDER ? sortOrder : null;
  }
  return sortOrder === 0 ? 0 : null;
}

function isExpectedStoragePath(applicationId: string, kind: VisaAttachmentKind, path: string): boolean {
  return path.startsWith(`${applicationId}/${kind}/`) && !path.includes("..") && !path.includes("\\");
}

async function ownedEditablePaidApplication(applicationId: string, userId: string) {
  const admin = createAdminClient();
  const [{ data: applicationRaw }, { data: intake }] = await Promise.all([
    admin
      .from("dancer_visa_applications")
      .select("id, applicant_profile_id, dancer_id, payment_status, payment_meta, program_product_slug")
      .eq("id", applicationId)
      .eq("applicant_profile_id", userId)
      .eq("payment_status", "paid")
      .maybeSingle(),
    admin
      .from("visa_document_intakes")
      .select("status")
      .eq("application_id", applicationId)
      .maybeSingle(),
  ]);
  const application = applicationRaw as ApplicationRow | null;
  if (!application || !isPaidVisaDocumentCase(application)) {
    return { ok: false as const, admin, error: "forbidden" as const };
  }
  if (intake?.status === "accepted") {
    return { ok: false as const, admin, error: "accepted" as const };
  }
  return { ok: true as const, admin, application };
}

async function canReadApplication(applicationId: string, userId: string) {
  const admin = createAdminClient();
  const [{ data: profile }, { data: application }] = await Promise.all([
    admin.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
    admin
      .from("dancer_visa_applications")
      .select("applicant_profile_id")
      .eq("id", applicationId)
      .maybeSingle(),
  ]);
  return {
    admin,
    allowed: profile?.is_admin === true || application?.applicant_profile_id === userId,
  };
}

export async function prepareVisaAttachmentUploadAction(
  input: unknown,
): Promise<AttachmentResult<{ storagePath: string; token: string; mimeType: string }>> {
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_file" };
  const sortOrder = expectedSortOrder(parsed.data.kind, parsed.data.sortOrder);
  const validated = validateVisaAttachmentMetadata(parsed.data);
  if (sortOrder === null || !validated.ok) {
    return { ok: false, error: "invalid_file", detail: validated.ok ? undefined : validated.error };
  }

  const user = await requireUser();
  const owned = await ownedEditablePaidApplication(parsed.data.applicationId, user.id);
  if (!owned.ok) return { ok: false, error: owned.error };

  if (parsed.data.kind === "activity_photo") {
    const { data: occupied } = await owned.admin
      .from("visa_document_attachments")
      .select("id")
      .eq("application_id", parsed.data.applicationId)
      .eq("kind", parsed.data.kind)
      .eq("sort_order", sortOrder)
      .maybeSingle();
    if (occupied) return { ok: false, error: "slot_occupied" };
  }

  const storagePath = `${parsed.data.applicationId}/${parsed.data.kind}/${sortOrder}-${randomUUID()}.${validated.extension}`;
  const { data, error } = await owned.admin.storage
    .from(VISA_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (error || !data?.token) {
    console.error("[visa-attachments] signed upload URL failed", { code: error?.statusCode });
    return { ok: false, error: "storage_error" };
  }
  return { ok: true, data: { storagePath, token: data.token, mimeType: validated.mimeType } };
}

export async function completeVisaAttachmentUploadAction(
  input: unknown,
): Promise<AttachmentResult<VisaDocumentAttachment>> {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_file" };
  const sortOrder = expectedSortOrder(parsed.data.kind, parsed.data.sortOrder);
  const validated = validateVisaAttachmentMetadata(parsed.data);
  if (
    sortOrder === null
    || !validated.ok
    || !isExpectedStoragePath(parsed.data.applicationId, parsed.data.kind, parsed.data.storagePath)
  ) {
    return { ok: false, error: "invalid_file" };
  }

  const user = await requireUser();
  const owned = await ownedEditablePaidApplication(parsed.data.applicationId, user.id);
  if (!owned.ok) return { ok: false, error: owned.error };

  const slash = parsed.data.storagePath.lastIndexOf("/");
  const folder = parsed.data.storagePath.slice(0, slash);
  const fileName = parsed.data.storagePath.slice(slash + 1);
  const { data: storedObjects, error: listError } = await owned.admin.storage
    .from(VISA_DOCUMENTS_BUCKET)
    .list(folder, { limit: 10, search: fileName });
  const storedObject = storedObjects?.find((item) => item.name === fileName);
  if (listError || !storedObject) return { ok: false, error: "storage_error" };
  const actualSizeBytes = Number(storedObject.metadata?.size ?? 0);
  const actualMimeType = typeof storedObject.metadata?.mimetype === "string"
    ? storedObject.metadata.mimetype
    : "";
  const actualValidation = validateVisaAttachmentMetadata({
    kind: parsed.data.kind,
    originalName: parsed.data.originalName,
    mimeType: actualMimeType,
    sizeBytes: actualSizeBytes,
  });
  if (
    !actualValidation.ok
    || actualValidation.mimeType !== validated.mimeType
    || actualSizeBytes !== parsed.data.sizeBytes
  ) {
    await owned.admin.storage.from(VISA_DOCUMENTS_BUCKET).remove([parsed.data.storagePath]);
    return { ok: false, error: "invalid_file" };
  }

  const { data: existingRaw } = await owned.admin
    .from("visa_document_attachments")
    .select("id, storage_path")
    .eq("application_id", parsed.data.applicationId)
    .eq("kind", parsed.data.kind)
    .eq("sort_order", sortOrder)
    .maybeSingle();
  const existing = existingRaw as { id: string; storage_path: string } | null;
  if (existing && parsed.data.kind === "activity_photo") {
    await owned.admin.storage.from(VISA_DOCUMENTS_BUCKET).remove([parsed.data.storagePath]);
    return { ok: false, error: "slot_occupied" };
  }

  const row = {
    application_id: parsed.data.applicationId,
    kind: parsed.data.kind,
    sort_order: sortOrder,
    storage_path: parsed.data.storagePath,
    original_name: parsed.data.originalName,
    mime_type: actualValidation.mimeType,
    size_bytes: actualSizeBytes,
    uploaded_by: user.id,
  };
  const { data: savedRaw, error: saveError } = await owned.admin
    .from("visa_document_attachments")
    .upsert(row, { onConflict: "application_id,kind,sort_order" })
    .select("id, application_id, kind, sort_order, storage_path, original_name, mime_type, size_bytes, created_at")
    .single();
  if (saveError || !savedRaw) {
    await owned.admin.storage.from(VISA_DOCUMENTS_BUCKET).remove([parsed.data.storagePath]);
    console.error("[visa-attachments] metadata save failed", { code: saveError?.code });
    return { ok: false, error: "storage_error" };
  }

  if (existing?.storage_path && existing.storage_path !== parsed.data.storagePath) {
    const { error: removeError } = await owned.admin.storage
      .from(VISA_DOCUMENTS_BUCKET)
      .remove([existing.storage_path]);
    if (removeError) console.error("[visa-attachments] replaced object cleanup failed", { code: removeError.statusCode });
  }
  const saved = savedRaw as AttachmentRow;
  const { data: signed } = await owned.admin.storage
    .from(VISA_DOCUMENTS_BUCKET)
    .createSignedUrl(saved.storage_path, 3600);
  revalidatePath("/me/visa/documents");
  revalidatePath(`/admin/visa/${parsed.data.applicationId}/documents`);
  return { ok: true, data: toAttachment(saved, signed?.signedUrl ?? null) };
}

export async function cleanupVisaAttachmentUploadAction(input: unknown): Promise<AttachmentResult> {
  const parsed = cleanupSchema.safeParse(input);
  if (!parsed.success || !parsed.data.storagePath.startsWith(`${parsed.data.applicationId}/`)) {
    return { ok: false, error: "invalid_file" };
  }
  const user = await requireUser();
  const owned = await ownedEditablePaidApplication(parsed.data.applicationId, user.id);
  if (!owned.ok) return { ok: false, error: owned.error };
  const { data: registered } = await owned.admin
    .from("visa_document_attachments")
    .select("id")
    .eq("application_id", parsed.data.applicationId)
    .eq("storage_path", parsed.data.storagePath)
    .maybeSingle();
  if (registered) return { ok: false, error: "invalid_file" };
  await owned.admin.storage.from(VISA_DOCUMENTS_BUCKET).remove([parsed.data.storagePath]);
  return { ok: true };
}

export async function deleteVisaAttachmentAction(input: unknown): Promise<AttachmentResult> {
  const parsed = attachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_file" };
  const user = await requireUser();
  const owned = await ownedEditablePaidApplication(parsed.data.applicationId, user.id);
  if (!owned.ok) return { ok: false, error: owned.error };

  const { data: attachmentRaw } = await owned.admin
    .from("visa_document_attachments")
    .select("id, storage_path")
    .eq("id", parsed.data.attachmentId)
    .eq("application_id", parsed.data.applicationId)
    .maybeSingle();
  const attachment = attachmentRaw as { id: string; storage_path: string } | null;
  if (!attachment) return { ok: false, error: "not_found" };
  const { error: deleteError } = await owned.admin
    .from("visa_document_attachments")
    .delete()
    .eq("id", attachment.id)
    .eq("application_id", parsed.data.applicationId);
  if (deleteError) return { ok: false, error: "storage_error" };
  const { error: removeError } = await owned.admin.storage
    .from(VISA_DOCUMENTS_BUCKET)
    .remove([attachment.storage_path]);
  if (removeError) console.error("[visa-attachments] deleted object cleanup failed", { code: removeError.statusCode });
  revalidatePath("/me/visa/documents");
  revalidatePath(`/admin/visa/${parsed.data.applicationId}/documents`);
  return { ok: true };
}

export async function getVisaAttachmentUrlAction(
  input: unknown,
): Promise<AttachmentResult<{ url: string }>> {
  const parsed = attachmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_file" };
  const user = await requireUser();
  const access = await canReadApplication(parsed.data.applicationId, user.id);
  if (!access.allowed) return { ok: false, error: "forbidden" };
  const { data: attachment } = await access.admin
    .from("visa_document_attachments")
    .select("storage_path")
    .eq("id", parsed.data.attachmentId)
    .eq("application_id", parsed.data.applicationId)
    .maybeSingle();
  if (!attachment) return { ok: false, error: "not_found" };
  const { data, error } = await access.admin.storage
    .from(VISA_DOCUMENTS_BUCKET)
    .createSignedUrl(attachment.storage_path, 300);
  if (error || !data?.signedUrl) return { ok: false, error: "storage_error" };
  return { ok: true, data: { url: data.signedUrl } };
}
