// 언어 결정 규칙 단위 테스트 (docs/design-i18n-ui.md §3.1). 실행: npm run test:i18n
import { test } from "node:test";
import assert from "node:assert/strict";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { detectLocaleFromText, isForcedKoPath, localeFromAcceptLanguage, resolveLocale, resolveRequestedLocale } from "./locale.ts";

test("requested locale: ?lang → cookie → Accept-Language → ko", () => {
  assert.equal(resolveRequestedLocale({ queryLang: "ja", cookieLang: "en", acceptLanguage: "ko" }), "ja");
  assert.equal(resolveRequestedLocale({ queryLang: "xx", cookieLang: "en", acceptLanguage: "ko" }), "en");
  assert.equal(resolveRequestedLocale({ queryLang: null, cookieLang: null, acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8" }), "ja");
  assert.equal(resolveRequestedLocale({ queryLang: null, cookieLang: null, acceptLanguage: "fr-FR,fr;q=0.9" }), "ko");
  assert.equal(resolveRequestedLocale({}), "ko");
});

test("Accept-Language picks the highest-q known language", () => {
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9,ko;q=0.8"), "en");
  assert.equal(localeFromAcceptLanguage("ko-KR,ko;q=0.9,en-US;q=0.8"), "ko");
  assert.equal(localeFromAcceptLanguage("ja"), "ja");
  assert.equal(localeFromAcceptLanguage(null), null);
});

test("forced ko paths use segment boundaries", () => {
  assert.equal(isForcedKoPath("/admin"), true);
  assert.equal(isForcedKoPath("/admin/dancers"), true);
  assert.equal(isForcedKoPath("/ops/events/x"), true);
  assert.equal(isForcedKoPath("/ndol/20260618/pass"), true);
  assert.equal(isForcedKoPath("/channels/abc"), true);
  assert.equal(isForcedKoPath("/administer"), false);
  assert.equal(isForcedKoPath("/projects/x/applicants"), false);
  assert.equal(isForcedKoPath("/feed"), false);
});

test("project text detection: hangul ratio decides ko/en, short text is undecided", () => {
  assert.equal(detectLocaleFromText("[China Tour] Male Idol Solo Concert Dancer Audition"), "en");
  assert.equal(detectLocaleFromText("뮤직비디오 백업댄서 4인 모집합니다"), "ko");
  assert.equal(detectLocaleFromText("짧은 제목"), null);
});

test("resolveLocale: text first, then fallback, then Accept-Language, then ko", () => {
  assert.equal(resolveLocale({ text: ["뮤직비디오 백업댄서 4인 모집합니다"], fallback: "ja" }), "ko");
  assert.equal(resolveLocale({ text: ["짧은 제목"], fallback: "ja" }), "ja");
  assert.equal(resolveLocale({ text: ["짧은 제목"], acceptLanguage: "en" }), "en");
  assert.equal(resolveLocale({}), "ko");
});
