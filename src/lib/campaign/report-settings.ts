import type { ReportSettings } from "./types";
export function normalizeReportSettings(input: unknown): ReportSettings {
  const v =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const bool = (key: string, fallback: boolean) =>
    typeof v[key] === "boolean" ? (v[key] as boolean) : fallback;
  const str = (key: string) =>
    typeof v[key] === "string"
      ? (v[key] as string).trim().slice(0, 2000) || null
      : null;
  return {
    showFollowers: bool("showFollowers", true),
    showDisplayNames: bool("showDisplayNames", false),
    showTopPosts:
      typeof v.showTopPosts === "number" && Number.isFinite(v.showTopPosts)
        ? Math.max(0, Math.min(300, Math.floor(v.showTopPosts)))
        : 10,
    showAllPosts: bool("showAllPosts", false),
    showDistribution: bool("showDistribution", true),
    showFollowerTiers: bool("showFollowerTiers", true),
    showCompliance: bool("showCompliance", true),
    showForecast: bool("showForecast", false),
    noticeText: str("noticeText"),
    brandLabel: str("brandLabel"),
  };
}
