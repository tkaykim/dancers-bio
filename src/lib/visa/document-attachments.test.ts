import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native TypeScript tests require the runtime extension.
import { nextAvailableActivitySlot, validateVisaAttachmentMetadata, visaAttachmentRequirementsMet, type VisaDocumentAttachment } from "./document-attachments.ts";

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

test("visa attachment metadata enforces type, size, and image-only slots", () => {
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
    sizeBytes: 10 * 1024 * 1024 + 1,
  }).ok, false);
});

test("submission requires three singleton files and exactly eight activity photos", () => {
  const photos = Array.from({ length: 8 }, (_, index) => attachment("activity_photo", index));
  const complete = [
    attachment("passport_copy"),
    attachment("dancer_profile"),
    attachment("id_photo"),
    ...photos,
  ];
  assert.equal(visaAttachmentRequirementsMet(complete), true);
  assert.equal(visaAttachmentRequirementsMet(complete.slice(0, -1)), false);
  assert.equal(nextAvailableActivitySlot(complete.slice(0, -1)), 7);
  assert.equal(nextAvailableActivitySlot(complete), null);
});
