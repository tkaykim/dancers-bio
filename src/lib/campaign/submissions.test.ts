import { test } from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./test-loader";
import { campaign, post, metric } from "./test-fixtures";
import type { SubmissionData, Participant, Submission } from "./submissions";
import { buildReport, publishedPayload } from "./report-builder";
import { normalizeReportSettings } from "./report-settings";
import { snapshotId } from "./test-fixtures";
const lib = loadModule<typeof import("./submissions")>(
  "src/lib/campaign/submissions.ts",
);
const person = (id: string): Participant => ({
  id,
  project_id: "project",
  board_member_id: id,
  application_id: null,
  dancer_id: null,
  display_name: id,
  ig_handle: null,
  owner_label: "private staff",
  note: "secret note",
  deadline: null,
  active: true,
  version: 1,
});
const submission = (
  id: string,
  participant: string,
  postId: string,
  status: Submission["status"],
): Submission => ({
  id,
  project_id: "project",
  participant_id: participant,
  post_id: postId,
  status,
  feedback: "private feedback",
  submitted_at: "2026-09-07T00:00:00Z",
  source: "admin",
  reviewed_at: null,
  replaced_at: null,
  version: 1,
});
function fixture(): SubmissionData {
  return {
    settings: {
      project_id: "project",
      board_id: "board",
      enabled: true,
      deadline: "2026-09-13T14:59:00Z",
      client_visible: false,
      version: 1,
    },
    participants: [person("riwoo"), person("yeojin"), person("external")],
    posts: [post("1"), post("2")],
    submissions: [
      submission("s1", "riwoo", "1", "approved"),
      submission("s2", "yeojin", "2", "pending_review"),
    ],
  };
}
test("roster counts include missing participants and overdue is a separate filter", () => {
  const data = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(lib.uploadCounts(data))), {
    total: 3,
    missing: 1,
    pending_review: 1,
    changes_requested: 0,
    approved: 1,
  });
  assert.equal(
    lib.isOverdue(data, data.participants[2], Date.parse("2026-09-14")),
    true,
  );
  assert.equal(
    lib.isOverdue(data, data.participants[0], Date.parse("2026-09-14")),
    false,
  );
});
test("public projection excludes pending links, feedback, staff and notes", () => {
  const text = JSON.stringify(lib.publicUploads(fixture()));
  assert.ok(text.includes("code1"));
  assert.ok(!text.includes("code2"));
  for (const secret of [
    "private",
    "secret",
    "application_id",
    "dancer_id",
    "feedback",
  ])
    assert.ok(!text.includes(secret));
});
test("manual participants require individual opt-in before client uploads and report metrics",()=>{
  const data=fixture();data.participants[0]={...data.participants[0],manual_entry_id:"manual",board_member_id:null,client_visible:false};
  assert.equal(lib.publicUploads(data).approved,0);
  assert.equal(lib.approvedCampaignData({...campaign(),posts:data.posts as never},data).posts.length,0);
  data.participants[0].client_visible=true;
  assert.equal(lib.publicUploads(data).approved,1);
});
test("replacement and removed posts lose live approval without deleting audit records", () => {
  const data = fixture();
  data.submissions[0].replaced_at = "2026-09-08";
  assert.equal(lib.publicUploads(data).approved, 0);
  data.submissions[0].replaced_at = null;
  data.posts[0].status = "removed";
  assert.equal(lib.publicUploads(data).approved, 0);
});
test("shared post completes two participants but report metrics count it once", () => {
  const data = fixture();
  data.submissions[1].post_id = "1";
  data.submissions[1].status = "approved";
  const base = campaign();
  base.posts.push(post("2"));
  base.metrics.push(metric("2"));
  const result = lib.approvedCampaignData(base, data);
  assert.equal(result.posts.length, 1);
  assert.equal(result.metrics.length, 1);
  assert.equal(lib.publicUploads(data).approved, 2);
});
test("inactive participants leave the denominator, legacy campaigns retain report behavior", () => {
  const data = fixture();
  data.participants[0].active = false;
  assert.equal(lib.publicUploads(data).total, 2);
  assert.equal(lib.publicUploads(data).approved, 0);
  const base = campaign();
  data.settings.enabled = false;
  assert.equal(lib.approvedCampaignData(base, data).posts.length, 0);
  data.settings.version = 0;
  assert.equal(lib.approvedCampaignData(base, data), base);
});
test("own response contains only the requested participant's links and feedback", () => {
  const data = lib.participantView(fixture(), "yeojin");
  assert.equal(data.participants.length, 1);
  assert.equal(data.posts.length, 1);
  assert.equal(data.posts[0].id, "2");
  assert.equal(data.participants[0].note, "");
  assert.equal(data.participants[0].owner_label, "");
});

test("prepared report freezes approved URLs and honors display-name opt-in", async () => {
  const data = fixture(),
    base = campaign();
  const report = {
    title: "Campaign",
    client_label: null,
    settings: normalizeReportSettings({ showAllPosts: true }),
  };
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    async single() {
      return { data: report };
    },
  };
  const reportModule = loadModule<typeof import("./report-data")>(
    "src/lib/campaign/report-data.ts",
    {
      "./repository": {
        db: () => ({ from: () => query }),
        checked: (r: { data: unknown }) => r.data,
        loadCampaign: async () => base,
      },
      "./report-builder": { buildReport, publishedPayload },
      "./submission-repository": { loadSubmissions: async () => data },
      "./submissions": lib,
    },
  );
  const result = await reportModule.prepareReport(
    "project",
    "report",
    snapshotId,
  );
  assert.equal(result.uploads?.approved, 1);
  assert.equal(result.uploads?.participants[0].name, undefined);
  assert.ok(!JSON.stringify(result).includes("code2"));
  const frozen = JSON.stringify(result);
  data.submissions[0].status = "changes_requested";
  data.posts[0].post_url = "https://www.instagram.com/reel/changed/";
  assert.equal(JSON.stringify(result), frozen);
});

test("server action denies foreign participant before RPC and normalizes owner URL", async () => {
  let rpcCalls = 0,
    input: Record<string, unknown> = {};
  const owner = {
    ...person("owned"),
    project_id: "11111111-1111-4111-8111-111111111111",
  };
  const actions = loadModule<
    typeof import("../../app/actions/campaign-submissions")
  >("src/app/actions/campaign-submissions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/guard": {
      requireUser: async () => ({ id: "user" }),
      canManageProject: async () => false,
    },
    "@/lib/campaign/repository": {
      checked: (r: { data: unknown }) => r.data,
      db: () => ({
        rpc: async (_name: string, args: Record<string, unknown>) => {
          rpcCalls++;
          input = args;
          return { data: { id: "saved" } };
        },
      }),
    },
    "@/lib/campaign/submission-repository": {
      ownParticipants: async () => [owner],
    },
    "@/lib/campaign/submissions": lib,
    "@/lib/instagram/handle": loadModule("src/lib/instagram/handle.ts"),
  });
  assert.equal(
    (
      await actions.mutateSubmissionAction(owner.project_id, "submit", {
        participant_id: "someone-else",
        url: "https://www.instagram.com/reel/Dc-2MpLTvXV/",
      })
    ).ok,
    false,
  );
  assert.equal(
    (
      await actions.mutateSubmissionAction(owner.project_id, "review", {
        submission_id: "arbitrary",
      })
    ).ok,
    false,
  );
  assert.equal(rpcCalls, 0);
  assert.equal(
    (
      await actions.mutateSubmissionAction(owner.project_id, "submit", {
        participant_id: owner.id,
        url: "https://www.instagram.com/reel/Dc-2MpLTvXV/?stkn=tracking",
      })
    ).ok,
    true,
  );
  assert.equal(
    (input.p_data as Record<string, unknown>).url,
    "https://www.instagram.com/reel/Dc-2MpLTvXV/",
  );
  assert.equal(input.p_actor, "user");
});
