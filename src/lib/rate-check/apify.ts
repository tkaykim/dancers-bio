import "server-only";

import type { ReelInput } from "./pricing";
import { RATE_CHECK_DISABLED } from "./types";

type Item = Record<string, unknown>;
export type InstagramProfile = {
  followers: number | null;
  fullName: string | null;
  profilePicUrl: string | null;
  isPrivate: boolean;
};

export class RateCheckCollectionError extends Error {
  raw: Record<string, unknown>;
  profile: InstagramProfile | null;

  constructor(message: string, raw: Record<string, unknown>, profile: InstagramProfile | null) {
    super(message);
    this.raw = raw;
    this.profile = profile;
  }
}

const text = (value: unknown) => typeof value === "string" ? value : null;
const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const items = (value: unknown): Item[] => Array.isArray(value)
  ? value.filter((item): item is Item => item !== null && typeof item === "object" && !Array.isArray(item))
  : [];

export async function collectInstagramRate(handle: string) {
  const token = process.env.RATE_CHECK_APIFY_TOKEN?.trim();
  const raw: Record<string, unknown> = {};
  let profile: InstagramProfile | null = null;
  if (!token) throw new RateCheckCollectionError(RATE_CHECK_DISABLED, raw, profile);

  async function run(actor: string, body: object, key: string): Promise<Item[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100_000);
    try {
      const url = new URL(`https://api.apify.com/v2/acts/apify~${actor}/run-sync-get-dataset-items`);
      url.searchParams.set("token", token!);
      url.searchParams.set("timeout", "90");
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal, cache: "no-store",
      });
      raw[key] = await response.json();
      if (!response.ok) {
        throw new Error(response.status === 408 || response.status === 504
          ? "Apify 응답 지연으로 측정을 완료하지 못했습니다."
          : `Apify 수집 요청에 실패했습니다(HTTP ${response.status}).`);
      }
      const result = items(raw[key]);
      if (!result.length) throw new Error(key === "profile" ? "계정을 찾을 수 없습니다." : "공개 릴스를 찾을 수 없습니다.");
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("Apify 응답 지연으로 측정을 완료하지 못했습니다.");
      // Never forward fetch errors containing the authenticated request URL.
      if (error instanceof Error && /^(Apify |계정을 |공개 릴스를 )/.test(error.message)) throw error;
      throw new Error("Apify 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const [item] = await run("instagram-profile-scraper", { usernames: [handle] }, "profile");
    profile = {
      followers: count(item.followersCount), fullName: text(item.fullName),
      profilePicUrl: text(item.profilePicUrlHD) || text(item.profilePicUrl), isPrivate: item.private === true,
    };
    if (profile.isPrivate) throw new Error("비공개 계정은 측정할 수 없습니다.");
    if (item.error || item.errorDescription) throw new Error("계정을 찾을 수 없거나 프로필을 수집할 수 없습니다.");
    if (profile.followers === null) throw new Error("팔로워 수를 확인할 수 없습니다.");
    const reelItems = await run("instagram-reel-scraper", {
      username: [handle], resultsLimit: 12,
      includeSharesCount: false, includeTranscript: false, includeDownloadedVideo: false,
    }, "reels");
    if (reelItems.some((reel) => reel.error || reel.errorDescription)) throw new Error("공개 릴스를 수집할 수 없습니다.");
    const reels: ReelInput[] = reelItems.map((reel) => ({
      shortCode: text(reel.shortCode), url: text(reel.url), timestamp: text(reel.timestamp),
      videoPlayCount: count(reel.videoPlayCount), videoViewCount: count(reel.videoViewCount),
      likesCount: count(reel.likesCount), commentsCount: count(reel.commentsCount),
    }));
    return { profile: { ...profile, followers: profile.followers }, reels, raw };
  } catch (error) {
    throw new RateCheckCollectionError(error instanceof Error ? error.message : "계정 수집에 실패했습니다.", raw, profile);
  }
}
