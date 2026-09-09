import "server-only";
import { db, checked, loadCampaign, REPORT_COLUMNS } from "./repository";
import { buildReport, publishedPayload } from "./report-builder";
import type { PublicReport, Report } from "./types";
import { loadSubmissions } from "./submission-repository";
import { approvedCampaignData, publicUploads } from "./submissions";
import { buildDeliveryReport } from "./delivery-report";
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
  const [data, submissions] = await Promise.all([
    loadCampaign(project),
    loadSubmissions(project),
  ]);
  if (report.settings.layout === "delivery") {
    return buildDeliveryReport(data, submissions, report, snapshotId);
  }
  const result = buildReport(
    approvedCampaignData(data, submissions),
    report,
    snapshotId,
    trendIds,
  );
  if (submissions.settings.version) {
    const uploads = publicUploads(submissions);
    result.uploads = {
      ...uploads,
      participants: uploads.participants.map((p) => ({
        memberId: null,
        ...(result.settings.showDisplayNames ? { name: p.name } : {}),
        urls: p.urls,
      })),
    };
  }
  return JSON.parse(JSON.stringify(result)) as PublicReport;
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
