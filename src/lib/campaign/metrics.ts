import type {
  AccountMetric,
  CampaignData,
  Comparison,
  Compliance,
  Coverage,
  Forecast,
  Metric,
  Post,
  Rules,
  Summary,
  Tier,
} from "./types";
export const isConfirmed = (status: string) =>
  status === "succeeded" || status === "partial";
export const coverageLabel = (confirmed: number, total: number, unit = "개") =>
  `${confirmed}/${total}${unit} 기준`;
export function coverage(
  values: (number | null)[],
  total = values.length,
): Coverage {
  const known = values.filter(
    (v): v is number => v !== null && Number.isFinite(v) && v >= 0,
  );
  return {
    sum: known.reduce((a, b) => a + b, 0),
    confirmed: known.length,
    total,
    label: coverageLabel(known.length, total),
  };
}
export const handlesOf = (post: Post) => [
  ...new Set(
    [post.owner_handle, ...post.collab_handles].filter((v): v is string => !!v),
  ),
];
export function postFollowers(post: Post, accounts: AccountMetric[]): Coverage {
  const map = new Map(accounts.map((a) => [a.handle, a.followers]));
  const handles = handlesOf(post);
  const result = coverage(handles.map((h) => map.get(h) ?? null));
  return {
    ...result,
    label: coverageLabel(result.confirmed, handles.length, "계정"),
  };
}
export function compliance(
  metric: Metric | undefined,
  rules: Rules,
): Compliance {
  const found = metric?.fetch_status === "found";
  const result: Compliance = {};
  if (rules.audio_id)
    result.audio =
      found && metric.audio_id !== null
        ? metric.audio_id === rules.audio_id
        : null;
  if (rules.required_tags.length)
    result.tags =
      found && metric.hashtags !== null
        ? rules.required_tags.every((t) => metric.hashtags!.includes(t))
        : null;
  if (rules.required_mentions.length)
    result.mentions =
      found && metric.mentions !== null
        ? rules.required_mentions.every((t) => metric.mentions!.includes(t))
        : null;
  result.partnership = found ? metric.paid_partnership : null;
  return result;
}
export function selectedRows(posts: Post[], metrics: Metric[]) {
  const ids = new Set(
    posts.filter((p) => p.status !== "excluded").map((p) => p.id),
  );
  return metrics.filter((m) => ids.has(m.post_id));
}
export function summarize(
  posts: Post[],
  metrics: Metric[],
  accounts: AccountMetric[],
  rules: Rules,
): Summary {
  const rows = selectedRows(posts, metrics);
  const valid = rows.filter((m) => m.fetch_status !== "error");
  const found = valid.filter((m) => m.fetch_status === "found");
  const validIds = new Set(valid.map((m) => m.post_id));
  const handles = [
    ...new Set(posts.filter((p) => validIds.has(p.id)).flatMap(handlesOf)),
  ];
  const accountMap = new Map(accounts.map((a) => [a.handle, a.followers]));
  const totals: Summary["compliance"] = {};
  for (const row of valid)
    for (const [key, value] of Object.entries(compliance(row, rules))) {
      const field = key as keyof Compliance;
      const stat = totals[field] ?? {
        passed: 0,
        confirmed: 0,
        total: 0,
      };
      stat.total++;
      if (value !== null) stat.confirmed++;
      if (value === true) stat.passed++;
      totals[field] = stat;
    }
  return {
    posts: valid.length,
    found: found.length,
    errors: rows.length - valid.length,
    plays: coverage(
      found.map((m) => m.plays),
      valid.length,
    ),
    likes: coverage(
      found.map((m) => m.likes),
      valid.length,
    ),
    comments: coverage(
      found.map((m) => m.comments),
      valid.length,
    ),
    shares: coverage(
      found.map((m) => m.shares),
      valid.length,
    ),
    accounts: handles.length,
    followers: coverage(handles.map((h) => accountMap.get(h) ?? null)),
    compliance: totals,
  };
}
export function compareSameSet(before: Metric[], after: Metric[]): Comparison {
  const old = new Map(
    before
      .filter((m) => m.fetch_status === "found" && m.plays !== null)
      .map((m) => [m.post_id, m.plays!]),
  );
  const shared = after.filter(
    (m) => m.fetch_status === "found" && m.plays !== null && old.has(m.post_id),
  );
  const a = shared.reduce((n, m) => n + old.get(m.post_id)!, 0);
  const b = shared.reduce((n, m) => n + m.plays!, 0);
  const growth = a ? ((b - a) / a) * 100 : null;
  return {
    count: shared.length,
    before: a,
    after: b,
    growth,
    recommendStop: growth !== null && growth < 5,
  };
}
export function distribution(metrics: Metric[]) {
  const limits = [500, 1000, 2000, 5000, 10000, Infinity];
  const labels = [
    "500 미만",
    "500–999",
    "1,000–1,999",
    "2,000–4,999",
    "5,000–9,999",
    "10,000 이상",
  ];
  return limits.map((upper, i) => ({
    label: labels[i],
    count: metrics.filter(
      (m) =>
        m.fetch_status === "found" &&
        m.plays !== null &&
        m.plays >= (limits[i - 1] ?? 0) &&
        m.plays < upper,
    ).length,
  }));
}
export function topShares(metrics: Metric[]) {
  const plays = metrics
    .filter((m) => m.fetch_status === "found" && m.plays !== null)
    .map((m) => m.plays!)
    .sort((a, b) => b - a);
  const total = plays.reduce((a, b) => a + b, 0);
  return [1, 5, 10].map((top) => ({
    top,
    percent: total
      ? (plays.slice(0, top).reduce((a, b) => a + b, 0) / total) * 100
      : null,
  }));
}
export function followerTiers(
  posts: Post[],
  metrics: Metric[],
  accounts: AccountMetric[],
): Tier[] {
  const tiers = [1000, 5000, 10000, Infinity];
  const labels = ["1천 미만", "1천–5천", "5천–1만", "1만 이상"];
  const map = new Map(
    selectedRows(posts, metrics)
      .filter((m) => m.fetch_status === "found" && m.plays !== null)
      .map((m) => [m.post_id, m]),
  );
  return tiers.map((upper, i) => {
    const rows = posts
      .filter((p) => map.has(p.id))
      .map((p) => ({
        f: postFollowers(p, accounts),
        m: map.get(p.id)!,
      }))
      .filter(
        ({ f }) =>
          f.total > 0 &&
          f.confirmed === f.total &&
          f.sum >= (tiers[i - 1] ?? 0) &&
          f.sum < upper,
      );
    const plays = rows.reduce((n, r) => n + r.m.plays!, 0),
      followers = rows.reduce((n, r) => n + r.f.sum, 0);
    return {
      label: labels[i],
      posts: rows.length,
      plays,
      followers,
      average: rows.length ? plays / rows.length : null,
      ratio: followers ? plays / followers : null,
    };
  });
}
export function forecast(posts: Post[], metrics: Metric[]): Forecast {
  const values = new Map(
    selectedRows(posts, metrics)
      .filter((m) => m.fetch_status === "found" && m.plays !== null)
      .map((m) => [m.post_id, m.plays!]),
  );
  const groups = new Map<
    string,
    {
      plays: number;
      expected: number | null;
      measured: boolean;
    }
  >();
  for (const p of posts.filter(
    (p) => p.status !== "excluded" && p.owner_handle,
  )) {
    const g = groups.get(p.owner_handle!) ?? {
      plays: 0,
      expected: null,
      measured: false,
    };
    g.plays += values.get(p.id) ?? 0;
    g.measured ||= values.has(p.id);
    // Multiple posts of one account share one preserved forecast, never sum it.
    if (
      g.expected === null &&
      p.forecast_expected_views &&
      p.forecast_expected_views > 0
    )
      g.expected = p.forecast_expected_views;
    groups.set(p.owner_handle!, g);
  }
  const accounts = [...groups].flatMap(([handle, g]) =>
    g.expected && g.measured
      ? [
          {
            handle,
            plays: g.plays,
            expected: g.expected,
            realization: (g.plays / g.expected) * 100,
          },
        ]
      : [],
  );
  const sorted = accounts.map((a) => a.realization).sort((a, b) => a - b);
  const median = sorted.length
    ? (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) /
      2
    : null;
  return {
    accounts,
    confirmed: accounts.length,
    total: groups.size,
    median,
    label: coverageLabel(accounts.length, groups.size, "계정"),
  };
}
export function snapshotContext(data: CampaignData, id: string) {
  const snapshot = data.snapshots.find(
    (s) => s.id === id && isConfirmed(s.status),
  );
  if (!snapshot) throw new Error("확정된 회차를 선택해 주세요.");
  return {
    snapshot,
    metrics: data.metrics.filter((m) => m.snapshot_id === id),
    accounts: data.accounts.filter(
      (a) => a.snapshot_id === snapshot.followers_snapshot_id,
    ),
    followersSnapshot:
      data.snapshots.find((s) => s.id === snapshot.followers_snapshot_id) ??
      null,
  };
}
