import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);

// Compile isolated server modules with explicit boundary mocks; never use local
// credentials, production Supabase, or a real Apify request in these tests.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
function load(file, mocks = {}, globals = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(code, {
    exports: compiledModule.exports, module: compiledModule,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) throw new Error(`Unmocked dependency: ${name}`);
      return nodeRequire(name);
    },
    process: { env: {} }, URL, AbortController, setTimeout, clearTimeout, Date,
    ...globals,
  }, { filename });
  return compiledModule.exports;
}

const types = load("src/lib/rate-check/types.ts");
const forecast = load("src/lib/casting/forecast.ts");
const pricing = load("src/lib/rate-check/pricing.ts", { "../casting/forecast.ts": forecast });
const repository = load("src/lib/rate-check/repository.ts", {
  "@/lib/supabase/admin": { createAdminClient() { throw new Error("DB is mocked"); } },
});

function collector(fetch, timers = {}) {
  return load("src/lib/rate-check/apify.ts", { "./types": types }, {
    process: { env: { RATE_CHECK_APIFY_TOKEN: "fixture-only" } }, fetch, ...timers,
  });
}

function actionHarness({ enabled = false, authenticated = true, replies = [], collect } = {}) {
  const calls = [];
  const tables = [];
  let revalidated = 0;
  const apify = collector(() => { throw new Error("Unexpected network"); });
  const action = load("src/app/actions/rate-check.ts", {
    "next/cache": { revalidatePath(value) { assert.equal(value, "/tools/rate-check"); revalidated++; } },
    "@/lib/auth/guard": { async requireStaff() { calls.push("guard"); if (!authenticated) throw new Error("redirect"); return { id: "member-id", is_admin: false }; } },
    "@/lib/rate-check/pricing": pricing,
    "@/lib/rate-check/types": types,
    "@/lib/rate-check/apify": { ...apify, async collectInstagramRate(handle) { calls.push("collect"); return collect(handle, apify); } },
    "@/lib/rate-check/repository": {
      ...repository,
      rateChecksTable() {
        calls.push("db");
        const query = [];
        tables.push(query);
        const reply = replies.shift() ?? { data: null, error: null };
        const builder = { then(resolve, reject) { return Promise.resolve(reply).then(resolve, reject); } };
        for (const method of ["select", "eq", "is", "gte", "order", "limit", "maybeSingle", "single", "insert"]) {
          builder[method] = (...args) => { query.push([method, ...args]); return builder; };
        }
        return builder;
      },
    },
  }, { process: { env: enabled ? { RATE_CHECK_APIFY_TOKEN: "fixture-only" } : {} } });
  const fd = new FormData();
  fd.set("handle", "@Dancer");
  return { run: () => action.checkInstagramRateAction(fd), fd, calls, tables, revalidated: () => revalidated };
}

const row = {
  id: "row-id", ig_handle: "dancer", followers: 1234, full_name: "Dancer",
  profile_pic_url: null, is_private: false, reels: [], reels_used: 0,
  sample_status: "insufficient", trimmed_mean: null, median_views: null,
  views_low: null, views_high: null, expected_views: null, tier: null,
  f_base: 50000, v_base: null, formula_rate: null,
  created_at: "2026-09-06T00:00:00Z", created_by: "admin-id", error: null,
  creator: { display_name: "관리자" }, raw: { confidential: true },
};

test("guard rejects before DB or collection; form validation precedes DB", async () => {
  const denied = actionHarness({ authenticated: false });
  assert.equal((await denied.run()).error, "관리자 또는 프로젝트 공동관리자만 사용할 수 있습니다.");
  assert.deepEqual(denied.calls, ["guard"]);
  const invalid = actionHarness();
  invalid.fd.set("handle", "bad handle");
  assert.equal((await invalid.run()).ok, false);
  assert.deepEqual(invalid.calls, ["guard"]);
});

test("missing token returns exact message with missing DB table, without collection", async () => {
  const h = actionHarness({ replies: [{ data: null, error: { message: "table missing" } }] });
  assert.equal((await h.run()).error, types.RATE_CHECK_DISABLED);
  assert.ok(!h.calls.includes("collect"));
  const forced = actionHarness();
  forced.fd.set("force", "true");
  assert.equal((await forced.run()).error, types.RATE_CHECK_DISABLED);
  assert.deepEqual(forced.calls, ["guard"]);
});

test("cache works without token, uses successful seven-day rows and excludes raw", async () => {
  const h = actionHarness({ replies: [{ data: row, error: null }] });
  const result = await h.run();
  assert.equal(result.ok, true);
  assert.equal(result.data.cached, true);
  assert.equal(result.data.createdBy, "관리자");
  assert.equal(Object.hasOwn(result.data, "raw"), false);
  assert.deepEqual(h.calls, ["guard", "db"]);
  assert.ok(h.tables[0].some(([method, column, value]) => method === "is" && column === "error" && value === null));
  assert.ok(h.tables[0].some(([method, column]) => method === "gte" && column === "created_at"));
  assert.ok(!repository.RATE_CHECK_COLUMNS.split(",").includes("raw"));
});

test("KST day boundary and 60-count limit fail closed before collection", async () => {
  assert.equal(repository.kstDayStart(new Date("2026-09-05T14:59:59Z")), "2026-09-04T15:00:00.000Z");
  assert.equal(repository.kstDayStart(new Date("2026-09-05T15:00:00Z")), "2026-09-05T15:00:00.000Z");
  for (const reply of [{ count: 60, error: null }, { count: 61, error: null }, { count: null, error: {} }]) {
    const h = actionHarness({ enabled: true, replies: [reply] });
    h.fd.set("force", "true");
    const result = await h.run();
    assert.equal(result.ok, false);
    if (reply.count !== null) assert.match(result.error, /60회/);
    assert.ok(!h.calls.includes("collect"));
  }
});

test("non-admin can make the 60th measurement, bypass cache, save and revalidate", async () => {
  const h = actionHarness({ enabled: true, replies: [{ count: 59, error: null }, { data: row, error: null }],
    collect: async () => ({ profile: { followers: 1234, fullName: "Dancer", profilePicUrl: null }, reels: [], raw: { profile: [{ followersCount: 1234 }] } }),
  });
  h.fd.set("force", "true");
  const result = await h.run();
  assert.equal(result.ok, true);
  assert.equal(result.data.cached, false);
  assert.equal(Object.hasOwn(result.data, "raw"), false);
  const insert = h.tables[1].find(([method]) => method === "insert")[1];
  assert.equal(insert.created_by, "member-id");
  assert.equal(insert.raw.profile[0].followersCount, 1234);
  assert.equal(insert.formula_rate, null);
  assert.equal(h.revalidated(), 1);
});

test("collection errors persist raw, private flag, user and error before returning", async () => {
  const h = actionHarness({ enabled: true, replies: [{ count: 0, error: null }, { error: null }],
    collect: async (_, api) => { throw new api.RateCheckCollectionError("비공개 계정은 측정할 수 없습니다.", { profile: [{ private: true }] }, { isPrivate: true, followers: 10 }); },
  });
  h.fd.set("force", "true");
  assert.match((await h.run()).error, /비공개 계정/);
  const insert = h.tables[1].find(([method]) => method === "insert")[1];
  assert.equal(insert.is_private, true);
  assert.equal(insert.raw.profile[0].private, true);
  assert.equal(insert.created_by, "member-id");
  assert.equal(h.revalidated(), 1);
});

test("Apify profile then reels use exact bodies and retain raw JSON", async () => {
  const requests = [];
  const responses = [[{ followersCount: 12, fullName: "Dancer", profilePicUrl: "https://example.test/pic" }], [{ videoViewCount: 10, likesCount: -1, ownerUsername: "dancer" }]];
  const api = collector(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => responses[requests.length - 1] };
  });
  const result = await api.collectInstagramRate("dancer");
  assert.match(requests[0].url.pathname, /instagram-profile-scraper/);
  assert.match(requests[1].url.pathname, /instagram-reel-scraper/);
  assert.equal(requests[0].url.searchParams.get("timeout"), "90");
  assert.deepEqual(JSON.parse(requests[0].options.body), { usernames: ["dancer"] });
  assert.deepEqual(JSON.parse(requests[1].options.body), { username: ["dancer"], resultsLimit: 12, includeSharesCount: false, includeTranscript: false, includeDownloadedVideo: false });
  assert.equal(result.reels[0].likesCount, null);
  assert.equal(result.raw.reels, responses[1]);
});

test("private, missing and API-error profiles never request reels", async () => {
  for (const payload of [[{ private: true }], [], [{ error: "not_found", errorDescription: "external text" }]]) {
    let calls = 0;
    const api = collector(async () => { calls++; return { ok: true, json: async () => payload }; });
    await assert.rejects(api.collectInstagramRate("dancer"), (error) => error instanceof api.RateCheckCollectionError && error.raw.profile === payload);
    assert.equal(calls, 1);
  }
});

test("HTTP failures, timeout and network errors become safe Korean messages", async () => {
  const http = collector(async () => ({ ok: false, status: 503, json: async () => ({ error: "external" }) }));
  await assert.rejects(http.collectInstagramRate("dancer"), /HTTP 503/);
  const network = collector(async () => { throw new Error("https://api.apify.com/?token=secret"); });
  await assert.rejects(network.collectInstagramRate("dancer"), (error) => /Apify 응답/.test(error.message) && !error.message.includes("secret"));
  const timeout = collector(async (_, options) => { assert.equal(options.signal.aborted, true); throw new Error("abort"); }, {
    setTimeout(callback, delay) { assert.equal(delay, 100_000); callback(); return 1; }, clearTimeout() {},
  });
  await assert.rejects(timeout.collectInstagramRate("dancer"), /Apify 응답 지연/);
});

test("actual page renders the token-disabled banner even when history DB is unavailable", async () => {
  let guarded = false;
  const page = load("src/app/(app)/tools/rate-check/page.tsx", {
    "@/lib/auth/guard": { async requireStaff() { guarded = true; return { id: "member-id", is_admin: false }; } },
    "@/lib/rate-check/types": types,
    "@/lib/rate-check/repository": { ...repository, rateChecksTable() { assert.equal(guarded, true); throw new Error("Missing table"); } },
    "@/components/admin/rate-check/RateCheckConsole": { RateCheckConsole: ({ historyError }) => React.createElement("p", null, historyError) },
  });
  const html = renderToStaticMarkup(await page.default());
  assert.ok(html.includes(types.RATE_CHECK_DISABLED));
  assert.ok(html.includes("페이 산정 (음원 챌린지 기준)"));
  assert.ok(html.includes("조회 기록을 불러오지 못했습니다."));
  assert.ok(html.includes("↳ 도구 / 페이 산정"));
});

test("tools page rejects unauthenticated access before loading shared history", async () => {
  const page = load("src/app/(app)/tools/rate-check/page.tsx", {
    "@/lib/auth/guard": { async requireStaff() { throw new Error("login redirect"); } },
    "@/lib/rate-check/types": types,
    "@/lib/rate-check/repository": { ...repository, rateChecksTable() { assert.fail("Unauthenticated history read"); } },
    "@/components/admin/rate-check/RateCheckConsole": {},
  });
  await assert.rejects(page.default(), /login redirect/);
});

test("legacy admin page redirects to tools page", () => {
  const page = load("src/app/(app)/admin/rate-check/page.tsx", {
    "next/navigation": { redirect(value) { assert.equal(value, "/tools/rate-check"); throw new Error("redirect"); } },
  });
  assert.throws(() => page.default(), /redirect/);
});
