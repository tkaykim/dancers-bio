// 캐스팅 보드 라인업 예측 — 순수 함수 모음.
// 팔로워·최근 릴스 기대조회·진행 상태로 예상 조회 구간과 상호작용을 계산한다.
// 금액(신청액·제안액·확정액)은 여기서 다루지 않는다. 보드 설정과 카드 데이터는 클라이언트로 직렬화된다.

export type LineupStatus = "confirmed" | "negotiating" | "proposed";
export type AccountType = "individual" | "team" | "format";
export type LineupTier = "anchor" | "mid" | "longtail";
export type ForecastGroupBy = "tier" | "status";

export const LINEUP_STATUSES: readonly LineupStatus[] = [
  "confirmed",
  "negotiating",
  "proposed",
];
export const LINEUP_STATUS_LABEL: Record<LineupStatus, string> = {
  confirmed: "확정 진행",
  negotiating: "협의 중",
  proposed: "제안 예정",
};
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  individual: "개인",
  team: "팀",
  format: "기획형",
};
export const TIER_ORDER: readonly LineupTier[] = ["anchor", "mid", "longtail"];
export const TIER_LABEL: Record<LineupTier, string> = {
  anchor: "앵커",
  mid: "미드",
  longtail: "롱테일",
};
export const TIER_DESCRIPTION: Record<LineupTier, string> = {
  anchor: "최근 릴스 평균 조회 5만 회 이상",
  mid: "최근 릴스 평균 조회 1만~5만 회",
  longtail: "최근 릴스 평균 조회 1만 회 미만",
};
export const TIER_THRESHOLDS = { anchor: 50_000, mid: 10_000 } as const;

export type ForecastSettings = {
  enabled?: boolean;
  collectedOn?: string | null;
  horizonLabel?: string | null;
  realization?: { low?: number; base?: number; high?: number } | null;
  engagementRates?: { like?: number; comment?: number; share?: number } | null;
  showAccountMetrics?: boolean;
  includeProposed?: boolean;
  // 섹션 기준: tier(앵커·미드·롱테일) 또는 status(확정 진행·협의 중·제안 예정).
  groupBy?: ForecastGroupBy;
  // 구성 막대(LINEUP MIX)·산출 근거 문구·카드 배지 표시 여부. 기본은 모두 표시.
  showComposition?: boolean;
  showMethodology?: boolean;
  showBadges?: boolean;
  // 협의 중 그룹의 표시 라벨(예: "협의 중 후보")과 한 줄 안내문. 예상 조회·상호작용 카드 표시 여부.
  candidateLabel?: string | null;
  candidateNotice?: string | null;
  showViewsForecast?: boolean;
  // 팔로워 합계 카드·섹션 설명 표시 여부.
  showFollowersTotal?: boolean;
  // 상단 요약 블록(카드·안내문) 전체 표시 여부. 끄면 헤더 칩과 섹션만 남는다.
  showSummary?: boolean;
};

export type ResolvedForecastSettings = {
  enabled: boolean;
  collectedOn: string | null;
  horizonLabel: string;
  realization: { low: number; base: number; high: number };
  engagementRates: { like: number; comment: number; share: number };
  showAccountMetrics: boolean;
  includeProposed: boolean;
  groupBy: ForecastGroupBy;
  showComposition: boolean;
  showMethodology: boolean;
  showBadges: boolean;
  candidateLabel: string;
  candidateNotice: string | null;
  showViewsForecast: boolean;
  showFollowersTotal: boolean;
  showSummary: boolean;
};

// 실현율 기본값: 직전 브랜드 음원 챌린지(LG) 실측 재생 ÷ 계정 평상시 기대조회 중앙값 0.52를 보수값으로 둔다.
const DEFAULT_REALIZATION = { low: 0.5, base: 0.75, high: 1 };
// 상호작용 기본 비율: 같은 캠페인 88개 게시물 T+10 실측(좋아요 4.4% · 댓글 0.23% · 공유 0.28%).
const DEFAULT_ENGAGEMENT = { like: 0.044, comment: 0.0023, share: 0.0028 };

function ratio(value: unknown, fallback: number, max = 5): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(n, 0), max);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeForecastSettings(
  raw: ForecastSettings | null | undefined,
): ResolvedForecastSettings {
  const low = ratio(raw?.realization?.low, DEFAULT_REALIZATION.low);
  const high = Math.max(low, ratio(raw?.realization?.high, DEFAULT_REALIZATION.high));
  const base = Math.min(
    Math.max(ratio(raw?.realization?.base, DEFAULT_REALIZATION.base), low),
    high,
  );
  return {
    enabled: raw?.enabled === true,
    collectedOn: text(raw?.collectedOn),
    horizonLabel: text(raw?.horizonLabel) ?? "D+14",
    realization: { low, base, high },
    engagementRates: {
      like: ratio(raw?.engagementRates?.like, DEFAULT_ENGAGEMENT.like, 1),
      comment: ratio(raw?.engagementRates?.comment, DEFAULT_ENGAGEMENT.comment, 1),
      share: ratio(raw?.engagementRates?.share, DEFAULT_ENGAGEMENT.share, 1),
    },
    showAccountMetrics: raw?.showAccountMetrics !== false,
    includeProposed: raw?.includeProposed !== false,
    groupBy: raw?.groupBy === "status" ? "status" : "tier",
    showComposition: raw?.showComposition !== false,
    showMethodology: raw?.showMethodology !== false,
    showBadges: raw?.showBadges !== false,
    candidateLabel: text(raw?.candidateLabel) ?? LINEUP_STATUS_LABEL.negotiating,
    candidateNotice: text(raw?.candidateNotice),
    showViewsForecast: raw?.showViewsForecast !== false,
    showFollowersTotal: raw?.showFollowersTotal !== false,
    showSummary: raw?.showSummary !== false,
  };
}

export function normalizeLineupStatus(value: unknown): LineupStatus | null {
  return typeof value === "string" &&
    (LINEUP_STATUSES as readonly string[]).includes(value)
    ? (value as LineupStatus)
    : null;
}

export function normalizeAccountType(value: unknown): AccountType | null {
  return value === "individual" || value === "team" || value === "format"
    ? value
    : null;
}

export function normalizeTier(value: unknown): LineupTier | null {
  return value === "anchor" || value === "mid" || value === "longtail" ? value : null;
}

// 명시된 티어를 우선하고, 없으면 기대조회로 판정한다. 기대조회가 없으면 미측정(null).
export function resolveTier(
  expectedViews: number | null | undefined,
  explicit?: unknown,
): LineupTier | null {
  const given = normalizeTier(explicit);
  if (given) return given;
  if (expectedViews == null || !Number.isFinite(expectedViews)) return null;
  if (expectedViews >= TIER_THRESHOLDS.anchor) return "anchor";
  if (expectedViews >= TIER_THRESHOLDS.mid) return "mid";
  return "longtail";
}

export type LineupMemberMetrics = {
  lineupStatus: LineupStatus | null;
  followers: number | null;
  expectedViews: number | null;
  tier: LineupTier | null;
};

export type ForecastRange = { low: number; base: number; high: number };

export type ForecastGroup = {
  count: number;
  measured: number;
  followers: number;
  expectedViews: number;
  views: ForecastRange;
  engagement: {
    like: ForecastRange;
    comment: ForecastRange;
    share: ForecastRange;
  };
};

export type ForecastTier = {
  tier: LineupTier;
  label: string;
  count: number;
  expectedViews: number;
  share: number;
};

export type ForecastStatusGroup = {
  status: LineupStatus;
  label: string;
  group: ForecastGroup;
};

export type ForecastSummary = {
  settings: ResolvedForecastSettings;
  counts: {
    total: number;
    confirmed: number;
    negotiating: number;
    proposed: number;
    unmeasured: number;
  };
  confirmed: ForecastGroup;
  all: ForecastGroup;
  tiers: ForecastTier[];
  byStatus: ForecastStatusGroup[];
};

function scaleTotal(
  total: number,
  realization: ResolvedForecastSettings["realization"],
): ForecastRange {
  return {
    low: Math.round(total * realization.low),
    base: Math.round(total * realization.base),
    high: Math.round(total * realization.high),
  };
}

function scaleRange(range: ForecastRange, rate: number): ForecastRange {
  return {
    low: Math.round(range.low * rate),
    base: Math.round(range.base * rate),
    high: Math.round(range.high * rate),
  };
}

function buildGroup(
  members: LineupMemberMetrics[],
  settings: ResolvedForecastSettings,
): ForecastGroup {
  const measured = members.filter((member) => member.expectedViews != null);
  const expectedViews = measured.reduce(
    (sum, member) => sum + (member.expectedViews ?? 0),
    0,
  );
  const views = scaleTotal(expectedViews, settings.realization);
  return {
    count: members.length,
    measured: measured.length,
    followers: members.reduce((sum, member) => sum + (member.followers ?? 0), 0),
    expectedViews,
    views,
    engagement: {
      like: scaleRange(views, settings.engagementRates.like),
      comment: scaleRange(views, settings.engagementRates.comment),
      share: scaleRange(views, settings.engagementRates.share),
    },
  };
}

// 라인업 상태가 있는 큐레이션 멤버만 집계한다. 미측정 인원은 인원·팔로워에는 넣고 조회·상호작용에서는 뺀다.
export function buildForecastSummary(
  members: LineupMemberMetrics[],
  settings: ResolvedForecastSettings,
): ForecastSummary {
  const curated = members.filter(
    (member) =>
      member.lineupStatus &&
      (settings.includeProposed || member.lineupStatus !== "proposed"),
  );
  const confirmed = curated.filter((member) => member.lineupStatus === "confirmed");
  const all = buildGroup(curated, settings);
  const tiers = TIER_ORDER.map((tier) => {
    const rows = curated.filter(
      (member) => resolveTier(member.expectedViews, member.tier) === tier,
    );
    const expectedViews = rows.reduce(
      (sum, member) => sum + (member.expectedViews ?? 0),
      0,
    );
    return {
      tier,
      label: TIER_LABEL[tier],
      count: rows.length,
      expectedViews,
      share: all.expectedViews > 0 ? expectedViews / all.expectedViews : 0,
    };
  });
  const byStatus = LINEUP_STATUSES.filter(
    (status) => settings.includeProposed || status !== "proposed",
  ).map((status) => ({
    status,
    label:
      status === "negotiating" ? settings.candidateLabel : LINEUP_STATUS_LABEL[status],
    group: buildGroup(
      curated.filter((member) => member.lineupStatus === status),
      settings,
    ),
  }));
  return {
    settings,
    counts: {
      total: curated.length,
      confirmed: confirmed.length,
      negotiating: curated.filter((member) => member.lineupStatus === "negotiating")
        .length,
      proposed: curated.filter((member) => member.lineupStatus === "proposed").length,
      unmeasured: curated.filter((member) => member.expectedViews == null).length,
    },
    confirmed: buildGroup(confirmed, settings),
    all,
    tiers,
    byStatus,
  };
}

// 147만 / 4.7만 / 8천 / 600 형태의 한국어 축약 표기.
// 1만 미만은 천 단위로 반올림하고 9천 이상은 1만으로 올린다(대표 지시: 9,306→1만, 7,979→8천, 7,192→7천).
export function formatKoCount(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const v = Math.round(value);
  if (v >= 100_000) return `${Math.round(v / 10_000).toLocaleString("ko-KR")}만`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(1).replace(/\.0$/, "")}만`;
  if (v >= 9_000) return "1만";
  if (v >= 1_000) return `${Math.round(v / 1_000)}천`;
  if (v >= 100) return `${Math.round(v / 100) * 100}`;
  return v.toLocaleString("ko-KR");
}

export function formatKoRange(low: number, high: number): string {
  return low === high
    ? formatKoCount(low)
    : `${formatKoCount(low)}~${formatKoCount(high)}`;
}
