import { buildReport } from "./report-builder";
import { normalizeReportSettings } from "./report-settings";
import { usableApproval, type SubmissionData } from "./submissions";
import type { CampaignData, PublicReport, Report } from "./types";

// This publication is an explicit selection of approved deliveries, independent
// of the casting board's visibility settings. Never serialize the operations roster.
export function buildDeliveryReport(data: CampaignData, submissions: SubmissionData,
  report: Pick<Report, "title" | "client_label" | "settings">, snapshotId: string): PublicReport {
  const settings = normalizeReportSettings(report.settings);
  const followerChecks = new Map((settings.followerObservations ?? []).map(f => [f.handle, f]));
  const active = new Map(submissions.participants.filter(p => p.active).map(p => [p.id, p]));
  const approved = submissions.submissions.filter(s => active.has(s.participant_id) && usableApproval(s, submissions));
  const targets = new Set(data.snapshots.find(s => s.id === snapshotId)?.target_post_ids ?? []);
  const ids = new Set(approved.filter(s => targets.has(s.post_id)).map(s => s.post_id));
  const filtered = { ...data, posts: data.posts.filter(p => ids.has(p.id)), metrics: data.metrics.filter(m => ids.has(m.post_id)) };
  const result = buildReport(filtered, { ...report, settings }, snapshotId, [snapshotId]);
  const metrics = new Map(filtered.metrics.filter(m => m.snapshot_id === snapshotId).map(m => [m.post_id, m]));
  const people = new Set<string>();
  const completedHandles = new Set<string>();
  const completedNames = new Set<string>();
  const items = filtered.posts.map(post => {
    const names: string[] = [];
    for (const s of approved.filter(s => s.post_id === post.id)) {
      const p = active.get(s.participant_id)!;
      people.add(p.id);
      completedNames.add(p.display_name.trim().toLowerCase());
      if (p.ig_handle) completedHandles.add(p.ig_handle.toLowerCase());
      names.push(p.display_name);
    }
    const metric = metrics.get(post.id);
    const participant = active.get(approved.find(s => s.post_id === post.id)!.participant_id);
    const handle = post.owner_handle ?? participant?.ig_handle ?? null;
    return { url: post.post_url, names: [...new Set(names)], handle, followers: handle ? followerChecks.get(handle)?.count ?? null : null,
      views: metric?.fetch_status === "found" && metric.plays !== null ? metric.plays : null };
  }).sort((a,b) => (b.views ?? -1) - (a.views ?? -1));
  const known = items.filter(p => p.views !== null);
  const seen = new Set<string>();
  const upcoming = (settings.upcoming ?? []).filter(p => {
    const key = p.handle ?? p.name.toLowerCase();
    if (seen.has(key) || (p.handle && completedHandles.has(p.handle)) || completedNames.has(p.name.toLowerCase())) return false;
    seen.add(key); return true;
  }).map(p => ({ ...p, followers: p.handle ? followerChecks.get(p.handle)?.count ?? null : null }));
  const visibleHandles = new Set([...items.map(p => p.handle), ...upcoming.map(p => p.handle)]);
  const visibleChecks = [...followerChecks.values()].filter(f => visibleHandles.has(f.handle));
  result.delivery = { participants: people.size, posts: items.length, measured: known.length,
    views: known.length ? known.reduce((sum,p) => sum + p.views!, 0) : null,
    approximate: settings.approximateViews === true, items, upcoming,
    followersCheckedAt: visibleChecks.map(f => f.checkedAt).sort().at(-1) ?? null };
  // Keep only the delivery projection in this layout, including the serialized payload.
  delete result.uploads;
  delete result.forecast;
  delete result.distribution;
  delete result.followerTiers;
  delete result.topShares;
  delete result.followersSnapshot;
  delete result.summary.followers;
  delete result.summary.compliance;
  result.allPosts = undefined;
  result.topPosts = [];
  result.settings.upcoming = upcoming;
  result.settings.followerObservations = visibleChecks;
  return JSON.parse(JSON.stringify(result)) as PublicReport;
}
