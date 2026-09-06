import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node TypeScript imports require the extension.
import { calculateRate, followerBase, normalizeInstagramHandle, parseInstagramHandleLines, viewBase } from "./pricing.ts";

const reels = (counts: number[]) => counts.map((plays, index) => ({
  shortCode: `reel${index}`, timestamp: new Date(Date.UTC(2026, 8, index + 1)).toISOString(), videoPlayCount: plays,
}));

test("normalizes bare, @, URL, query and uppercase handles", () => {
  for (const [input, expected] of [
    ["dancer", "dancer"], [" @Dancer.Name_ ", "dancer.name_"],
    ["https://www.instagram.com/Dancer/", "dancer"],
    ["instagram.com/dancer?igsh=abc", "dancer"], ["DANCER", "dancer"],
    ["https://instagram.com/dancer/reels/", "dancer"],
  ]) assert.equal(normalizeInstagramHandle(input), expected);
});

test("rejects invalid, empty, foreign URL and overlong handles", () => {
  for (const input of ["", "@", "한글", "two words", "a-b", "a".repeat(31), "https://evil.example/dancer", "https://www.instagram.com/", "@@dancer"]) {
    assert.equal(normalizeInstagramHandle(input), null, input);
  }
  assert.equal(normalizeInstagramHandle("a".repeat(30)), "a".repeat(30));
});

test("parses newline-separated handles, removes blanks and normalized duplicates", () => {
  assert.deepEqual(parseInstagramHandleLines([
    "@Dancer",
    "",
    "https://www.instagram.com/dancer/",
    " second_account ",
    "bad handle",
    "BAD HANDLE",
  ].join("\r\n")), [
    { input: "@Dancer", handle: "dancer" },
    { input: "second_account", handle: "second_account" },
    { input: "bad handle", handle: null },
  ]);
});

test("ten samples trim two on each side", () => {
  const result = calculateRate(10_000, reels([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]));
  assert.equal(result.sampleStatus, "ok");
  assert.equal(result.trimmedMean, 55);
  assert.equal(result.median, 55);
  assert.equal(result.viewsLow, 30);
  assert.equal(result.viewsHigh, 80);
  assert.deepEqual(result.reels.map((r) => r.excluded), [true, true, false, false, false, false, false, false, true, true]);
});

test("seven samples trim one at each end", () => {
  const result = calculateRate(30_000, reels([1, 2, 3, 4, 5, 6, 100]));
  assert.equal(result.sampleStatus, "short");
  assert.equal(result.trimmedMean, 4);
  assert.equal(result.viewsLow, 2);
  assert.equal(result.viewsHigh, 6);
  assert.equal(result.reels.filter((r) => r.excluded).length, 2);
});

test("four samples have no mean, expected views, tier or formula rate", () => {
  const result = calculateRate(50_000, reels([1, 2, 3, 4]));
  assert.equal(result.sampleStatus, "insufficient");
  for (const value of [result.trimmedMean, result.expectedViews, result.tier, result.vBase, result.formulaRate, result.viewsLow, result.viewsHigh]) assert.equal(value, null);
  assert.equal(result.fBase, 150_000);
  assert.ok(result.reels.every((r) => !r.excluded));
});

test("expected views cap at 1.5 times median", () => {
  const result = calculateRate(1_000, reels([100, 100, 100, 100, 100, 100, 100_000, 100_000, 100_000, 100_000]));
  assert.equal(result.trimmedMean, 33_400);
  assert.equal(result.median, 100);
  assert.equal(result.expectedViews, 150);
  // Apply the cap before rounding the median for the DB integer column.
  const fractional = calculateRate(0, reels([1, 1, 1, 1, 1, 2, 100, 100, 100, 100]));
  assert.equal(fractional.expectedViews, 2);
});

test("selects the latest ten by timestamp before sorting plays and excludes missing plays", () => {
  const input = reels([999_999, 888_888, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90]).reverse();
  const result = calculateRate(0, input);
  assert.deepEqual(result.reels.map((r) => r.plays), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  const fallback = calculateRate(0, [
    { videoPlayCount: 0, videoViewCount: 999, likesCount: -1 },
    { videoViewCount: 50 }, {}, { videoPlayCount: -1 }, { videoPlayCount: Number.NaN },
  ]);
  assert.deepEqual(fallback.reels.map((r) => r.plays), [0, 50]);
  assert.equal(fallback.reels[0].likes, null);
  assert.equal(input[0].shortCode, "reel11");
});

test("F and V ladder exact boundaries and adjacent values", () => {
  const prices = [50_000, 100_000, 150_000, 200_000, 300_000, 400_000, 500_000];
  for (const [fn, boundaries] of [
    [followerBase, [30_000, 50_000, 100_000, 200_000, 300_000, 400_000]],
    [viewBase, [5_000, 15_000, 30_000, 60_000, 120_000, 200_000]],
  ] as const) {
    assert.equal(fn(0), prices[0]);
    boundaries.forEach((boundary, i) => {
      assert.equal(fn(boundary - 1), prices[i]);
      assert.equal(fn(boundary), prices[i + 1]);
      assert.equal(fn(boundary + 1), prices[i + 1]);
    });
  }
});

test("F ladder extends in 100,000-follower steps with boundaries in the next bracket", () => {
  for (const [followers, expected] of [
    [400_000, 500_000], [499_999, 500_000], [500_000, 600_000],
    [500_001, 600_000], [770_000, 800_000], [4_317_106, 4_400_000],
  ]) assert.equal(followerBase(followers), expected);
});

test("V ladder extends at exact doubling boundaries without a ceiling", () => {
  for (const [views, expected] of [
    [200_000, 500_000], [399_999, 500_000], [400_000, 600_000],
    [400_001, 600_000], [799_999, 600_000], [800_000, 700_000],
    [800_001, 700_000], [1_599_999, 700_000], [1_600_000, 800_000],
    [2_180_393, 800_000], [3_199_999, 800_000], [3_200_000, 900_000],
  ]) assert.equal(viewBase(views), expected);
});

test("formula keeps its floor and uses follower half or views without a ceiling", () => {
  assert.equal(calculateRate(0, reels(Array(10).fill(0))).formulaRate, 50_000);
  assert.equal(calculateRate(100_000, reels(Array(10).fill(1))).formulaRate, 100_000);
  // Exact multiples enter the next F bracket: 10,000,000 followers => F 10,100,000.
  assert.equal(calculateRate(10_000_000, reels(Array(10).fill(10_000_000))).formulaRate, 5_050_000);
  assert.equal(calculateRate(9_999_999, reels(Array(10).fill(10_000_000))).formulaRate, 5_000_000);
  assert.equal(calculateRate(0, reels(Array(10).fill(2_180_393))).formulaRate, 800_000);
  const result = calculateRate(4_317_106, reels(Array(10).fill(2_180_393)));
  assert.equal(result.expectedViews, 2_180_393);
  assert.equal(result.fBase, 4_400_000);
  assert.equal(result.vBase, 800_000);
  assert.equal(result.formulaRate, 2_200_000);
});

test("sample and tier thresholds", () => {
  for (const n of [5, 6, 9, 10]) assert.equal(calculateRate(0, reels(Array(n).fill(10))).sampleStatus, n < 6 ? "insufficient" : n < 10 ? "short" : "ok");
  for (const [count, tier] of [[9_999, "longtail"], [10_000, "mid"], [49_999, "mid"], [50_000, "anchor"]] as const) assert.equal(calculateRate(0, reels(Array(10).fill(count))).tier, tier);
  assert.equal(calculateRate(0, []).median, null);
});
