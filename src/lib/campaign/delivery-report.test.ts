import test from "node:test";
import assert from "node:assert/strict";
import { buildDeliveryReport } from "./delivery-report";
import { normalizeReportSettings } from "./report-settings";
import { compactFollowers } from "./format-count";
import { campaign, post, metric, snapshotId, projectId } from "./test-fixtures";
import type { SubmissionData, Participant, Submission } from "./submissions";

const person = (id: string): Participant => ({ id, project_id: projectId, display_name: id,
  ig_handle: id, active: true, owner_label: "private manager", note: "secret fee",
  application_id: null, board_member_id: null, dancer_id: null, deadline: null, version: 1 });
const sub = (id: string, p: string, post: string, status: Submission["status"] = "approved"): Submission => ({
  id, project_id: projectId, participant_id: p, post_id: post, status, feedback: "private feedback",
  submitted_at: "2026-09-07T00:00:00Z", source: "admin", reviewed_at: null, replaced_at: null, version: 1,
});
function fixture() {
  const data = campaign();
  data.posts = [post("1"), post("2"), post("3"), post("4", { status: "removed" })];
  data.snapshots[0].target_post_ids = ["1", "2", "3", "4"];
  data.metrics = [metric("1", { plays: 25000 }), metric("3", { plays: 99999 }), metric("4", { plays: 100000 })];
  const submissions: SubmissionData = {
    settings: { project_id: projectId, enabled: true, client_visible: false, board_id: null, deadline: null, version: 1 },
    participants: ["one", "collaborator", "two", "private-unsubmitted"].map(person),
    posts: data.posts,
    submissions: [sub("s1","one","1"), sub("s2","collaborator","1"), sub("s3","two","2"),
      sub("s4","two","3","pending_review"), sub("s5","one","4"), { ...sub("s6","two","3"), replaced_at: "2026-09-08T00:00:00Z" }],
  };
  return { data, submissions };
}
test("delivery deduplicates collaboration links and counts approved missing-metric posts", () => {
  const { data, submissions } = fixture();
  const r = buildDeliveryReport(data, submissions, { title: "Report", client_label: null, settings: normalizeReportSettings({ layout: "delivery" }) }, snapshotId);
  assert.equal(r.delivery?.posts, 2);
  assert.equal(r.delivery?.participants, 3);
  assert.equal(r.delivery?.views, 25000);
  assert.equal(r.delivery?.measured, 1);
  assert.equal(r.delivery?.items[1].views, null);
});
test("only explicitly listed upcoming names are published and completed names are excluded", () => {
  const { data, submissions } = fixture();
  const settings = normalizeReportSettings({ layout: "delivery", approximateViews: true,
    upcoming: [{ name: "one", handle: "one" }, { name: "Guest", handle: "guest" }, { name: "Guest duplicate", handle: "guest" }] });
  const r = buildDeliveryReport(data, submissions, { title: "Report", client_label: null, settings }, snapshotId);
  assert.deepEqual(r.delivery?.upcoming.map(p => p.name), ["Guest"]);
  assert.equal(r.delivery?.approximate, true);
  const serialized = JSON.stringify(r);
  for (const secret of ["private-unsubmitted","private manager","secret fee","private feedback","secret-run","Guest duplicate"]) assert.ok(!serialized.includes(secret), secret);
  assert.ok(!r.uploads);
});
test("unknown views stay null, actual zero remains zero, and publication is a detached snapshot", () => {
  const { data, submissions } = fixture();
  data.metrics = [];
  const settings = normalizeReportSettings({ layout: "delivery" });
  const r = buildDeliveryReport(data, submissions, { title: "Report", client_label: null, settings }, snapshotId);
  assert.equal(r.delivery?.views, null);
  data.metrics.push(metric("1", { plays: 0 }));
  const zero = buildDeliveryReport(data, submissions, { title: "Report", client_label: null, settings }, snapshotId);
  assert.equal(zero.delivery?.views, 0);
  submissions.participants[0].display_name = "modified";
  assert.ok(!JSON.stringify(zero).includes("modified"));
});
test("a post approved after the chosen snapshot is not added to a historical report", () => {
  const { data, submissions } = fixture();
  data.snapshots[0].target_post_ids = ["1"];
  const r = buildDeliveryReport(data, submissions, { title: "Report", client_label: null, settings: normalizeReportSettings({ layout: "delivery" }) }, snapshotId);
  assert.equal(r.delivery?.posts, 1);
  assert.equal(r.delivery?.participants, 2);
});
test("followers use Korean units, retain unknown values, and publish only visible account checks", () => {
  assert.equal(compactFollowers(305000), "30.5만");
  assert.equal(compactFollowers(2500), "2.5천");
  assert.equal(compactFollowers(35000), "3.5만");
  assert.equal(compactFollowers(0), "0");
  assert.equal(compactFollowers(null), "확인 중");
  const { data, submissions } = fixture();
  const r = buildDeliveryReport(data, submissions, { title: "Report", client_label: null, settings: normalizeReportSettings({
    layout: "delivery", followerObservations: [
      { handle: "account1", count: 35000, checkedAt: "2026-09-09T01:30:00Z", private: "secret" },
      { handle: "not-published", count: 10, checkedAt: "2026-09-09T01:30:00Z" },
      { handle: "ignored", count: -10, checkedAt: "bad" },
    ],
  }) }, snapshotId);
  assert.equal(r.delivery?.items[0].followers, 35000);
  assert.equal(r.settings.followerObservations?.length, 1);
  assert.ok(!JSON.stringify(r).includes('"secret"'));
});
