import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native TypeScript tests require the runtime extension.
import { nextAvailableActivitySlot, shouldOptimizeVisaImage, validateVisaAttachmentMetadata, visaAttachmentRequirementsMet, type VisaDocumentAttachment } from "./document-attachments.ts";
// @ts-expect-error Native TypeScript tests require the runtime extension.
import { visaDocumentResumableEndpoint } from "../storage/visa-document-endpoint.ts";

function attachment(
  kind: VisaDocumentAttachment["kind"],
  sortOrder = 0,
): VisaDocumentAttachment {
  return {
    id: `${kind}-${sortOrder}`,
    kind,
    sortOrder,
    originalName: `${kind}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    uploadedAt: "2026-08-28T00:00:00.000Z",
    viewUrl: null,
  };
}

test("visa attachment metadata enforces type and image-only slots without a 10 MB ceiling", () => {
  assert.deepEqual(validateVisaAttachmentMetadata({
    kind: "passport_copy",
    originalName: "passport.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
  }), { ok: true, mimeType: "application/pdf", extension: "pdf" });
  assert.equal(validateVisaAttachmentMetadata({
    kind: "id_photo",
    originalName: "photo.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
  }).ok, false);
  assert.equal(validateVisaAttachmentMetadata({
    kind: "activity_photo",
    originalName: "photo.heic",
    mimeType: "",
    sizeBytes: 1024,
  }).ok, true);
  assert.equal(validateVisaAttachmentMetadata({
    kind: "dancer_profile",
    originalName: "profile.pdf",
    mimeType: "application/pdf",
    sizeBytes: 100 * 1024 * 1024,
  }).ok, true);
});

test("submission requires three singleton files and at least four activity photos", () => {
  const photos = Array.from({ length: 4 }, (_, index) => attachment("activity_photo", index));
  const complete = [
    attachment("passport_copy"),
    attachment("dancer_profile"),
    attachment("id_photo"),
    ...photos,
  ];
  assert.equal(visaAttachmentRequirementsMet(complete), true);
  assert.equal(visaAttachmentRequirementsMet(complete.slice(0, -1)), false);
  assert.equal(visaAttachmentRequirementsMet([
    ...complete,
    attachment("activity_photo", 4),
  ]), true);
  assert.equal(nextAvailableActivitySlot(complete.slice(0, -1)), 3);
  assert.equal(nextAvailableActivitySlot(complete), 4);
});

test("large browser-compatible photos are selected for automatic optimization", () => {
  assert.equal(shouldOptimizeVisaImage({
    name: "activity.jpg",
    type: "image/jpeg",
    size: 7 * 1024 * 1024,
  }), true);
  assert.equal(shouldOptimizeVisaImage({
    name: "profile.pdf",
    type: "application/pdf",
    size: 100 * 1024 * 1024,
  }), false);
  assert.equal(shouldOptimizeVisaImage({
    name: "activity.heic",
    type: "image/heic",
    size: 20 * 1024 * 1024,
  }), false);
});

test("signed resumable uploads use the direct storage sign endpoint", () => {
  assert.equal(
    visaDocumentResumableEndpoint("https://project-ref.supabase.co"),
    "https://project-ref.storage.supabase.co/storage/v1/upload/resumable/sign",
  );
});
