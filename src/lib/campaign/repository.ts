import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeInstagramHandle } from "@/lib/instagram/handle";
import type {
  AccountMetric,
  CampaignData,
  Metric,
  Post,
  Report,
  Rules,
  Snapshot,
  SnapshotCosts,
} from "./types";
export const db = () => createAdminClient() as unknown as SupabaseClient;
export const POST_COLUMNS =
  "id,project_id,short_code,post_url,owner_handle,owner_confirmed_at,collab_handles,dancer_id,application_id,display_name,forecast_member_id,forecast_expected_views,posted_at,source,status,note,created_by,created_at,updated_at";
export const SNAPSHOT_COLUMNS =
  "id,project_id,label,taken_at,source,status,error,reels_run_id,profiles_run_id,reels_dataset_id,profiles_dataset_id,apify_run_id,include_shares,posts_total,posts_found,target_post_ids,followers_collected,followers_snapshot_id,created_by,created_at";
export const COST_COLUMNS =
  "estimated_cost_usd,reels_estimated_cost_usd,profiles_estimated_cost_usd,apify_cost_usd";
export const METRIC_COLUMNS =
  "project_id,snapshot_id,post_id,fetch_status,plays,views_legacy,likes,likes_source,comments,comments_disabled,shares,audio_id,hashtags,mentions,paid_partnership,caption_excerpt";
export const REPORT_COLUMNS =
  "id,project_id,share_code,title,client_label,settings,published_snapshot_id,published_at,is_active,expires_at";
export function checked<T>({
  data,
  error,
}: {
  data: T;
  error: {
    message: string;
  } | null;
}): T {
  if (error) throw new Error(error.message);
  return data;
}
// Paginate every bulk read; PostgREST's default row limit must not truncate history.
export async function rows<T>(
  table: string,
  columns: string,
  project: string,
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const batch = checked(
      await db()
        .from(table)
        .select(columns)
        .eq("project_id", project)
        .range(offset, offset + 999),
    ) as T[];
    result.push(...batch);
    if (batch.length < 1000) return result;
  }
}
export const postsFor = (project: string) =>
  rows<Post>("campaign_posts", POST_COLUMNS, project);
export async function snapshotFor(project: string, id: string) {
  return checked(
    await db()
      .from("campaign_snapshots")
      .select(`${SNAPSHOT_COLUMNS},${COST_COLUMNS}`)
      .eq("project_id", project)
      .eq("id", id)
      .maybeSingle(),
  ) as (Snapshot & SnapshotCosts) | null;
}
export async function updateSnapshot(
  project: string,
  id: string,
  patch: object,
) {
  return checked(
    await db()
      .from("campaign_snapshots")
      .update(patch)
      .eq("project_id", project)
      .eq("id", id)
      .in("status", ["reserved", "running"])
      .select("id")
      .maybeSingle(),
  );
}
export async function projectOf(
  table: "campaign_posts" | "campaign_snapshots" | "campaign_reports",
  id: string,
): Promise<string | null> {
  const row = checked(
    await db().from(table).select("project_id").eq("id", id).maybeSingle(),
  );
  return row?.project_id ?? null;
}
export async function permittedProjects(profile: {
  id: string;
  is_admin: boolean;
}) {
  let ids: string[] | null = null;
  if (!profile.is_admin)
    ids = (
      checked(
        await db()
          .from("project_managers")
          .select("project_id")
          .eq("profile_id", profile.id),
      ) ?? []
    ).map((r: { project_id: string }) => r.project_id);
  if (ids?.length === 0) return [];
  let query = db()
    .from("projects")
    .select("id,title,created_at")
    .is("deleted_at", null)
    .order("created_at", {
      ascending: false,
    });
  if (ids) query = query.in("id", ids);
  const result: {
    id: string;
    title: string;
    created_at: string;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const batch = checked(
      await query.range(offset, offset + 999),
    ) as typeof result;
    result.push(...batch);
    if (batch.length < 1000) return result;
  }
}
export async function rulesFor(project: string): Promise<Rules> {
  return (
    (checked(
      await db()
        .from("campaign_rules")
        .select(
          "project_id,audio_id,required_tags,required_mentions,forecast_board_id,first_posted_at",
        )
        .eq("project_id", project)
        .maybeSingle(),
    ) as Rules) ?? {
      project_id: project,
      audio_id: null,
      required_tags: [],
      required_mentions: [],
      forecast_board_id: null,
      first_posted_at: null,
    }
  );
}
export async function boardOptions(project: string) {
  const boards = checked(
    await db()
      .from("casting_boards")
      .select("id,title,share_code,casting_board_members(count)")
      .eq("project_id", project),
  );
  return (
    boards as {
      id: string;
      title: string | null;
      share_code: string;
      casting_board_members: {
        count: number;
      }[];
    }[]
  )
    .map((b) => ({
      id: b.id,
      title: b.title ?? b.share_code,
      count: b.casting_board_members[0]?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}
export async function ensureRules(project: string, by: string) {
  const existing = checked(
    await db()
      .from("campaign_rules")
      .select("project_id")
      .eq("project_id", project)
      .maybeSingle(),
  );
  if (existing) return rulesFor(project);
  const boards = await boardOptions(project);
  checked(
    await db()
      .from("campaign_rules")
      .upsert(
        {
          project_id: project,
          forecast_board_id: boards[0]?.id ?? null,
          updated_by: by,
        },
        {
          onConflict: "project_id",
          ignoreDuplicates: true,
        },
      ),
  );
  return rulesFor(project);
}
export async function loadCampaign(project: string): Promise<CampaignData> {
  const [posts, snapshots, metrics, accounts, rules, reports] =
    await Promise.all([
      postsFor(project),
      rows<Snapshot>("campaign_snapshots", SNAPSHOT_COLUMNS, project),
      rows<Metric>("campaign_post_metrics", METRIC_COLUMNS, project),
      rows<AccountMetric>(
        "campaign_account_metrics",
        "project_id,snapshot_id,handle,followers,is_private",
        project,
      ),
      rulesFor(project),
      rows<Report>("campaign_reports", REPORT_COLUMNS, project),
    ]);
  snapshots.sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  return {
    posts,
    snapshots,
    metrics,
    accounts,
    rules,
    reports,
  };
}
export type Candidate = {
  applicationId: string;
  dancerId: string;
  name: string;
  handles: string[];
};
export async function candidatesFor(project: string): Promise<Candidate[]> {
  const apps = checked(
    await db()
      .from("applications")
      .select("id,dancer_id")
      .eq("project_id", project)
      .is("archived_at", null),
  ) as {
    id: string;
    dancer_id: string;
  }[];
  const ids = [...new Set(apps.map((a) => a.dancer_id))];
  if (!ids.length) return [];
  const dancers = checked(
    await db()
      .from("dancers")
      .select("id,profile_id,stage_name,social_links")
      .in("id", ids),
  ) as {
    id: string;
    profile_id: string | null;
    stage_name: string | null;
    social_links: {
      instagram?: string;
    } | null;
  }[];
  const ownerIds = dancers.flatMap((d) => (d.profile_id ? [d.profile_id] : []));
  const profiles = ownerIds.length
    ? (checked(
        await db()
          .from("profiles")
          .select("id,instagram_handle")
          .in("id", ownerIds),
      ) as {
        id: string;
        instagram_handle: string | null;
      }[])
    : [];
  return apps.flatMap((a) => {
    const d = dancers.find((d) => d.id === a.dancer_id);
    if (!d) return [];
    return [
      {
        applicationId: a.id,
        dancerId: d.id,
        name: d.stage_name ?? "이름 없음",
        handles: [
          ...new Set(
            [
              d.social_links?.instagram,
              profiles.find((p) => p.id === d.profile_id)?.instagram_handle,
            ].flatMap((v) => {
              const h = normalizeInstagramHandle(v ?? "");
              return h ? [h] : [];
            }),
          ),
        ],
      },
    ];
  });
}
export async function validatedLinks(
  project: string,
  dancer: string | null,
  application: string | null,
  handle: string | null,
) {
  if (application) {
    const app = checked(
      await db()
        .from("applications")
        .select("id")
        .eq("id", application)
        .eq("project_id", project)
        .eq("dancer_id", dancer ?? "")
        .maybeSingle(),
    );
    if (!app)
      throw new Error("지원서의 프로젝트와 참여자가 일치하지 않습니다.");
  } else if (dancer) {
    const app = checked(
      await db()
        .from("applications")
        .select("id")
        .eq("project_id", project)
        .eq("dancer_id", dancer)
        .limit(1),
    );
    if (!app?.length) {
      const participant = await db()
        .from("campaign_participants")
        .select("id")
        .eq("project_id", project)
        .eq("dancer_id", dancer)
        .eq("active", true)
        .limit(1);
      if (!participant.data?.length)
        throw new Error(
          "이 프로젝트의 지원자 또는 확정 참여자만 연결할 수 있습니다.",
        );
    }
  }
  const rules = await rulesFor(project);
  const board = rules.forecast_board_id
    ? checked(
        await db()
          .from("casting_boards")
          .select("id")
          .eq("id", rules.forecast_board_id)
          .eq("project_id", project)
          .maybeSingle(),
      )
    : null;
  if (rules.forecast_board_id && !board)
    throw new Error("예측 기준 보드의 프로젝트가 일치하지 않습니다.");
  const members = board
    ? (checked(
        await db()
          .from("casting_board_members")
          .select("id,ig_handle,expected_views")
          .eq("board_id", board.id),
      ) as {
        id: string;
        ig_handle: string | null;
        expected_views: number | null;
      }[])
    : [];
  const matches = members.filter(
    (m) => handle && normalizeInstagramHandle(m.ig_handle ?? "") === handle,
  );
  return {
    dancer_id: dancer,
    application_id: application,
    forecast_member_id: matches.length === 1 ? matches[0].id : null,
    forecast_expected_views:
      matches.length === 1 ? matches[0].expected_views : null,
  };
}
