import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native TypeScript tests require the runtime extension.
import { VISA_DOCUMENT_COPY, VISA_DOCUMENT_LANGUAGES, visaDocumentCopy } from "./document-intake-copy.ts";

test("visa document intake exposes Korean, English, and Japanese", () => {
  assert.deepEqual(VISA_DOCUMENT_LANGUAGES.map((item) => item.value), ["ko", "en", "ja"]);
  assert.equal(visaDocumentCopy("ko").title, "비자 서류 정보");
  assert.equal(visaDocumentCopy("en").title, "Visa document information");
  assert.equal(visaDocumentCopy("ja").title, "ビザ書類情報");
});

test("all visa document languages cover the same fields and eight steps", () => {
  const englishKeys = Object.keys(VISA_DOCUMENT_COPY.en).sort();
  for (const language of VISA_DOCUMENT_LANGUAGES) {
    const copy = visaDocumentCopy(language.value);
    assert.deepEqual(Object.keys(copy).sort(), englishKeys);
    assert.equal(copy.steps.length, 8);
    assert.ok(copy.japanNationalIdHint.length > 0);
    assert.ok(copy.securityReminder.length > 0);
    assert.ok(copy.attachmentIncomplete.length > 0);
    assert.equal(copy.activityPhotoProgress(8).length > 0, true);
  }
});

