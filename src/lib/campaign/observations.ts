import { normalizeInstagramHandle, parseReelUrl } from "../instagram/handle";
import type { AccountMetric, Metric, Post } from "./types";
export type Item = Record<string, unknown>;
export const objects = (v: unknown): Item[] =>
  Array.isArray(v)
    ? v.filter(
        (x): x is Item => !!x && typeof x === "object" && !Array.isArray(x),
      )
    : [];
export const count = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
export const string = (v: unknown) => (typeof v === "string" ? v : null);
const strings = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export const shortCodeOf = (v: Item) =>
  string(v.shortCode) ??
  parseReelUrl(string(v.url) ?? string(v.inputUrl) ?? "")?.shortCode ??
  null;
export function observedHandles(posts: Post[], items: Item[]) {
  return [
    ...new Set(
      [
        ...posts.flatMap((p) => [p.owner_handle, ...p.collab_handles]),
        ...items.flatMap((i) => [
          string(i.ownerUsername),
          ...objects(i.coauthorProducers).map((c) => string(c.username)),
        ]),
      ].flatMap((h) => {
        const n = normalizeInstagramHandle(h ?? "");
        return n ? [n] : [];
      }),
    ),
  ];
}
export function parseObservations(
  project: string,
  snapshot: string,
  posts: Post[],
  reels: Item[],
  profiles: Item[],
) {
  const byCode = new Map(reels.map((r) => [shortCodeOf(r), r]));
  const latest = new Map(
    profiles
      .flatMap((p) => objects(p.latestPosts))
      .map((p) => [shortCodeOf(p), p]),
  );
  return posts.map((post) => {
    const raw = byCode.get(post.short_code);
    const explicitMissing =
      raw &&
      ["not_found", "not-found", "404"].includes(
        String(raw.error ?? raw.statusCode).toLowerCase(),
      );
    const status: Metric["fetch_status"] = !raw
      ? "error"
      : explicitMissing
        ? "not_found"
        : raw.error || raw.errorDescription || !shortCodeOf(raw)
          ? "error"
          : "found";
    const item = status === "found" ? raw! : {};
    const reelLikes = count(item.likesCount),
      profileLikes = count(latest.get(post.short_code)?.likesCount);
    const music =
      item.musicInfo && typeof item.musicInfo === "object"
        ? (item.musicInfo as Item)
        : {};
    const posted = string(item.timestamp);
    return {
      project_id: project,
      snapshot_id: snapshot,
      post_id: post.id,
      fetch_status: status,
      plays: count(item.videoPlayCount),
      views_legacy: count(item.videoViewCount),
      likes: reelLikes ?? (status === "found" ? profileLikes : null),
      likes_source:
        reelLikes !== null
          ? ("reel" as const)
          : status === "found" && profileLikes !== null
            ? ("profile" as const)
            : null,
      comments: count(item.commentsCount),
      comments_disabled: item.isCommentsDisabled === true,
      shares: count(item.sharesCount),
      audio_id: music.audio_id == null ? null : String(music.audio_id),
      hashtags: Array.isArray(item.hashtags)
        ? strings(item.hashtags).map((t) => t.replace(/^#/, "").toLowerCase())
        : null,
      mentions: Array.isArray(item.mentions)
        ? strings(item.mentions).flatMap((t) => {
            const h = normalizeInstagramHandle(t);
            return h ? [h] : [];
          })
        : null,
      paid_partnership:
        typeof item.paidPartnership === "boolean" ? item.paidPartnership : null,
      caption_excerpt: string(item.caption)?.slice(0, 200) ?? null,
      owner_handle: normalizeInstagramHandle(string(item.ownerUsername) ?? ""),
      posted_at: posted && Number.isFinite(Date.parse(posted)) ? posted : null,
      collab_handles: objects(item.coauthorProducers).flatMap((c) => {
        const h = normalizeInstagramHandle(string(c.username) ?? "");
        return h ? [h] : [];
      }),
      raw: raw ?? {
        error: "missing_dataset_item",
      },
    };
  });
}
export function parseAccounts(
  project: string,
  snapshot: string,
  profiles: Item[],
  runId: string | null,
) {
  const map = new Map<
    string,
    AccountMetric & {
      full_name: string | null;
      profile_pic_url: string | null;
      apify_run_id: string | null;
      raw: Item;
    }
  >();
  for (const raw of profiles) {
    const handle = normalizeInstagramHandle(
      string(raw.username) ?? string(raw.inputUrl) ?? "",
    );
    if (!handle) continue;
    map.set(handle, {
      project_id: project,
      snapshot_id: snapshot,
      handle,
      followers: raw.error ? null : count(raw.followersCount),
      is_private: raw.private === true,
      full_name: string(raw.fullName),
      profile_pic_url: string(raw.profilePicUrlHD) ?? string(raw.profilePicUrl),
      apify_run_id: runId,
      raw,
    });
  }
  return [...map.values()];
}
export function estimateBudget(
  posts: number,
  accounts: number,
  shares: boolean,
  followers: boolean,
) {
  if (!Number.isInteger(posts) || posts < 1 || posts > 300)
    throw new Error("게시물은 회당 1–300개까지 수집할 수 있습니다.");
  const reels = Math.max(0.2, posts * (shares ? 0.0083 : 0.0025) * 1.5);
  const profiles = followers ? Math.max(0.2, accounts * 0.0026 * 1.5) : 0;
  if (reels + profiles > 3)
    throw new Error("회당 수집 비용 상한 3달러를 초과합니다.");
  return {
    reels,
    profiles,
    total: reels + profiles,
  };
}
