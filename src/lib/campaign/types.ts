export type SnapshotStatus =
  | "reserved"
  | "running"
  | "succeeded"
  | "partial"
  | "failed";
export type PostStatus = "active" | "unverified" | "removed" | "excluded";
export type Post = {
  id: string;
  project_id: string;
  short_code: string;
  post_url: string;
  owner_handle: string | null;
  owner_confirmed_at: string | null;
  collab_handles: string[];
  dancer_id: string | null;
  application_id: string | null;
  display_name: string | null;
  forecast_member_id: string | null;
  forecast_expected_views: number | null;
  posted_at: string | null;
  source: "admin_paste" | "csv_import" | "participant" | "backfill";
  status: PostStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type Snapshot = {
  id: string;
  project_id: string;
  label: string;
  taken_at: string;
  source: "apify" | "backfill";
  status: SnapshotStatus;
  error: string | null;
  reels_run_id: string | null;
  profiles_run_id: string | null;
  reels_dataset_id: string | null;
  profiles_dataset_id: string | null;
  apify_run_id: string | null;
  include_shares: boolean;
  posts_total: number;
  posts_found: number;
  target_post_ids: string[];
  followers_collected: boolean;
  followers_snapshot_id: string | null;
  created_by: string | null;
  created_at: string;
};
export type SnapshotCosts = {
  estimated_cost_usd: number;
  reels_estimated_cost_usd: number;
  profiles_estimated_cost_usd: number;
  apify_cost_usd: number | null;
};
export type Metric = {
  project_id: string;
  snapshot_id: string;
  post_id: string;
  fetch_status: "found" | "not_found" | "error";
  plays: number | null;
  views_legacy: number | null;
  likes: number | null;
  likes_source: "reel" | "profile" | null;
  comments: number | null;
  comments_disabled: boolean;
  shares: number | null;
  audio_id: string | null;
  hashtags: string[] | null;
  mentions: string[] | null;
  paid_partnership: boolean | null;
  caption_excerpt: string | null;
};
export type AccountMetric = {
  project_id: string;
  snapshot_id: string;
  handle: string;
  followers: number | null;
  is_private: boolean;
};
export type Rules = {
  project_id: string;
  audio_id: string | null;
  required_tags: string[];
  required_mentions: string[];
  forecast_board_id: string | null;
  first_posted_at: string | null;
};
export type ReportSettings = {
  layout?: "analysis" | "delivery";
  approximateViews?: boolean;
  upcoming?: { name: string; handle: string | null; date: string | null }[];
  followerObservations?: { handle: string; count: number; checkedAt: string }[];
  showFollowers: boolean;
  showDisplayNames: boolean;
  showTopPosts: number;
  showAllPosts: boolean;
  showDistribution: boolean;
  showFollowerTiers: boolean;
  showCompliance: boolean;
  showForecast: boolean;
  noticeText: string | null;
  brandLabel: string | null;
};
export type Report = {
  id: string;
  project_id: string;
  share_code: string;
  title: string;
  client_label: string | null;
  settings: ReportSettings;
  published_snapshot_id: string | null;
  published_at: string | null;
  is_active: boolean;
  expires_at: string | null;
};
export type ActionResult<T = undefined> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };
export type CampaignData = {
  posts: Post[];
  snapshots: Snapshot[];
  metrics: Metric[];
  accounts: AccountMetric[];
  rules: Rules;
  reports: Report[];
};
export type Coverage = {
  sum: number;
  confirmed: number;
  total: number;
  label: string;
};
export type Compliance = Partial<
  Record<"audio" | "tags" | "mentions" | "partnership", boolean | null>
>;
export type Summary = {
  posts: number;
  found: number;
  errors: number;
  plays: Coverage;
  likes: Coverage;
  comments: Coverage;
  shares: Coverage;
  accounts: number;
  followers: Coverage;
  compliance: Partial<
    Record<
      keyof Compliance,
      {
        passed: number;
        confirmed: number;
        total: number;
      }
    >
  >;
};
export type PublicPost = {
  shortCode: string;
  url: string;
  handle: string | null;
  collabHandles: string[];
  displayName?: string | null;
  postedAt: string | null;
  plays: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  found: boolean;
  followers?: Coverage;
  compliance?: Compliance;
};
export type Comparison = {
  count: number;
  before: number;
  after: number;
  growth: number | null;
  recommendStop: boolean;
};
export type Tier = {
  label: string;
  posts: number;
  plays: number;
  followers: number;
  average: number | null;
  ratio: number | null;
};
export type Forecast = {
  accounts: {
    handle: string;
    plays: number;
    expected: number;
    realization: number;
  }[];
  confirmed: number;
  total: number;
  median: number | null;
  label: string;
};
export type PublicReport = {
  delivery?: {
    participants: number;
    posts: number;
    measured: number;
    views: number | null;
    approximate: boolean;
    items: { url: string; names: string[]; handle: string | null; views: number | null; followers?: number | null }[];
    upcoming: { name: string; handle: string | null; date: string | null; followers?: number | null }[];
    followersCheckedAt?: string | null;
  };
  uploads?: import("./submissions").PublicUploads;
  version: 1;
  title: string;
  clientLabel: string | null;
  settings: ReportSettings;
  snapshot: {
    id: string;
    label: string;
    takenAt: string;
  };
  followersSnapshot?: {
    label: string;
    takenAt: string;
  } | null;
  summary: Omit<Summary, "followers" | "compliance"> & {
    followers?: Coverage;
    compliance?: Summary["compliance"];
  };
  trend: {
    id: string;
    label: string;
    takenAt: string;
    plays: number;
    found: number;
    total: number;
    comparison: Comparison | null;
  }[];
  distribution?: {
    label: string;
    count: number;
  }[];
  topShares?: {
    top: number;
    percent: number | null;
  }[];
  followerTiers?: Tier[];
  topPosts: PublicPost[];
  allPosts?: PublicPost[];
  forecast?: Forecast;
  notice: string;
};
