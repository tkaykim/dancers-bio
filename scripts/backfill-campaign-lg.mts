/** File only. Never run as part of build/tests. Default is a read-only dry run. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildBackfillPlan,
  backfillMetric,
  parseAccounts,
} from "../src/lib/campaign/backfill";
const args = process.argv.slice(2);
const argument = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const project = argument("--project"),
  timeseriesPath = argument("--timeseries"),
  profilesPath = argument("--profiles");
if (
  !project ||
  !/^[0-9a-f-]{36}$/i.test(project) ||
  !timeseriesPath ||
  !profilesPath
)
  throw new Error(
    "Usage: --project <uuid> --timeseries <path> --profiles <path> [--apply]",
  );
const plan = buildBackfillPlan(
  JSON.parse(await readFile(timeseriesPath, "utf8")),
  JSON.parse(await readFile(profilesPath, "utf8")),
);
const env: Record<string, string> = {};
for (const line of (await readFile(resolve(".env.local"), "utf8")).split(
  /\r?\n/,
)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error(".env.local 서비스롤 설정이 필요합니다.");
const client = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
    },
  },
);
function check<T>(result: {
  data: T;
  error: {
    message: string;
  } | null;
}): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
if (
  !check(
    await client.from("projects").select("id").eq("id", project).maybeSingle(),
  )
)
  throw new Error("프로젝트를 찾을 수 없습니다.");
const apply = args.includes("--apply");
const existing =
  check(
    await client
      .from("campaign_snapshots")
      .select("apify_run_id,status")
      .eq("project_id", project),
  ) ?? [];
const knownRuns = new Set(existing.map((r) => r.apify_run_id));
const accountPreview = parseAccounts(
  project,
  "preview",
  plan.profiles,
  plan.profileRun.id,
);
console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      project,
      posts: plan.posts.length,
      followers: {
        confirmed: accountPreview.filter((a) => a.followers !== null).length,
        accounts: accountPreview.length,
        sum: accountPreview.reduce((n, a) => n + (a.followers ?? 0), 0),
      },
      rounds: plan.rounds.map((r) => ({
        label: r.label,
        takenAt: r.takenAt,
        runId: r.runId,
        skip: knownRuns.has(r.runId),
      })),
    },
    null,
    2,
  ),
);
if (
  accountPreview.filter((a) => a.followers !== null).length !== 100 ||
  accountPreview.reduce((n, a) => n + (a.followers ?? 0), 0) !== 261711
) {
  console.warn(
    "프로필 원본은 기획안의 100계정·261,711명과 다릅니다. 누락 보정의 원본·측정 시각·run 출처를 별도로 확인하세요. 원본에 없는 값은 적재하지 않습니다.",
  );
}
if (apply) {
  check(
    await client.from("campaign_rules").upsert(
      {
        project_id: project,
      },
      {
        onConflict: "project_id",
        ignoreDuplicates: true,
      },
    ),
  );
  for (const round of plan.rounds) {
    if (knownRuns.has(round.runId)) {
      console.log(`skip ${round.runId}`);
      continue;
    }
    check(
      await client.from("campaign_posts").upsert(
        plan.posts.map((p) => ({
          project_id: project,
          short_code: p.short_code,
          post_url: p.post_url,
          owner_handle: p.owner_handle,
          collab_handles: p.collab_handles,
          posted_at: p.posted_at,
          source: p.source,
          display_name: null,
        })),
        {
          onConflict: "project_id,short_code",
          ignoreDuplicates: true,
        },
      ),
    );
    const posts =
      check(
        await client
          .from("campaign_posts")
          .select("id,short_code")
          .eq("project_id", project)
          .in(
            "short_code",
            plan.posts.map((p) => p.short_code),
          ),
      ) ?? [];
    const ids = new Map(posts.map((p) => [p.short_code, p.id]));
    const last = round.label === "T+10";
    const inserted = await client
      .from("campaign_snapshots")
      .insert({
        project_id: project,
        label: round.label,
        source: "backfill",
        taken_at: round.takenAt,
        status: "reserved",
        apify_run_id: round.runId,
        reels_run_id: round.runId,
        profiles_run_id: last ? plan.profileRun.id : null,
        target_post_ids: posts.map((p) => p.id),
        posts_total: posts.length,
        include_shares: last,
        followers_collected: last,
      })
      .select("id")
      .single();
    if (inserted.error?.code === "23505") {
      console.log(`skip ${round.runId}`);
      continue;
    }
    const snapshot = check(inserted)!;
    check(
      await client.rpc("campaign_finalize_snapshot", {
        p_snapshot: snapshot.id,
        p_items: {
          items: plan.posts.map((p) =>
            backfillMetric(
              project,
              snapshot.id,
              ids.get(p.short_code)!,
              p.row,
              round.key,
            ),
          ),
          meta: {
            cost: round.cost + (last ? plan.profileRun.usageTotalUsd : 0),
            followers_collected: last,
            partial: false,
          },
        },
        p_accounts: last
          ? parseAccounts(
              project,
              snapshot.id,
              plan.profiles,
              plan.profileRun.id,
            )
          : [],
      }),
    );
    console.log(`finalized ${round.label} ${round.runId}`);
  }
}
