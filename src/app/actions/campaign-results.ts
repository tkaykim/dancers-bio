"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, canManageProject, isSuperAdmin } from "@/lib/auth/guard";
import { normalizeInstagramHandle } from "@/lib/instagram/handle";
import {
  db,
  checked,
  postsFor,
  snapshotFor,
  updateSnapshot,
  projectOf,
  permittedProjects,
  ensureRules,
  validatedLinks,
  candidatesFor,
  POST_COLUMNS,
  REPORT_COLUMNS,
  METRIC_COLUMNS,
} from "@/lib/campaign/repository";
import { parsePostsInput } from "@/lib/campaign/import";
import { normalizeReportSettings } from "@/lib/campaign/report-settings";
import { prepareReport } from "@/lib/campaign/report-data";
import {
  estimateBudget,
  observedHandles,
  parseAccounts,
  parseObservations,
} from "@/lib/campaign/observations";
import * as apify from "@/lib/campaign/apify";
import type {
  ActionResult,
  Post,
  PostStatus,
  Report,
  Rules,
  Snapshot,
  SnapshotCosts,
} from "@/lib/campaign/types";
const DENIED = "이 프로젝트를 관리할 권한이 없습니다.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Staff = Awaited<ReturnType<typeof requireStaff>>;
async function authorized(profile: Staff, project: string) {
  return (
    UUID.test(project) &&
    (profile.is_admin || (await canManageProject(project)))
  );
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "요청을 처리할 수 없습니다.";
const refresh = (project: string) => {
  revalidatePath("/tools/campaigns");
  revalidatePath(`/tools/campaigns/${project}`);
};
async function action<T>(
  project: string,
  fn: (profile: Staff) => Promise<T>,
): Promise<ActionResult<T>> {
  const profile = await requireStaff();
  if (!(await authorized(profile, project)))
    return {
      ok: false,
      error: DENIED,
    };
  try {
    const data = await fn(profile);
    refresh(project);
    return {
      ok: true,
      data,
    };
  } catch (e) {
    return {
      ok: false,
      error: message(e),
    };
  }
}
async function identified<T>(
  table: "campaign_posts" | "campaign_snapshots" | "campaign_reports",
  id: string,
  fn: (project: string, profile: Staff) => Promise<T>,
): Promise<ActionResult<T>> {
  const profile = await requireStaff();
  if (!UUID.test(id))
    return {
      ok: false,
      error: DENIED,
    };
  try {
    const project = await projectOf(table, id);
    if (!project || !(await authorized(profile, project)))
      return {
        ok: false,
        error: DENIED,
      };
    return {
      ok: true,
      data: await fn(project, profile),
    };
  } catch (e) {
    return {
      ok: false,
      error: message(e),
    };
  }
}
export async function addCampaignAction(project: string) {
  return action(project, async (profile) => {
    // The selector and direct action share the manager scope.
    if (!(await permittedProjects(profile)).some((p) => p.id === project))
      throw new Error(DENIED);
    await ensureRules(project, profile.id);
    return createReport(project, profile.id, "캠페인 성과 보고서");
  });
}
export async function addPostsAction(
  project: string,
  input: string,
  csv = false,
  preview = false,
) {
  return action(project, async (profile) => {
    const parsed = parsePostsInput(input, csv);
    const existing = new Set(
      (await postsFor(project)).map((p) => p.short_code),
    );
    const conflicts = parsed
      .filter((p) => existing.has(p.short_code))
      .map((p) => p.short_code);
    if (conflicts.length)
      throw new Error(`이미 등록된 게시물입니다: ${conflicts.join(", ")}`);
    const candidates = await candidatesFor(project);
    const matches = parsed.map((p) => ({
      post: p,
      candidates: candidates.filter(
        (c) => p.owner_handle && c.handles.includes(p.owner_handle),
      ),
    }));
    if (preview)
      return {
        count: parsed.length,
        candidates: matches.map((m) => ({
          shortCode: m.post.short_code,
          candidates: m.candidates,
        })),
      };
    await ensureRules(project, profile.id);
    const rows = await Promise.all(
      matches.map(async (m) => {
        const uniqueDancers = new Set(m.candidates.map((c) => c.dancerId));
        const c =
          uniqueDancers.size === 1 && m.candidates.length === 1
            ? m.candidates[0]
            : null;
        return {
          ...m.post,
          project_id: project,
          source: csv ? "csv_import" : "admin_paste",
          created_by: profile.id,
          ...(await validatedLinks(
            project,
            c?.dancerId ?? null,
            c?.applicationId ?? null,
            m.post.owner_handle,
          )),
        };
      }),
    );
    checked(await db().from("campaign_posts").insert(rows));
    return {
      count: rows.length,
      candidates: matches
        .filter((m) => m.candidates.length > 1)
        .map((m) => ({
          shortCode: m.post.short_code,
          candidates: m.candidates,
        })),
    };
  });
}
export async function updatePostAction(
  id: string,
  input: {
    display_name: string | null;
    dancer_id: string | null;
    application_id: string | null;
    status: PostStatus;
    note: string | null;
    collab_handles: string[];
  },
) {
  return identified("campaign_posts", id, async (project) => {
    if (!["active", "unverified", "removed", "excluded"].includes(input.status))
      throw new Error("게시물 상태를 확인해 주세요.");
    const post = checked(
      await db()
        .from("campaign_posts")
        .select(POST_COLUMNS)
        .eq("project_id", project)
        .eq("id", id)
        .single(),
    ) as Post;
    if (input.status === "unverified" && post.status !== "unverified")
      throw new Error(
        "미확인은 유효 관측 2회 연속 조회 불가일 때 자동 적용됩니다.",
      );
    const handles = input.collab_handles.map((h) => {
      const v = normalizeInstagramHandle(h);
      if (!v) throw new Error("공동작업 핸들을 확인해 주세요.");
      return v;
    });
    const links = await validatedLinks(
      project,
      input.dancer_id,
      input.application_id,
      post.owner_handle,
    );
    checked(
      await db()
        .from("campaign_posts")
        .update({
          display_name: input.display_name?.trim().slice(0, 100) || null,
          note: input.note?.slice(0, 5000) || null,
          status: input.status,
          collab_handles: [...new Set(handles)].filter(
            (h) => h !== post.owner_handle,
          ),
          ...links,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", project)
        .eq("id", id),
    );
    refresh(project);
    return undefined;
  });
}
export async function getPostDetailAction(id: string) {
  return identified("campaign_posts", id, async (project) => ({
    metrics:
      checked(
        await db()
          .from("campaign_post_metrics")
          .select(`${METRIC_COLUMNS},raw`)
          .eq("project_id", project)
          .eq("post_id", id),
      ) ?? [],
    candidates: await candidatesFor(project),
  }));
}
export async function saveRulesAction(
  project: string,
  input: Omit<Rules, "project_id">,
) {
  return action(project, async (profile) => {
    if (
      input.forecast_board_id &&
      !checked(
        await db()
          .from("casting_boards")
          .select("id")
          .eq("project_id", project)
          .eq("id", input.forecast_board_id)
          .maybeSingle(),
      )
    )
      throw new Error("이 프로젝트의 보드만 선택할 수 있습니다.");
    if (
      input.first_posted_at &&
      !Number.isFinite(Date.parse(input.first_posted_at))
    )
      throw new Error("기준일을 확인해 주세요.");
    const tags = input.required_tags
      .map((v) => v.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);
    const mentions = input.required_mentions.map((v) => {
      const h = normalizeInstagramHandle(v);
      if (!h) throw new Error("필수 멘션을 확인해 주세요.");
      return h;
    });
    checked(
      await db()
        .from("campaign_rules")
        .upsert({
          project_id: project,
          audio_id: input.audio_id?.trim() || null,
          required_tags: [...new Set(tags)],
          required_mentions: [...new Set(mentions)],
          forecast_board_id: input.forecast_board_id,
          first_posted_at: input.first_posted_at,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        }),
    );
    return undefined;
  });
}
function snapshotResponse(s: Snapshot & SnapshotCosts, profile: Staff) {
  return {
    id: s.id,
    status: s.status,
    error: s.error,
    ...(isSuperAdmin(profile)
      ? {
          estimated_cost_usd: s.estimated_cost_usd,
          apify_cost_usd: s.apify_cost_usd,
        }
      : {}),
  };
}
export async function startSnapshotAction(
  project: string,
  options: {
    label: string;
    includeShares: boolean;
    collectFollowers: boolean;
  },
) {
  return action(project, async (profile) => {
    const posts = (await postsFor(project)).filter(
      (p) => p.status !== "excluded",
    );
    const known = observedHandles(posts, []);
    const budget = estimateBudget(
      posts.length,
      known.length + posts.filter((p) => !p.owner_handle).length,
      options.includeShares === true,
      options.collectFollowers === true,
    );
    const rules = await ensureRules(project, profile.id);
    const now = new Date();
    const day = (date: string) =>
      Math.floor((Date.parse(date) + 9 * 3600000) / 86400000);
    const { count } = await db()
      .from("campaign_snapshots")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("project_id", project);
    const label =
      options.label.trim().slice(0, 100) ||
      (rules.first_posted_at
        ? `T+${day(now.toISOString()) - day(rules.first_posted_at)}`
        : `S${(count ?? 0) + 1}`);
    const reserved = checked(
      await db().rpc("campaign_reserve_snapshot", {
        p_project: project,
        p_est_usd: budget.total,
        p_by: profile.id,
        p_targets: posts.map((p) => p.id),
        p_label: label,
        p_include_shares: options.includeShares === true,
        p_collect_followers: options.collectFollowers === true,
        p_reels_usd: budget.reels,
        p_profiles_usd: budget.profiles,
      }),
    );
    const s = (Array.isArray(reserved) ? reserved[0] : reserved) as Snapshot &
      SnapshotCosts;
    let run: apify.Run | null = null;
    try {
      run = await apify.startRun(
        "apify~instagram-reel-scraper",
        {
          username: posts.map((p) => p.post_url),
          resultsLimit: 1,
          includeSharesCount: s.include_shares,
          includeTranscript: false,
          includeDownloadedVideo: false,
        },
        {
          maxTotalChargeUsd: budget.reels,
          timeoutSecs: 600,
        },
      );
      if (
        !(await updateSnapshot(project, s.id, {
          status: "running",
          reels_run_id: run.id,
          apify_run_id: run.id,
          reels_dataset_id: run.defaultDatasetId,
        }))
      )
        throw new Error("실행 원장을 저장하지 못했습니다.");
      return snapshotResponse(
        {
          ...s,
          status: "running",
        },
        profile,
      );
    } catch (e) {
      if (run) await apify.abortRun(run.id).catch(() => undefined);
      await updateSnapshot(project, s.id, {
        status: "failed",
        error: message(e),
      }).catch(() => undefined);
      throw e;
    }
  });
}
export async function pollSnapshotAction(id: string) {
  return identified("campaign_snapshots", id, async (project, profile) => {
    const s = await snapshotFor(project, id);
    if (!s) throw new Error("회차를 찾을 수 없습니다.");
    if (["succeeded", "partial", "failed"].includes(s.status))
      return snapshotResponse(s, profile);
    if (!s.reels_run_id || s.profiles_run_id === "__starting__")
      return snapshotResponse(s, profile);
    const reelsRun = await apify.getRun(s.reels_run_id);
    const failed = (r: apify.Run) =>
      ["FAILED", "ABORTED", "TIMED-OUT"].includes(r.status);
    if (failed(reelsRun)) {
      await updateSnapshot(project, id, {
        status: "failed",
        error: `릴스 수집 ${reelsRun.status}`,
      });
      refresh(project);
      return snapshotResponse(
        {
          ...s,
          status: "failed",
          error: `릴스 수집 ${reelsRun.status}`,
        },
        profile,
      );
    }
    if (reelsRun.status !== "SUCCEEDED") return snapshotResponse(s, profile);
    const posts = (await postsFor(project)).filter((p) =>
      s.target_post_ids.includes(p.id),
    );
    const reels = await apify.readDataset(reelsRun.defaultDatasetId);
    let profiles: Awaited<ReturnType<typeof apify.readDataset>> = [],
      profileRun: apify.Run | null = null,
      partial = false,
      error: string | null = null;
    if (s.followers_collected && !s.profiles_run_id) {
      // Claim BEFORE the external side effect. A second poll cannot start another run.
      const claim = checked(
        await db()
          .from("campaign_snapshots")
          .update({
            profiles_run_id: "__starting__",
          })
          .eq("project_id", project)
          .eq("id", id)
          .eq("status", "running")
          .is("profiles_run_id", null)
          .select("id")
          .maybeSingle(),
      );
      if (!claim) return snapshotResponse(s, profile);
      const handles = observedHandles(posts, reels);
      let started: apify.Run | null = null;
      try {
        if (!handles.length)
          throw new Error("팔로워를 수집할 계정을 확인하지 못했습니다.");
        started = await apify.startRun(
          "apify~instagram-profile-scraper",
          {
            usernames: handles,
          },
          {
            maxTotalChargeUsd: s.profiles_estimated_cost_usd,
            timeoutSecs: 600,
          },
        );
        if (
          !(await updateSnapshot(project, id, {
            profiles_run_id: started.id,
            profiles_dataset_id: started.defaultDatasetId,
          }))
        )
          throw new Error("프로필 실행 원장을 저장하지 못했습니다.");
        return snapshotResponse(s, profile);
      } catch (e) {
        if (started) {
          await apify.abortRun(started.id).catch(() => undefined);
          await updateSnapshot(project, id, {
            status: "failed",
            error: message(e),
          }).catch(() => undefined);
          refresh(project);
          return snapshotResponse(
            {
              ...s,
              status: "failed",
              error: message(e),
            },
            profile,
          );
        }
        partial = true;
        error = message(e);
      }
    } else if (s.followers_collected && s.profiles_run_id) {
      profileRun = await apify.getRun(s.profiles_run_id);
      if (failed(profileRun)) {
        partial = true;
        error = `프로필 수집 ${profileRun.status}`;
      } else if (profileRun.status !== "SUCCEEDED")
        return snapshotResponse(s, profile);
      else profiles = await apify.readDataset(profileRun.defaultDatasetId);
    }
    const observations = parseObservations(project, id, posts, reels, profiles);
    const candidates = await candidatesFor(project);
    const metrics = await Promise.all(
      observations.map(async (metric) => {
        const post = posts.find((p) => p.id === metric.post_id)!;
        if (
          metric.fetch_status !== "found" ||
          !metric.owner_handle ||
          post.owner_confirmed_at
        )
          return metric;
        const matches = candidates.filter((c) =>
          c.handles.includes(metric.owner_handle!),
        );
        const match = matches.length === 1 ? matches[0] : null;
        const links = await validatedLinks(
          project,
          post.dancer_id ?? match?.dancerId ?? null,
          post.application_id ?? match?.applicationId ?? null,
          metric.owner_handle,
        );
        return {
          ...metric,
          links,
        };
      }),
    );
    const accounts = parseAccounts(
      project,
      id,
      profiles,
      profileRun?.id ?? null,
    );
    const result = checked(
      await db().rpc("campaign_finalize_snapshot", {
        p_snapshot: id,
        p_items: {
          items: metrics,
          meta: {
            cost:
              (reelsRun.usageTotalUsd ?? 0) + (profileRun?.usageTotalUsd ?? 0),
            followers_collected: s.followers_collected && !partial,
            partial,
            error,
          },
        },
        p_accounts: accounts,
      }),
    );
    refresh(project);
    return snapshotResponse(
      (Array.isArray(result) ? result[0] : result) as Snapshot & SnapshotCosts,
      profile,
    );
  });
}
export async function failStaleSnapshotAction(id: string) {
  return identified("campaign_snapshots", id, async (project) => {
    const s = await snapshotFor(project, id);
    if (
      !s ||
      !["reserved", "running"].includes(s.status) ||
      Date.now() - Date.parse(s.created_at) < 30 * 60000
    )
      throw new Error(
        "30분 이상 진행되지 않은 회차만 실패 처리할 수 있습니다.",
      );
    for (const runId of [s.reels_run_id, s.profiles_run_id])
      if (runId && runId !== "__starting__")
        await apify.abortRun(runId).catch(() => undefined);
    await updateSnapshot(project, id, {
      status: "failed",
      error: "운영자가 장기 미완료 실행을 종료했습니다.",
    });
    refresh(project);
    return undefined;
  });
}
async function createReport(project: string, by: string, title: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await db()
      .from("campaign_reports")
      .insert({
        project_id: project,
        title: title.trim().slice(0, 200) || "캠페인 성과 보고서",
        created_by: by,
        settings: normalizeReportSettings({}),
      })
      .select(REPORT_COLUMNS)
      .single();
    if (result.error?.code === "23505" && attempt === 0) continue;
    return checked(result) as Report;
  }
  throw new Error("공유 코드를 생성하지 못했습니다.");
}
export async function createReportAction(project: string, title: string) {
  return action(project, (profile) => createReport(project, profile.id, title));
}
export async function saveReportAction(
  id: string,
  input: {
    title: string;
    client_label: string | null;
    settings: unknown;
    is_active: boolean;
    expires_at: string | null;
  },
) {
  return identified("campaign_reports", id, async (project) => {
    if (!input.title.trim()) throw new Error("제목을 입력해 주세요.");
    if (input.expires_at && !Number.isFinite(Date.parse(input.expires_at)))
      throw new Error("만료 시각을 확인해 주세요.");
    checked(
      await db()
        .from("campaign_reports")
        .update({
          title: input.title.trim().slice(0, 200),
          client_label: input.client_label?.trim().slice(0, 200) || null,
          settings: normalizeReportSettings(input.settings),
          is_active: input.is_active === true,
          expires_at: input.expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", project)
        .eq("id", id),
    );
    refresh(project);
    return undefined;
  });
}
export async function previewReportAction(
  id: string,
  snapshot: string,
  trendIds?: string[],
) {
  return identified("campaign_reports", id, (project) =>
    prepareReport(project, id, snapshot, trendIds),
  );
}
export async function publishReportAction(
  id: string,
  snapshot: string,
  trendIds?: string[],
) {
  return identified("campaign_reports", id, async (project, profile) => {
    const payload = await prepareReport(project, id, snapshot, trendIds);
    checked(
      await db()
        .from("campaign_reports")
        .update({
          published_snapshot_id: snapshot,
          published_payload: payload,
          published_at: new Date().toISOString(),
          published_by: profile.id,
        })
        .eq("project_id", project)
        .eq("id", id),
    );
    refresh(project);
    return undefined;
  });
}
export async function costMetricsAction(project: string, manual?: number) {
  return action(project, async (profile) => {
    if (!isSuperAdmin(profile)) return {};
    if (manual !== undefined && (!Number.isFinite(manual) || manual < 0))
      throw new Error("공급가를 확인해 주세요.");
    const deals =
      checked(
        await db()
          .from("project_client_deals")
          .select("expected_supply_amount")
          .eq("project_id", project),
      ) ?? [];
    return {
      supplyAmount:
        manual ??
        deals.reduce(
          (
            n: number,
            d: {
              expected_supply_amount: number | null;
            },
          ) => n + Number(d.expected_supply_amount ?? 0),
          0,
        ),
      provisional: true,
    };
  });
}
