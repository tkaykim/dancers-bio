// Native node --test requires explicit TypeScript extensions.
// @ts-expect-error The project keeps allowImportingTsExtensions disabled.
import { resolveTier } from "../casting/forecast.ts";

export type ReelInput = {
  shortCode?: string | null;
  url?: string | null;
  timestamp?: string | null;
  videoPlayCount?: number | null;
  videoViewCount?: number | null;
  likesCount?: number | null;
  commentsCount?: number | null;
};

export type RateReel = {
  shortCode: string | null;
  url: string | null;
  timestamp: string | null;
  plays: number;
  likes: number | null;
  comments: number | null;
  excluded: boolean;
};

export function normalizeInstagramHandle(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com(?:\/|$)/.test(value)) {
    value = value.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/?/, "");
  } else if (value.includes("://")) {
    return null;
  }
  value = value.replace(/^@/, "").split(/[?/]/)[0];
  return /^[a-z0-9._]{1,30}$/.test(value) ? value : null;
}

export type InstagramHandleInput = {
  input: string;
  handle: string | null;
};

export function parseInstagramHandleLines(input: string): InstagramHandleInput[] {
  const seen = new Set<string>();
  const entries: InstagramHandleInput[] = [];

  for (const line of input.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    const handle = normalizeInstagramHandle(value);
    const key = handle ? `handle:${handle}` : `invalid:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ input: value, handle });
  }

  return entries;
}

export function followerBase(followers: number): number {
  if (followers < 30_000) return 50_000;
  if (followers < 50_000) return 100_000;
  if (followers < 100_000) return 150_000;
  return (Math.floor(followers / 100_000) + 1) * 100_000;
}

export function viewBase(views: number): number {
  if (views < 5_000) return 50_000;
  if (views < 15_000) return 100_000;
  if (views < 30_000) return 150_000;
  if (views < 60_000) return 200_000;
  if (views < 120_000) return 300_000;
  if (views < 200_000) return 400_000;
  let base = 500_000;
  for (let threshold = 400_000; views >= threshold; threshold *= 2) {
    base += 100_000;
  }
  return base;
}

function count(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

export function calculateRate(followers: number, input: ReelInput[]) {
  const reels: RateReel[] = input
    .slice()
    .sort((a, b) => (Date.parse(b.timestamp ?? "") || 0) - (Date.parse(a.timestamp ?? "") || 0))
    .slice(0, 10)
    .flatMap((reel) => {
      const plays = count(reel.videoPlayCount) ?? count(reel.videoViewCount);
      return plays === null ? [] : [{
        shortCode: reel.shortCode ?? null,
        url: reel.url ?? null,
        timestamp: reel.timestamp ?? null,
        plays,
        likes: count(reel.likesCount),
        comments: count(reel.commentsCount),
        excluded: false,
      }];
    })
    .sort((a, b) => a.plays - b.plays);
  const n = reels.length;
  const sampleStatus = n >= 10 ? "ok" : n >= 6 ? "short" : "insufficient";
  const trim = n >= 10 ? 2 : n >= 6 ? 1 : 0;
  reels.forEach((reel, i) => { reel.excluded = trim > 0 && (i < trim || i >= n - trim); });
  const used = reels.filter((reel) => !reel.excluded);
  // DB statistics are integer columns; round only at the persistence boundary of each statistic.
  const rawMedian = n ? (reels[Math.floor((n - 1) / 2)].plays + reels[Math.floor(n / 2)].plays) / 2 : null;
  const median = rawMedian === null ? null : Math.round(rawMedian);
  const trimmedMean = n >= 6 ? Math.round(used.reduce((sum, reel) => sum + reel.plays, 0) / used.length) : null;
  const expectedViews = trimmedMean === null || rawMedian === null ? null : Math.min(trimmedMean, Math.round(rawMedian * 1.5));
  const fBase = followerBase(followers);
  const vBase = expectedViews === null ? null : viewBase(expectedViews);
  return {
    reels, reelsUsed: n, sampleStatus, trimmedMean, median,
    viewsLow: n >= 6 ? used[0].plays : null,
    viewsHigh: n >= 6 ? used[used.length - 1].plays : null,
    expectedViews, tier: resolveTier(expectedViews), fBase, vBase,
    formulaRate: vBase === null ? null : Math.max(50_000, Math.floor(fBase / 2), vBase),
  };
}

export type RatePricing = ReturnType<typeof calculateRate>;
