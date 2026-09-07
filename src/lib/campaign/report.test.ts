import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, publishedPayload } from "./report-builder";
import { normalizeReportSettings } from "./report-settings";
import { campaign, snapshotId } from "./test-fixtures";
test("settings only allow explicit public fields and reviewed names default off", () => {
  const settings = normalizeReportSettings({
    showCost: true,
    audioId: "secret",
    showDisplayNames: "true",
    showTopPosts: -5,
  });
  assert.equal(settings.showDisplayNames, false);
  assert.equal(settings.showTopPosts, 0);
  assert.ok(!("showCost" in settings));
  assert.ok(!("audioId" in settings));
});
test("publication is a whitelist, deep frozen copy of current data and settings", () => {
  const data = campaign();
  const report = {
    title: "Campaign",
    client_label: "Client",
    settings: normalizeReportSettings({}),
  };
  const published = buildReport(data, report, snapshotId),
    saved = JSON.stringify(published);
  for (const secret of [
    "private note",
    "private application",
    "private caption",
    "secret-run",
    "private-staff",
    "검토된 이름",
    "forecast_expected_views",
    "cost_usd",
  ])
    assert.ok(!saved.includes(secret), secret);
  assert.ok(!("forecast" in published));
  assert.ok(!("displayName" in published.topPosts[0]));
  data.posts[0].display_name = "changed";
  data.posts[0].status = "excluded";
  data.posts[0].collab_handles.push("changed");
  data.rules.audio_id = "changed";
  data.metrics[0].plays = 999;
  report.title = "changed";
  report.settings.showAllPosts = true;
  assert.equal(JSON.stringify(published), saved);
  assert.notEqual(JSON.stringify(buildReport(data, report, snapshotId)), saved);
});
test("reviewed display names and forecast opt-in do not fall back to real names", () => {
  const data = campaign();
  data.posts[0].display_name = null;
  const report = buildReport(
    data,
    {
      title: "t",
      client_label: null,
      settings: normalizeReportSettings({
        showDisplayNames: true,
        showForecast: true,
        showFollowers: false,
        showCompliance: false,
        showDistribution: false,
        showFollowerTiers: false,
      }),
    },
    snapshotId,
  );
  assert.equal(report.topPosts[0].displayName, null);
  assert.equal(report.forecast?.accounts.length, 1);
  assert.ok(!("followers" in report.summary));
  assert.ok(!("followersSnapshot" in report));
  assert.ok(!("compliance" in report.topPosts[0]));
});
test("public loader rejects draft, inactive, expired or invalid payload", () => {
  const payload = buildReport(
    campaign(),
    {
      title: "t",
      client_label: null,
      settings: normalizeReportSettings({}),
    },
    snapshotId,
  );
  const row = {
    is_active: true,
    expires_at: null,
    published_snapshot_id: snapshotId,
    published_at: "2026-09-07",
    published_payload: payload,
  };
  assert.equal(publishedPayload(row), payload);
  assert.equal(
    publishedPayload({
      ...row,
      is_active: false,
    }),
    null,
  );
  assert.equal(
    publishedPayload({
      ...row,
      expires_at: "2000-01-01",
    }),
    null,
  );
  assert.equal(
    publishedPayload({
      ...row,
      published_snapshot_id: null,
    }),
    null,
  );
  assert.equal(
    publishedPayload({
      ...row,
      published_payload: null,
    }),
    null,
  );
  assert.throws(() =>
    buildReport(
      {
        ...campaign(),
        snapshots: campaign().snapshots.map((s) => ({
          ...s,
          status: "failed",
        })),
      },
      {
        title: "t",
        client_label: null,
        settings: normalizeReportSettings({}),
      },
      snapshotId,
    ),
  );
});
