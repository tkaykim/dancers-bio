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
    layout: v.layout === "delivery" ? "delivery" : "analysis",
    approximateViews: bool("approximateViews", false),
    followerObservations: Array.isArray(v.followerObservations) ? v.followerObservations.slice(0,400).flatMap(item => {
      if (!item || typeof item !== "object" || typeof item.handle !== "string" || !/^[a-z0-9._]{1,30}$/i.test(item.handle) ||
        !Number.isSafeInteger(item.count) || item.count < 0 || typeof item.checkedAt !== "string" || !Number.isFinite(Date.parse(item.checkedAt))) return [];
      return [{ handle: item.handle.toLowerCase(), count: item.count, checkedAt: item.checkedAt }];
    }) : [],
    upcoming: Array.isArray(v.upcoming) ? v.upcoming.slice(0, 100).flatMap((item) => {
      if (!item || typeof item !== "object" || typeof item.name !== "string" || !item.name.trim()) return [];
      return [{ name: item.name.trim().slice(0, 100),
        handle: typeof item.handle === "string" && /^[a-z0-9._]{1,30}$/i.test(item.handle) ? item.handle.toLowerCase() : null,
        date: typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(Date.parse(item.date)) ? item.date : null }];
    }) : [],
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
