import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { PHONE_COUNTRY_OPTIONS, inferPhoneCountry, parseInternationalPhone } from "./phone.ts";

test("normalizes a Korean national number to E.164", () => {
  const result = parseInternationalPhone("010-1234-5678", "KR");
  assert.deepEqual(result, { ok: true, e164: "+821012345678", country: "KR" });
});

test("normalizes an international number using its selected country", () => {
  const result = parseInternationalPhone("(415) 555-2671", "US");
  assert.deepEqual(result, { ok: true, e164: "+14155552671", country: "US" });
});

test("accepts a pasted E.164 number regardless of the selected country", () => {
  const result = parseInternationalPhone("+66 81 234 5678", "KR");
  assert.deepEqual(result, { ok: true, e164: "+66812345678", country: "TH" });
});

test("rejects an invalid or incomplete number", () => {
  const result = parseInternationalPhone("123", "US");
  assert.equal(result.ok, false);
});

test("infers the country from E.164 and supports legacy Korean values", () => {
  assert.equal(inferPhoneCountry("+14155552671"), "US");
  assert.equal(inferPhoneCountry("010-1234-5678"), "KR");
});

test("provides readable names for the complete country selector", () => {
  assert.ok(PHONE_COUNTRY_OPTIONS.length > 200);
  assert.equal(PHONE_COUNTRY_OPTIONS.find(({ code }) => code === "DE")?.label, "Germany");
});
