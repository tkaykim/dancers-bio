// 사전 단위 테스트 (docs/design-i18n-ui.md §5.2). 실행: npm run test:i18n
//   - 세 언어 키 집합 일치, 빈 값 없음, {placeholder} 집합 일치, en·ja 에 한글 없음
//   - interpolate: 누락 인자 검출, 상속 속성 미인정, 값 속 중괄호 오탐 없음, vars 미제공 경로
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import { interpolate, placeholdersOf } from "./interpolate.ts";

const HANGUL = /[가-힣]/;
/** en·ja 값에 남아도 되는 한국어(브랜드·고유명사). 여기 없는 한글은 누출로 본다. */
const HANGUL_ALLOWLIST = new Set<string>(["한국어"]);

const dir = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "messages");

type Dict = Record<string, string>;
type Bundle = { ko: Dict; en: Dict; ja: Dict };

async function loadBundles(): Promise<Array<[string, Bundle]>> {
  const out: Array<[string, Bundle]> = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".ts") || file === "index.ts" || file === "quick.ts") continue;
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    const b = mod.default;
    if (!b || typeof b !== "object" || !b.ko || !b.en || !b.ja) continue;
    out.push([file, b as Bundle]);
  }
  return out;
}

test("namespace bundles: keys, values, placeholders, no Hangul in en/ja", async () => {
  const bundles = await loadBundles();
  assert.ok(bundles.length > 0, "no namespace bundles found");
  for (const [file, b] of bundles) {
    const koKeys = Object.keys(b.ko).sort();
    for (const lang of ["en", "ja"] as const) {
      const keys = Object.keys(b[lang]).sort();
      assert.deepEqual(keys, koKeys, `${file}: ${lang} key set differs from ko`);
    }
    for (const lang of ["ko", "en", "ja"] as const) {
      for (const [k, v] of Object.entries(b[lang])) {
        assert.equal(typeof v, "string", `${file}: ${lang}.${k} is not a string`);
        assert.ok(v.trim().length > 0, `${file}: ${lang}.${k} is empty`);
      }
    }
    for (const k of koKeys) {
      const expected = [...placeholdersOf(b.ko[k])].sort();
      for (const lang of ["en", "ja"] as const) {
        const got = [...placeholdersOf(b[lang][k])].sort();
        assert.deepEqual(got, expected, `${file}: placeholders differ for ${lang}.${k}`);
      }
    }
    for (const lang of ["en", "ja"] as const) {
      for (const [k, v] of Object.entries(b[lang])) {
        let text = v;
        for (const w of HANGUL_ALLOWLIST) text = text.replaceAll(w, "");
        assert.ok(!HANGUL.test(text), `${file}: Hangul leaked into ${lang}.${k}: ${v}`);
      }
    }
  }
});

test("interpolate: fills provided vars and leaves missing placeholders", () => {
  const errors: string[] = [];
  const orig = console.error;
  console.error = (msg: unknown) => errors.push(String(msg));
  try {
    assert.equal(interpolate("Hi {name}, {n} left", { name: "Mina", n: 3 }), "Hi Mina, 3 left");
    // 누락 인자 → 자리표시자 유지 + 개발 모드 경고
    assert.equal(interpolate("Hi {name}", {}), "Hi {name}");
    // vars 미제공 경로도 검사한다
    assert.equal(interpolate("Hi {name}"), "Hi {name}");
    // 상속 속성(toString)은 제공된 것으로 보지 않는다
    assert.equal(interpolate("{toString}", {}), "{toString}");
    // 이용자 값에 든 중괄호를 자리표시자로 오인하지 않는다
    assert.equal(interpolate("Name: {name}", { name: "{weird}" }), "Name: {weird}");
    assert.equal(interpolate("plain text"), "plain text");
    assert.ok(errors.length >= 3, "expected missing-placeholder warnings");
  } finally {
    console.error = orig;
  }
});
