import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReport } from "./report-builder";
import { campaign } from "./test-fixtures";
import { loadModule } from "./test-loader";
import * as observations from "./observations";
import * as imports from "./import";
import * as settings from "./report-settings";
import * as handles from "../instagram/handle";
import { post, projectId, rules, snapshot, snapshotId } from "./test-fixtures";
import type { Snapshot, SnapshotCosts } from "./types";
type Actions = typeof import("../../app/actions/campaign-results");
const actor = {
  id: "reel-run",
  status: "SUCCEEDED",
  defaultDatasetId: "reels",
  usageTotalUsd: 0.1,
};
function harness(
  options: {
    allowed?: boolean;
    admin?: boolean;
    superAdmin?: boolean;
    initial?: Partial<Snapshot>;
    dbSaveFails?: boolean;
    profilesFail?: boolean;
    communicateFails?: boolean;
  } = {},
) {
  const s: Snapshot & SnapshotCosts = {
    ...snapshot({
      status: "running",
      reels_run_id: "reel-run",
      followers_collected: true,
    }),
    estimated_cost_usd: 0.4,
    reels_estimated_cost_usd: 0.2,
    profiles_estimated_cost_usd: 0.2,
    apify_cost_usd: null,
    ...options.initial,
  };
  const calls: {
    name: string;
    value?: unknown;
  }[] = [];
  const repository = {
    checked: <T>(r: {
      data: T;
      error?: {
        message: string;
      } | null;
    }) => {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
    async projectOf() {
      calls.push({
        name: "lookup",
      });
      return projectId;
    },
    async snapshotFor() {
      return {
        ...s,
      };
    },
    async postsFor() {
      return [post("1")];
    },
    async ensureRules() {
      return rules;
    },
    async candidatesFor() {
      return [];
    },
    async validatedLinks() {
      return {};
    },
    async updateSnapshot(_project: string, _id: string, patch: object) {
      calls.push({
        name: "save",
        value: patch,
      });
      if (options.dbSaveFails && "reels_run_id" in patch)
        throw new Error("save failed");
      Object.assign(s, patch);
      return {
        id: s.id,
      };
    },
    db() {
      return {
        from() {
          let patch: Record<string, unknown> = {};
          const query = {
            update(v: Record<string, unknown>) {
              patch = v;
              return query;
            },
            eq() {
              return query;
            },
            is() {
              return query;
            },
            select() {
              return query;
            },
            async maybeSingle() {
              if (s.profiles_run_id !== null)
                return {
                  data: null,
                  error: null,
                };
              Object.assign(s, patch);
              calls.push({
                name: "claim",
              });
              return {
                data: {
                  id: s.id,
                },
                error: null,
              };
            },
            then(resolve: (value: unknown) => unknown) {
              return Promise.resolve({
                count: 0,
                data: [],
                error: null,
              }).then(resolve);
            },
          };
          return query;
        },
        async rpc(name: string, value: unknown) {
          calls.push({
            name,
            value,
          });
          if (name === "campaign_reserve_snapshot")
            return {
              data: {
                ...s,
                status: "reserved",
              },
              error: null,
            };
          const payload = value as {
            p_items: {
              meta: {
                partial: boolean;
              };
            };
          };
          s.status = payload.p_items.meta.partial ? "partial" : "succeeded";
          return {
            data: {
              ...s,
            },
            error: null,
          };
        },
      };
    },
  };
  const apify = {
    async getRun(id: string) {
      calls.push({
        name: "getRun",
        value: id,
      });
      if (options.communicateFails) throw new Error("communication error");
      return id === "profiles-run"
        ? {
            ...actor,
            id,
            defaultDatasetId: "profiles",
            status: options.profilesFail ? "FAILED" : "SUCCEEDED",
          }
        : actor;
    },
    async readDataset(id: string) {
      calls.push({
        name: "dataset",
        value: id,
      });
      return id === "reels"
        ? [
            {
              shortCode: "code1",
              ownerUsername: "found-owner",
              videoPlayCount: 101,
            },
          ]
        : [
            {
              username: "found-owner",
              followersCount: 20,
            },
          ];
    },
    async startRun(name: string, input: unknown, limits: unknown) {
      calls.push({
        name: "start",
        value: {
          name,
          input,
          limits,
        },
      });
      return {
        ...actor,
        id: name.includes("profile") ? "profiles-run" : "new-reel-run",
        status: "RUNNING",
      };
    },
    async abortRun(id: string) {
      calls.push({
        name: "abort",
        value: id,
      });
    },
  };
  const actions = loadModule<Actions>("src/app/actions/campaign-results.ts", {
    "next/cache": {
      revalidatePath() {},
    },
    "@/lib/auth/guard": {
      async requireStaff() {
        calls.push({
          name: "guard",
        });
        return {
          id: "staff",
          is_admin: options.admin === true,
        };
      },
      async canManageProject() {
        calls.push({
          name: "permission",
        });
        return options.allowed !== false;
      },
      isSuperAdmin() {
        return options.superAdmin === true;
      },
    },
    "@/lib/instagram/handle": handles,
    "@/lib/campaign/repository": repository,
    "@/lib/campaign/import": imports,
    "@/lib/campaign/report-settings": settings,
    "@/lib/campaign/report-data": {
      async prepareReport() {
        calls.push({
          name: "prepare",
        });
        return {};
      },
    },
    "@/lib/campaign/observations": observations,
    "@/lib/campaign/apify": apify,
  });
  return {
    actions,
    calls,
    state: s,
  };
}
test("all ID actions enforce staff then target project before reads, writes or collection", async () => {
  const h = harness({
    allowed: false,
  });
  const results = await Promise.all([
    h.actions.pollSnapshotAction(snapshotId),
    h.actions.previewReportAction(snapshotId, snapshotId),
    h.actions.publishReportAction(snapshotId, snapshotId),
    h.actions.getPostDetailAction(snapshotId),
    h.actions.failStaleSnapshotAction(snapshotId),
  ]);
  for (const result of results) {
    assert.equal(result.ok, false);
    if (!result.ok)
      assert.equal(result.error, "이 프로젝트를 관리할 권한이 없습니다.");
  }
  assert.ok(
    h.calls.every((c) => ["guard", "lookup", "permission"].includes(c.name)),
  );
  assert.equal(
    (
      await h.actions.startSnapshotAction(projectId, {
        label: "",
        includeShares: false,
        collectFollowers: true,
      })
    ).ok,
    false,
  );
});
test("concurrent polls claim profile start once, then finalize and stop calling actors", async () => {
  const h = harness();
  await Promise.all([
    h.actions.pollSnapshotAction(snapshotId),
    h.actions.pollSnapshotAction(snapshotId),
  ]);
  assert.equal(h.calls.filter((c) => c.name === "start").length, 1);
  assert.ok(
    h.calls.findIndex((c) => c.name === "claim") <
      h.calls.findIndex((c) => c.name === "start"),
  );
  const result = await h.actions.pollSnapshotAction(snapshotId);
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.data.status, "succeeded");
    assert.ok(!("estimated_cost_usd" in result.data));
  }
  const finalized = h.calls.find(
    (c) => c.name === "campaign_finalize_snapshot",
  );
  assert.ok(finalized);
  const before = h.calls.filter((c) => c.name === "getRun").length;
  await h.actions.pollSnapshotAction(snapshotId);
  assert.equal(h.calls.filter((c) => c.name === "getRun").length, before);
});
test("profile failure preserves reels as partial; transient polling error keeps running", async () => {
  const failed = harness({
    initial: {
      profiles_run_id: "profiles-run",
    },
    profilesFail: true,
  });
  const r = await failed.actions.pollSnapshotAction(snapshotId);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.data.status, "partial");
  const transient = harness({
    communicateFails: true,
  });
  assert.equal(
    (await transient.actions.pollSnapshotAction(snapshotId)).ok,
    false,
  );
  assert.equal(transient.state.status, "running");
});
test("followers opt-out finalizes without profile actor; super-only response includes cost", async () => {
  const h = harness({
    initial: {
      followers_collected: false,
    },
    superAdmin: true,
  });
  const r = await h.actions.pollSnapshotAction(snapshotId);
  assert.ok(r.ok);
  if (r.ok) assert.ok("estimated_cost_usd" in r.data);
  assert.equal(h.calls.filter((c) => c.name === "start").length, 0);
});
test("run metadata save failure aborts orphan and leaves failed ledger", async () => {
  const h = harness({
    dbSaveFails: true,
  });
  const r = await h.actions.startSnapshotAction(projectId, {
    label: "T+1",
    includeShares: false,
    collectFollowers: true,
  });
  assert.equal(r.ok, false);
  assert.equal(h.state.status, "failed");
  assert.equal(h.calls.filter((c) => c.name === "abort").length, 1);
  assert.ok(
    h.calls.findIndex((c) => c.name === "campaign_reserve_snapshot") <
      h.calls.findIndex((c) => c.name === "start"),
  );
});
test("async Apify passes timeout and cap and redacts authenticated errors", async () => {
  const requests: {
    url: URL;
    options: RequestInit;
  }[] = [];
  const client = loadModule<typeof import("./apify")>(
    "src/lib/campaign/apify.ts",
    {
      "./observations": observations,
    },
    {
      process: {
        env: {
          RATE_CHECK_APIFY_TOKEN: "test-secret",
          APIFY_ENABLED: "false",
        },
      },
      fetch: async (url: URL, options: RequestInit) => {
        requests.push({
          url,
          options,
        });
        return {
          ok: true,
          json: async () => ({
            data: actor,
          }),
        };
      },
    },
  );
  await client.startRun(
    "apify~instagram-reel-scraper",
    {
      username: ["https://instagram.com/reel/X"],
    },
    {
      maxTotalChargeUsd: 0.2,
      timeoutSecs: 600,
    },
  );
  assert.equal(requests[0].url.searchParams.get("timeout"), "600");
  assert.equal(requests[0].url.searchParams.get("maxTotalChargeUsd"), "0.2");
  assert.equal(requests[0].options.method, "POST");
  const failed = loadModule<typeof import("./apify")>(
    "src/lib/campaign/apify.ts",
    {
      "./observations": observations,
    },
    {
      process: {
        env: {
          RATE_CHECK_APIFY_TOKEN: "test-secret",
        },
      },
      fetch: async () => {
        throw new Error("https://api.apify.com/?token=test-secret");
      },
    },
  );
  await assert.rejects(failed.getRun("id"), (e) =>
    e instanceof Error
      ? !e.message.includes("test-secret")
      : !String(e).includes("test-secret"),
  );
});
test("SQL declares service-only composite keys, serialized daily reservation and idempotent finalization", () => {
  const sql = fs
    .readFileSync("db/migrations/20260907_001_campaign_results.sql", "utf8")
    .toLowerCase();
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 6);
  assert.equal(
    (sql.match(/security definer set search_path = public, pg_temp/g) ?? [])
      .length,
    2,
  );
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /asia\/seoul/);
  assert.match(sql, />= 3/);
  assert.match(sql, />= 10/);
  assert.match(sql, /foreign key\(post_id,project_id\)/);
  assert.match(sql, /foreign key\(followers_snapshot_id,project_id\)/);
  assert.match(sql, /foreign key\(published_snapshot_id,project_id\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /not_found,not_found/);
  assert.match(sql, /fetch_status <> 'error'/);
  assert.match(sql, /from public,anon,authenticated/);
  assert.ok(!sql.includes("create policy"));
});

test("detail page denies another project before service-role data queries", async () => {
  let queried = false;
  const page = loadModule<
    typeof import("../../app/(ops)/tools/campaigns/[projectId]/page")
  >("src/app/(ops)/tools/campaigns/[projectId]/page.tsx", {
    "next/link": () => null,
    "next/navigation": {
      notFound() {
        throw new Error("404");
      },
    },
    "@/lib/auth/guard": {
      async requireStaff() {
        return { id: "staff", is_admin: false };
      },
      async canManageProject() {
        return false;
      },
    },
    "@/lib/campaign/repository": {
      db() {
        queried = true;
        throw new Error("Unexpected DB query");
      },
    },
    "@/lib/campaign/metrics": {},
    "@/lib/campaign/submission-repository": {},
    ...Object.fromEntries(
      [
        "PostsTable",
        "AddPostsDialog",
        "SnapshotDialog",
        "RulesPanel",
        "ReportsPanel",
        "TrendPanel",
        "SubmissionsPanel",
        "SnapshotBar",
      ].map((name) => [`@/components/admin/campaign/${name}`, {}]),
    ),
    "@/components/campaign/ResultsReport": {},
  });
  await assert.rejects(
    page.default({
      params: Promise.resolve({ projectId }),
      searchParams: Promise.resolve({}),
    }),
    /404/,
  );
  assert.equal(queried, false);
});

test("manager project list applies profile and project filters to service-role queries", async () => {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const repo = loadModule<typeof import("./repository")>(
    "src/lib/campaign/repository.ts",
    {
      "@/lib/instagram/handle": handles,
      "@/lib/supabase/admin": {
        createAdminClient() {
          return {
            from(table: string) {
              const query: Record<string, unknown> = {
                then(resolve: (r: unknown) => unknown) {
                  return Promise.resolve({
                    data:
                      table === "project_managers"
                        ? [{ project_id: projectId }]
                        : [
                            {
                              id: projectId,
                              title: "Allowed",
                              created_at: "2026-09-07",
                            },
                          ],
                    error: null,
                  }).then(resolve);
                },
              };
              for (const method of [
                "select",
                "eq",
                "is",
                "in",
                "order",
                "range",
              ])
                query[method] = (...args: unknown[]) => {
                  calls.push({ table, method, args });
                  return query;
                };
              return query;
            },
          };
        },
      },
    },
  );
  const projects = await repo.permittedProjects({
    id: "manager",
    is_admin: false,
  });
  assert.equal(projects.length, 1);
  assert.ok(
    calls.some(
      (c) =>
        c.table === "project_managers" &&
        c.method === "eq" &&
        c.args[0] === "profile_id" &&
        c.args[1] === "manager",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.table === "projects" &&
        c.method === "in" &&
        JSON.stringify(c.args[1]) === JSON.stringify([projectId]),
    ),
  );
});

test("public page renders only published payload and maps missing publication to 404", async () => {
  let payload: ReturnType<typeof buildReport> | null = buildReport(
    campaign(),
    {
      title: "Test campaign",
      client_label: null,
      settings: settings.normalizeReportSettings({}),
    },
    snapshotId,
  );
  const page = loadModule<typeof import("../../app/results/[code]/page")>(
    "src/app/results/[code]/page.tsx",
    {
      "next/navigation": {
        notFound() {
          throw new Error("404");
        },
      },
      "@/lib/campaign/report-data": {
        async loadPublishedReport() {
          return payload;
        },
      },
      "@/components/campaign/ResultsReport": { ResultsReport: () => null },
    },
  );
  const result = await page.default({
    params: Promise.resolve({ code: "abc1234" }),
  });
  assert.equal(result.props.report, payload);
  assert.equal(page.metadata.robots.index, false);
  payload = null;
  await assert.rejects(
    page.default({ params: Promise.resolve({ code: "missing" }) }),
    /404/,
  );
  const source = fs.readFileSync("src/app/results/[code]/page.tsx", "utf8");
  assert.ok(!source.includes("campaign_posts"));
  assert.ok(!source.includes("requireStaff"));
});

test("public SSR shows separate follower basis, coverage, no thumbnails or private data", () => {
  const component = loadModule<
    typeof import("../../components/campaign/ResultsReport")
  >("src/components/campaign/ResultsReport.tsx", {
    "./UploadProgress": loadModule("src/components/campaign/UploadProgress.tsx"),
    "@/components/brand/DeetzLogo": { DeetzLogo: () => null },
    "next/image": {
      default: (props: Record<string, unknown>) =>
        React.createElement("img", props),
    },
  });
  const report = buildReport(
    campaign(),
    {
      title: "Test campaign",
      client_label: null,
      settings: settings.normalizeReportSettings({ showAllPosts: true }),
    },
    snapshotId,
  );
  const markup = renderToStaticMarkup(
    React.createElement(component.ResultsReport, { report }),
  );
  assert.match(markup, /팔로워 미측정/);
  assert.match(markup, /1\/1개 기준/);
  assert.match(markup, /<svg/);
  assert.ok(!markup.includes("private"));
  assert.ok(!markup.includes("secret-run"));
  assert.ok(!markup.includes("scontent"));
});
