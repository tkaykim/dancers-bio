import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./fixtures/lg-t10-counts.json";
import {
  compareSameSet,
  compliance,
  distribution,
  followerTiers,
  forecast,
  postFollowers,
  summarize,
  topShares,
} from "./metrics";
import { metric, post, projectId, rules, snapshotId } from "./test-fixtures";
test("LG T+10 numerical fixture matches approved totals and concentration", () => {
  const posts = fixture.map((_, i) => post(String(i)));
  const metrics = fixture.map((v, i) =>
    metric(String(i), {
      fetch_status: v.found ? "found" : "not_found",
      plays: v.plays,
      likes: v.likes,
      comments: v.comments,
      shares: v.shares,
    }),
  );
  const summary = summarize(posts, metrics, [], rules);
  assert.equal(summary.plays.sum, 219808);
  assert.equal(summary.found, 88);
  assert.equal(summary.posts, 90);
  assert.equal(summary.comments.sum, 690);
  assert.equal(summary.shares.sum, 553);
  assert.equal(summary.shares.confirmed, 79);
  assert.equal(summary.likes.sum, 7045);
  assert.equal(summary.likes.confirmed, 62);
  // Plan lists 30.5%; original top-ten sum is 66,925 / 219,808 = 30.447…%.
  // Keep the source arithmetic instead of silently forcing a published typo.
  assert.deepEqual(
    topShares(metrics).map((t) => Number(t.percent?.toFixed(1))),
    [5.1, 19.4, 30.4],
  );
  assert.ok(Math.abs(topShares(metrics)[2].percent! - 30.5) < 0.1);
  assert.deepEqual(
    distribution(metrics).map((d) => d.count),
    [1, 9, 38, 34, 5, 1],
  );
});
test("errors and excluded posts never contribute; not_found remains in denominator", () => {
  const summary = summarize(
    [
      post("1"),
      post("2"),
      post("3"),
      post("4", {
        status: "excluded",
      }),
    ],
    [
      metric("1"),
      metric("2", {
        fetch_status: "error",
        plays: 900,
      }),
      metric("3", {
        fetch_status: "not_found",
        plays: 999,
      }),
      metric("4"),
    ],
    [],
    rules,
  );
  assert.equal(summary.posts, 2);
  assert.equal(summary.found, 1);
  assert.equal(summary.errors, 1);
  assert.equal(summary.plays.sum, 100);
});
test("same-set comparison requires found and non-null plays on both sides; zero denominator is null", () => {
  const before = [
    metric("1", {
      plays: 100,
    }),
    metric("2", {
      plays: null,
    }),
    metric("3"),
  ];
  const after = [
    metric("1", {
      plays: 104,
    }),
    metric("2", {
      plays: 500,
    }),
    metric("3", {
      fetch_status: "error",
    }),
  ];
  assert.deepEqual(compareSameSet(before, after), {
    count: 1,
    before: 100,
    after: 104,
    growth: 4,
    recommendStop: true,
  });
  assert.equal(
    compareSameSet(
      [
        metric("1", {
          plays: 0,
        }),
      ],
      [metric("1")],
    ).growth,
    null,
  );
});
test("account realization sums plays once and never sums the account forecast", () => {
  const result = forecast(
    [
      post("1", {
        owner_handle: "a",
        forecast_expected_views: 100,
      }),
      post("2", {
        owner_handle: "a",
        forecast_expected_views: 100,
      }),
      post("3", {
        forecast_expected_views: 0,
      }),
      post("4"),
    ],
    [
      metric("1", {
        plays: 100,
      }),
      metric("2", {
        plays: 200,
      }),
      metric("3"),
      metric("4"),
    ],
  );
  assert.equal(result.accounts[0].realization, 300);
  assert.equal(result.median, 300);
  assert.equal(result.label, "1/3계정 기준");
});
test("collaborator follower coverage is partial and only complete posts enter tiers", () => {
  const p = post("1", {
    owner_handle: "a",
    collab_handles: ["b", "a"],
  });
  const accounts = [
    {
      project_id: projectId,
      snapshot_id: snapshotId,
      handle: "a",
      followers: 900,
      is_private: false,
    },
  ];
  assert.equal(postFollowers(p, accounts).label, "1/2계정 기준");
  assert.equal(
    followerTiers([p], [metric("1")], accounts).reduce(
      (n, t) => n + t.posts,
      0,
    ),
    0,
  );
});
test("compliance hides unset rules and keeps missing observations unknown", () => {
  assert.deepEqual(compliance(metric("1"), rules), {
    partnership: null,
  });
  assert.equal(
    compliance(metric("1"), {
      ...rules,
      audio_id: "a",
    }).audio,
    null,
  );
  assert.equal(
    compliance(
      metric("1", {
        audio_id: "a",
        hashtags: ["tag"],
      }),
      {
        ...rules,
        audio_id: "a",
        required_tags: ["tag"],
      },
    ).tags,
    true,
  );
  assert.equal(
    compliance(undefined, {
      ...rules,
      required_tags: ["tag"],
    }).tags,
    null,
  );
});
