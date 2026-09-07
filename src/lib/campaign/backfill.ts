import {
  objects,
  parseAccounts,
  string,
  type Item,
  count,
} from "./observations";
import { normalizeInstagramHandle, parseReelUrl } from "../instagram/handle";
export function buildBackfillPlan(timeseries: unknown, profileInput: unknown) {
  const source = timeseries as {
    summary?: {
      snapshots?: Record<
        string,
        {
          runId: string;
          at: string;
          label: string;
          usd: number;
        }
      >;
    };
    rows?: Item[];
  };
  const profiles = profileInput as {
    run?: {
      id: string;
      finishedAt: string;
      status: string;
      usageTotalUsd: number;
    };
    items?: Item[];
  };
  if (
    !source.summary?.snapshots ||
    !Array.isArray(source.rows) ||
    !profiles.run?.id ||
    profiles.run.status !== "SUCCEEDED" ||
    !Array.isArray(profiles.items)
  )
    throw new Error("원본 시계열과 프로필 실행 메타가 필요합니다.");
  const expected = new Set([
    "PnhEV6gl0Yut9LriW",
    "dNwWpkKqzfztPiqoN",
    "MxOgVDkITGk36EkDC",
  ]);
  if (profiles.run.id !== "TpMlFK7zLfAhOQajZ")
    throw new Error("LG 프로필 원본 run ID가 일치하지 않습니다.");
  const rounds = Object.entries(source.summary.snapshots)
    .map(([key, meta]) => {
      if (!expected.delete(meta.runId) || !Number.isFinite(Date.parse(meta.at)))
        throw new Error("중복되거나 알 수 없는 릴스 원본 run 메타입니다.");
      // summary.snapshots.*.at is the original run.finishedAt, not generatedAt.
      return {
        key,
        label: meta.label.match(/T\+\d+/)?.[0] ?? meta.label,
        runId: meta.runId,
        takenAt: meta.at,
        cost: meta.usd,
      };
    })
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (expected.size || rounds.length !== 3 || rounds.at(-1)?.label !== "T+10")
    throw new Error("T+1·T+3·T+10 원본 회차가 필요합니다.");
  const seen = new Set<string>();
  const posts = source.rows.map((row) => {
    const parsed = parseReelUrl(string(row.url) ?? "");
    if (
      !parsed ||
      parsed.shortCode !== row.shortCode ||
      seen.has(parsed.shortCode)
    )
      throw new Error("원본 shortcode 또는 중복을 확인해 주세요.");
    seen.add(parsed.shortCode);
    const owner = normalizeInstagramHandle(string(row.owner) ?? "");
    const handles = (string(row.accounts) ?? "")
      .split(/[;|,\s]+/)
      .flatMap((h) => {
        const v = normalizeInstagramHandle(h);
        return v ? [v] : [];
      });
    return {
      short_code: parsed.shortCode,
      post_url: parsed.url,
      owner_handle: owner,
      collab_handles: [...new Set(handles)].filter((h) => h !== owner),
      posted_at: string(row.posted),
      source: "backfill" as const,
      display_name: null,
      row,
    };
  });
  return {
    rounds,
    posts,
    profiles: objects(profiles.items),
    profileRun: profiles.run,
  };
}
export function backfillMetric(
  project: string,
  snapshot: string,
  postId: string,
  row: Item,
  key: string,
) {
  const found = row[`${key}_found`];
  const measured = found === true;
  const best = key === "t10" ? count(row.t10_likes_best) : null;
  const reel = count(row[`${key}_likes`]);
  return {
    project_id: project,
    snapshot_id: snapshot,
    post_id: postId,
    fetch_status:
      found === true ? "found" : found === false ? "not_found" : "error",
    plays: measured ? count(row[`${key}_plays`]) : null,
    views_legacy: null,
    likes: measured ? (best ?? reel) : null,
    likes_source:
      !measured || (best ?? reel) === null
        ? null
        : key === "t10" && row.t10_likes_source === "profile"
          ? "profile"
          : "reel",
    comments: measured ? count(row[`${key}_comments`]) : null,
    shares: measured ? count(row[`${key}_shares`]) : null,
    comments_disabled: row.commentsDisabled === true,
    audio_id: null,
    hashtags: null,
    mentions: null,
    paid_partnership: null,
    caption_excerpt: null,
    owner_handle: measured
      ? normalizeInstagramHandle(string(row.owner) ?? "")
      : null,
    posted_at: measured ? string(row.posted) : null,
    raw: row,
  };
}
export { parseAccounts };
