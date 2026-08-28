"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { CheckCircle2, ExternalLink, FileImage, FileText, LoaderCircle, Trash2, Upload } from "lucide-react";
import {
  cleanupVisaAttachmentUploadAction,
  completeVisaAttachmentUploadAction,
  deleteVisaAttachmentAction,
  getVisaAttachmentUrlAction,
  prepareVisaAttachmentUploadAction,
} from "@/app/actions/visa-document-attachments";
import { Button } from "@/components/ui/button";
import { uploadVisaAttachmentToSignedUrl } from "@/lib/storage/visa-document";
import {
  VISA_ACTIVITY_PHOTO_COUNT,
  formatVisaAttachmentSize,
  validateVisaAttachmentMetadata,
  visaAttachmentRequirementsMet,
  type VisaAttachmentKind,
  type VisaDocumentAttachment,
} from "@/lib/visa/document-attachments";
import { visaDocumentCopy, type VisaDocumentLanguage } from "@/lib/visa/document-intake-copy";

const ALL_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
const IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

type Props = {
  applicationId: string;
  language: VisaDocumentLanguage;
  initialAttachments: VisaDocumentAttachment[];
  disabled?: boolean;
  preview?: boolean;
  onCompletenessChange: (complete: boolean) => void;
  onBusyChange: (busy: boolean) => void;
};

function localError(
  error: string,
  copy: ReturnType<typeof visaDocumentCopy>,
): string {
  if (error === "accepted") return copy.attachmentAcceptedError;
  if (error === "slot_occupied") return copy.attachmentSlotConflict;
  return copy.attachmentUploadFailed;
}

export function VisaDocumentAttachments({
  applicationId,
  language,
  initialAttachments,
  disabled = false,
  preview = false,
  onCompletenessChange,
  onBusyChange,
}: Props) {
  const copy = visaDocumentCopy(language);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [busySlots, setBusySlots] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const complete = useMemo(() => visaAttachmentRequirementsMet(attachments), [attachments]);
  const isBusy = busySlots.size > 0;

  useEffect(() => onCompletenessChange(complete), [complete, onCompletenessChange]);
  useEffect(() => onBusyChange(isBusy), [isBusy, onBusyChange]);

  const setSlotBusy = useCallback((slotKey: string, busy: boolean) => {
    setBusySlots((current) => {
      const next = new Set(current);
      if (busy) next.add(slotKey);
      else next.delete(slotKey);
      return next;
    });
  }, []);

  const upload = useCallback(async (
    file: File,
    kind: VisaAttachmentKind,
    sortOrder: number,
  ) => {
    const slotKey = `${kind}:${sortOrder}`;
    const validated = validateVisaAttachmentMetadata({
      kind,
      originalName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!validated.ok) {
      setError(copy.attachmentUploadFailed);
      return false;
    }
    setError("");
    setSlotBusy(slotKey, true);
    try {
      if (preview) {
        const now = new Date().toISOString();
        const previewAttachment: VisaDocumentAttachment = {
          id: crypto.randomUUID(),
          kind,
          sortOrder,
          originalName: file.name,
          mimeType: validated.mimeType,
          sizeBytes: file.size,
          uploadedAt: now,
          viewUrl: URL.createObjectURL(file),
        };
        setAttachments((current) => [
          ...current.filter((item) => !(item.kind === kind && item.sortOrder === sortOrder)),
          previewAttachment,
        ]);
        return true;
      }

      const prepared = await prepareVisaAttachmentUploadAction({
        applicationId,
        kind,
        sortOrder,
        originalName: file.name,
        mimeType: validated.mimeType,
        sizeBytes: file.size,
      });
      if (!prepared.ok) {
        setError(localError(prepared.error, copy));
        return false;
      }
      const uploaded = await uploadVisaAttachmentToSignedUrl({
        file,
        storagePath: prepared.data.storagePath,
        token: prepared.data.token,
        mimeType: prepared.data.mimeType,
      });
      if (!uploaded.ok) {
        await cleanupVisaAttachmentUploadAction({
          applicationId,
          storagePath: prepared.data.storagePath,
        });
        setError(copy.attachmentUploadFailed);
        return false;
      }
      const completed = await completeVisaAttachmentUploadAction({
        applicationId,
        kind,
        sortOrder,
        originalName: file.name,
        mimeType: prepared.data.mimeType,
        sizeBytes: file.size,
        storagePath: prepared.data.storagePath,
      });
      if (!completed.ok) {
        setError(localError(completed.error, copy));
        return false;
      }
      setAttachments((current) => [
        ...current.filter((item) => !(item.kind === kind && item.sortOrder === sortOrder)),
        completed.data,
      ]);
      return true;
    } catch (uploadError) {
      console.error("[visa-attachments] client upload failed", uploadError);
      setError(copy.attachmentUploadFailed);
      return false;
    } finally {
      setSlotBusy(slotKey, false);
    }
  }, [applicationId, copy, preview, setSlotBusy]);

  const chooseFile = useCallback((
    event: ChangeEvent<HTMLInputElement>,
    kind: VisaAttachmentKind,
    sortOrder: number,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file, kind, sortOrder);
  }, [upload]);

  const chooseActivityFiles = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    const used = new Set(
      attachments
        .filter((item) => item.kind === "activity_photo")
        .map((item) => item.sortOrder),
    );
    for (const file of files) {
      const sortOrder = Array.from({ length: VISA_ACTIVITY_PHOTO_COUNT }, (_, index) => index)
        .find((index) => !used.has(index));
      if (sortOrder === undefined) break;
      used.add(sortOrder);
      const uploaded = await upload(file, "activity_photo", sortOrder);
      if (!uploaded) used.delete(sortOrder);
    }
  }, [attachments, upload]);

  const remove = useCallback(async (attachment: VisaDocumentAttachment) => {
    const slotKey = `${attachment.kind}:${attachment.sortOrder}`;
    setError("");
    setSlotBusy(slotKey, true);
    try {
      if (!preview) {
        const result = await deleteVisaAttachmentAction({ applicationId, attachmentId: attachment.id });
        if (!result.ok) {
          setError(result.error === "accepted" ? copy.attachmentAcceptedError : copy.attachmentDeleteFailed);
          return;
        }
      } else if (attachment.viewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.viewUrl);
      }
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } finally {
      setSlotBusy(slotKey, false);
    }
  }, [applicationId, copy, preview, setSlotBusy]);

  const open = useCallback(async (attachment: VisaDocumentAttachment) => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (preview && attachment.viewUrl) {
      if (popup) popup.location.href = attachment.viewUrl;
      else window.open(attachment.viewUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const result = await getVisaAttachmentUrlAction({ applicationId, attachmentId: attachment.id });
    if (!result.ok) {
      popup?.close();
      setError(copy.attachmentUploadFailed);
      return;
    }
    if (popup) popup.location.href = result.data.url;
    else window.open(result.data.url, "_blank", "noopener,noreferrer");
  }, [applicationId, copy, preview]);

  const singleton = (kind: Exclude<VisaAttachmentKind, "activity_photo">) =>
    attachments.find((item) => item.kind === kind) ?? null;
  const activityPhotos = attachments
    .filter((item) => item.kind === "activity_photo")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const fileCard = (
    attachment: VisaDocumentAttachment | null,
    kind: VisaAttachmentKind,
    sortOrder: number,
    title: string,
    hint: string,
    imageOnly: boolean,
    compact = false,
  ) => {
    const slotKey = `${kind}:${sortOrder}`;
    const slotBusy = busySlots.has(slotKey);
    const accept = imageOnly ? IMAGE_FILE_ACCEPT : ALL_FILE_ACCEPT;
    return (
      <article key={slotKey} className="rounded-2xl border border-border bg-background p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">{title}<span className="ml-1 text-destructive">*</span></h3>
            {hint ? <p className="mt-1 text-xs leading-5 text-ink-3">{hint}</p> : null}
          </div>
          {attachment ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : null}
        </div>
        {attachment ? (
          <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted/30">
            {attachment.mimeType.startsWith("image/") && !/hei[cf]/.test(attachment.mimeType) && attachment.viewUrl ? (
              <img src={attachment.viewUrl} alt={title} className={`${compact ? "h-24" : "h-32"} w-full object-cover`} />
            ) : null}
            <div className="flex items-center gap-3 p-3">
              {attachment.mimeType === "application/pdf" ? <FileText className="size-5 shrink-0 text-primary" /> : <FileImage className="size-5 shrink-0 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{attachment.originalName}</p>
                <p className="mt-0.5 text-[11px] text-ink-3">{formatVisaAttachmentSize(attachment.sizeBytes)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border p-3">
              <Button type="button" size="sm" variant="outline" onClick={() => void open(attachment)}>
                <ExternalLink />{copy.openFile}
              </Button>
              {!disabled ? (
                <>
                  {kind !== "activity_photo" ? (
                    <label className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted">
                      <Upload className="size-3.5" />{copy.replaceFile}
                      <input type="file" accept={accept} disabled={slotBusy} className="sr-only" onChange={(event) => chooseFile(event, kind, sortOrder)} />
                    </label>
                  ) : null}
                  <Button type="button" size="sm" variant="destructive" disabled={slotBusy} onClick={() => void remove(attachment)}>
                    <Trash2 />{copy.deleteFile}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <label className={`mt-3 flex min-h-24 items-center justify-center rounded-xl border border-dashed border-primary/35 bg-primary/5 px-4 text-center text-sm font-semibold text-primary ${disabled || slotBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-primary/10"}`}>
            {slotBusy ? <><LoaderCircle className="mr-2 size-4 animate-spin" />{copy.uploadingFile}</> : <><Upload className="mr-2 size-4" />{copy.chooseFile}</>}
            <input type="file" accept={accept} disabled={disabled || slotBusy} className="sr-only" onChange={(event) => chooseFile(event, kind, sortOrder)} />
          </label>
        )}
        {!compact ? <p className="mt-2 text-[11px] leading-4 text-ink-3">{imageOnly ? copy.acceptedImageTypes : copy.acceptedFileTypes}</p> : null}
      </article>
    );
  };

  return (
    <div className="md:col-span-2 space-y-6">
      <p className="text-sm leading-6 text-ink-2">{copy.attachmentsIntro}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {fileCard(singleton("passport_copy"), "passport_copy", 0, copy.passportCopy, copy.passportCopyHint, false)}
        {fileCard(singleton("dancer_profile"), "dancer_profile", 0, copy.dancerProfile, copy.dancerProfileHint, false)}
        {fileCard(singleton("id_photo"), "id_photo", 0, copy.idPhoto, copy.idPhotoHint, true)}
      </div>
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold">{copy.activityPhotos}<span className="ml-1 text-destructive">*</span></h3>
            <p className="mt-1 text-xs leading-5 text-ink-3">{copy.activityPhotosHint}</p>
            <p className="mt-1 text-[11px] leading-4 text-ink-3">{copy.acceptedImageTypes}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className={`text-xs font-bold ${activityPhotos.length === VISA_ACTIVITY_PHOTO_COUNT ? "text-emerald-700" : "text-primary"}`}>
              {copy.activityPhotoProgress(activityPhotos.length)}
            </p>
            {!disabled && activityPhotos.length < VISA_ACTIVITY_PHOTO_COUNT ? (
              <label className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted ${isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                <Upload className="size-3.5" />{copy.addActivityPhotos}
                <input type="file" multiple accept={IMAGE_FILE_ACCEPT} disabled={isBusy} className="sr-only" onChange={(event) => void chooseActivityFiles(event)} />
              </label>
            ) : null}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: VISA_ACTIVITY_PHOTO_COUNT }, (_, sortOrder) => fileCard(
            activityPhotos.find((item) => item.sortOrder === sortOrder) ?? null,
            "activity_photo",
            sortOrder,
            copy.activityPhotoNumber(sortOrder + 1),
            "",
            true,
            true,
          ))}
        </div>
      </section>
      {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
      {!complete ? <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{copy.attachmentIncomplete}</div> : null}
    </div>
  );
}
