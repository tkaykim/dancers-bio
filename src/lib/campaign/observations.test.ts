import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateBudget,
  observedHandles,
  parseObservations,
} from "./observations";
import { parsePostsInput } from "./import";
import { post, projectId, snapshotId } from "./test-fixtures";
test("missing items and generic errors are not converted into not_found", () => {
  const posts = [post("1"), post("2"), post("3")];
  const result = parseObservations(
    projectId,
    snapshotId,
    posts,
    [
      {
        shortCode: "code2",
        error: "not_found",
      },
      {
        shortCode: "code3",
        error: "timeout",
      },
    ],
    [],
  );
  assert.deepEqual(
    result.map((m) => m.fetch_status),
    ["error", "not_found", "error"],
  );
});
test("reel plays never use legacy views and profile likes only repair the same shortcode", () => {
  const result = parseObservations(
    projectId,
    snapshotId,
    [post("1")],
    [
      {
        shortCode: "code1",
        ownerUsername: "OWNER",
        videoViewCount: 500,
        likesCount: -1,
      },
    ],
    [
      {
        latestPosts: [
          {
            shortCode: "code1",
            likesCount: 23,
          },
          {
            shortCode: "other",
            likesCount: 999,
          },
        ],
      },
    ],
  )[0];
  assert.equal(result.plays, null);
  assert.equal(result.views_legacy, 500);
  assert.equal(result.likes, 23);
  assert.equal(result.likes_source, "profile");
  assert.equal(result.owner_handle, "owner");
});
test("profile targets union observed owners and collaborators with registration handles", () => {
  assert.deepEqual(
    observedHandles(
      [
        post("1", {
          owner_handle: null,
          collab_handles: ["known"],
        }),
      ],
      [
        {
          ownerUsername: "NEW",
          coauthorProducers: [
            {
              username: "@Partner",
            },
          ],
        },
      ],
    ),
    ["known", "new", "partner"],
  );
});
test("actor budgets use total share unit price and combined hard cap", () => {
  const b = estimateBudget(90, 100, true, true);
  assert.ok(Math.abs(b.reels - 90 * 0.0083 * 1.5) < 1e-9);
  assert.ok(b.total <= 3);
  assert.equal(estimateBudget(1, 0, false, false).profiles, 0);
  assert.throws(() => estimateBudget(301, 0, false, false));
  assert.throws(() => estimateBudget(300, 100, true, true));
});
test("URL-only paste, CSV quoting, collaboration and conflicts", () => {
  assert.equal(
    parsePostsInput("https://instagram.com/p/ABC")[0].owner_handle,
    null,
  );
  const row = parsePostsInput(
    'post_url,handle,display_name,collab_handles\nhttps://instagram.com/reel/A,@OWNER,"Display, reviewed",a;b',
    true,
  )[0];
  assert.equal(row.display_name, "Display, reviewed");
  assert.deepEqual(row.collab_handles, ["a", "b"]);
  assert.throws(() =>
    parsePostsInput(
      "https://instagram.com/p/ABC\nhttps://instagram.com/reel/ABC",
    ),
  );
});
