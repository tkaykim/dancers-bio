import type { CampaignData, PublicPost, PublicReport, Report } from "./types";
import {
  compareSameSet,
  compliance,
  distribution,
  followerTiers,
  forecast,
  isConfirmed,
  postFollowers,
  selectedRows,
  snapshotContext,
  summarize,
  topShares,
} from "./metrics";
import { normalizeReportSettings } from "./report-settings";
export const DEFAULT_NOTICE =
  "재생은 비로그인 공개 화면의 videoPlayCount 기준입니다.\n좋아요 미확인은 0을 뜻하지 않습니다.\n도달과 저장 수는 공개되지 않으며, 팔로워 합계는 고유 도달 인원이 아닙니다.\n수치는 표시된 측정 시각의 관측값이며 이후 변동될 수 있습니다.";
export function buildReport(
  data: CampaignData,
  report: Pick<Report, "title" | "client_label" | "settings">,
  snapshotId: string,
  trendIds?: string[],
): PublicReport {
  const settings = normalizeReportSettings(report.settings);
  const { snapshot, metrics, accounts, followersSnapshot } = snapshotContext(
    data,
    snapshotId,
  );
  const summary = summarize(data.posts, metrics, accounts, data.rules);
  const valid = selectedRows(data.posts, metrics).filter(
    (m) => m.fetch_status !== "error",
  );
  const byPost = new Map(data.posts.map((p) => [p.id, p]));
  const posts: PublicPost[] = valid
    .map((m) => {
      const p = byPost.get(m.post_id)!;
      return {
        shortCode: p.short_code,
        url: p.post_url,
        handle: p.owner_handle,
        collabHandles: [...p.collab_handles],
        postedAt: p.posted_at,
        plays: m.fetch_status === "found" ? m.plays : null,
        likes: m.fetch_status === "found" ? m.likes : null,
        comments: m.fetch_status === "found" ? m.comments : null,
        shares: m.fetch_status === "found" ? m.shares : null,
        found: m.fetch_status === "found",
        ...(settings.showDisplayNames
          ? {
              displayName: p.display_name,
            }
          : {}),
        ...(settings.showFollowers
          ? {
              followers: postFollowers(p, accounts),
            }
          : {}),
        ...(settings.showCompliance
          ? {
              compliance: compliance(m, data.rules),
            }
          : {}),
      };
    })
    .sort((a, b) => (b.plays ?? -1) - (a.plays ?? -1));
  const trendSnapshots = data.snapshots
    .filter(
      (s) =>
        isConfirmed(s.status) &&
        s.taken_at <= snapshot.taken_at &&
        (!trendIds || trendIds.includes(s.id)),
    )
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  const result: PublicReport = {
    version: 1,
    title: report.title,
    clientLabel: report.client_label,
    settings,
    snapshot: {
      id: snapshot.id,
      label: snapshot.label,
      takenAt: snapshot.taken_at,
    },
    summary: {
      posts: summary.posts,
      found: summary.found,
      errors: summary.errors,
      plays: summary.plays,
      likes: summary.likes,
      comments: summary.comments,
      shares: summary.shares,
      accounts: summary.accounts,
      ...(settings.showFollowers
        ? {
            followers: summary.followers,
          }
        : {}),
      ...(settings.showCompliance
        ? {
            compliance: summary.compliance,
          }
        : {}),
    },
    trend: trendSnapshots.map((s, i) => {
      const rows = selectedRows(
        data.posts,
        data.metrics.filter((m) => m.snapshot_id === s.id),
      );
      const sum = summarize(data.posts, rows, [], data.rules);
      return {
        id: s.id,
        label: s.label,
        takenAt: s.taken_at,
        plays: sum.plays.sum,
        found: sum.found,
        total: sum.posts,
        comparison: i
          ? compareSameSet(
              selectedRows(
                data.posts,
                data.metrics.filter(
                  (m) => m.snapshot_id === trendSnapshots[i - 1].id,
                ),
              ),
              rows,
            )
          : null,
      };
    }),
    topPosts: posts.filter((p) => p.found).slice(0, settings.showTopPosts),
    notice: settings.noticeText ?? DEFAULT_NOTICE,
    ...(settings.showAllPosts
      ? {
          allPosts: posts,
        }
      : {}),
    ...(settings.showFollowers
      ? {
          followersSnapshot: followersSnapshot
            ? {
                label: followersSnapshot.label,
                takenAt: followersSnapshot.taken_at,
              }
            : null,
        }
      : {}),
    ...(settings.showDistribution
      ? {
          distribution: distribution(valid),
          topShares: topShares(valid),
        }
      : {}),
    ...(settings.showFollowerTiers
      ? {
          followerTiers: followerTiers(data.posts, valid, accounts),
        }
      : {}),
    ...(settings.showForecast
      ? {
          forecast: forecast(data.posts, valid),
        }
      : {}),
  };
  // Deep copy is intentional: later draft mutations cannot change a prepared publication.
  return JSON.parse(JSON.stringify(result)) as PublicReport;
}
export function publishedPayload(
  row: {
    is_active: boolean;
    expires_at: string | null;
    published_snapshot_id: string | null;
    published_payload: PublicReport | null;
    published_at: string | null;
  } | null,
  now = Date.now(),
) {
  if (
    !row?.is_active ||
    !row.published_snapshot_id ||
    !row.published_at ||
    !row.published_payload ||
    row.published_payload.version !== 1
  )
    return null;
  if (
    row.expires_at &&
    (!Number.isFinite(Date.parse(row.expires_at)) ||
      Date.parse(row.expires_at) <= now)
  )
    return null;
  return row.published_payload;
}
