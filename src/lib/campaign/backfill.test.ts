import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { backfillMetric, buildBackfillPlan, parseAccounts } from "./backfill";
const source = {
  summary: {
    snapshots: {
      t10: {
        runId: "MxOgVDkITGk36EkDC",
        at: "2026-09-03T07:18:45.715Z",
        label: "9/3 (T+10)",
        usd: 0.7277,
      },
      t1: {
        runId: "PnhEV6gl0Yut9LriW",
        at: "2026-08-25T09:00:40.057Z",
        label: "8/25 (T+1)",
        usd: 0.1965,
      },
      t3: {
        runId: "dNwWpkKqzfztPiqoN",
        at: "2026-08-27T06:08:30.170Z",
        label: "8/27 (T+3)",
        usd: 0.2034,
      },
    },
  },
  rows: [
    {
      shortCode: "ABC",
      url: "https://instagram.com/p/ABC",
      owner: "OWNER",
      accounts: "owner|partner",
      t1_found: false,
      t10_found: true,
      t10_plays: 99,
      t10_likes: -1,
      t10_likes_best: 5,
      t10_likes_source: "profile",
    },
  ],
};
const profiles = {
  run: {
    id: "TpMlFK7zLfAhOQajZ",
    status: "SUCCEEDED",
    finishedAt: "2026-09-03T07:24:30.256Z",
    usageTotalUsd: 0.2047,
  },
  items: [
    {
      username: "OWNER",
      followersCount: 100,
    },
  ],
};
test("backfill sorts source run metadata, preserves IDs and never invents reviewed names or observations", () => {
  const plan = buildBackfillPlan(source, profiles);
  assert.deepEqual(
    plan.rounds.map((r) => r.label),
    ["T+1", "T+3", "T+10"],
  );
  assert.equal(plan.posts[0].display_name, null);
  assert.deepEqual(plan.posts[0].collab_handles, ["partner"]);
  const metric = backfillMetric("p", "s", "post", source.rows[0], "t10");
  assert.equal(metric.likes, 5);
  assert.equal(metric.likes_source, "profile");
  assert.equal(metric.audio_id, null);
  assert.equal(metric.hashtags, null);
  assert.equal(
    parseAccounts("p", "s", plan.profiles, plan.profileRun.id)[0].apify_run_id,
    "TpMlFK7zLfAhOQajZ",
  );
  assert.equal(
    backfillMetric("p", "s", "post", source.rows[0], "t1").fetch_status,
    "not_found",
  );
  assert.throws(() =>
    buildBackfillPlan(
      {
        ...source,
        summary: {
          snapshots: {
            t1: source.summary.snapshots.t1,
          },
        },
      },
      profiles,
    ),
  );
});
test("backfill script keeps every mutation behind --apply and skips source run IDs", () => {
  // Do not execute/import this script: user explicitly prohibits running the backfill.
  const script = fs.readFileSync("scripts/backfill-campaign-lg.mts", "utf8");
  const beforeApply = script.split("if (apply) {")[0];
  assert.ok(!/\.(insert|upsert|update|rpc)\(/.test(beforeApply));
  assert.match(script, /knownRuns\.has\(round.runId\)/);
  assert.match(script, /followers_collected: last/);
  assert.match(script, /\.env\.local/);
});
