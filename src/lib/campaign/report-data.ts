import "server-only";
import { db, checked, loadCampaign, REPORT_COLUMNS } from "./repository";
import { buildReport, publishedPayload } from "./report-builder";
import type { PublicReport, Report } from "./types";
export async function prepareReport(
  project: string,
  reportId: string,
  snapshotId: string,
  trendIds?: string[],
) {
  const report = checked(
    await db()
      .from("campaign_reports")
      .select(REPORT_COLUMNS)
      .eq("project_id", project)
      .eq("id", reportId)
      .single(),
  ) as Report;
  return buildReport(await loadCampaign(project), report, snapshotId, trendIds);
}
export async function loadPublishedReport(
  code: string,
): Promise<PublicReport | null> {
  const row = checked(
    await db()
      .from("campaign_reports")
      .select(
        "is_active,expires_at,published_snapshot_id,published_at,published_payload",
      )
      .eq("share_code", code)
      .maybeSingle(),
  );
  return publishedPayload(row);
}
