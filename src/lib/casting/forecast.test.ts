import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildForecastSummary,
  formatKoCount,
  formatKoRange,
  normalizeForecastSettings,
  resolveTier,
} from "./forecast";

test("티어는 명시값을 우선하고 없으면 기대조회로 판정한다", () => {
  assert.equal(resolveTier(120000, null), "anchor");
  assert.equal(resolveTier(50000, undefined), "anchor");
  assert.equal(resolveTier(49999, null), "mid");
  assert.equal(resolveTier(9999, null), "longtail");
  assert.equal(resolveTier(null, null), null);
  assert.equal(resolveTier(500, "anchor"), "anchor");
  assert.equal(resolveTier(500, "bogus"), "longtail");
});

test("예측 설정은 기본값을 채우고 실현율 범위를 보정한다", () => {
  const settings = normalizeForecastSettings({
    enabled: true,
    realization: { low: 0.9, base: 0.2, high: 0.6 },
  });
  assert.equal(settings.enabled, true);
  assert.equal(settings.realization.low, 0.9);
  assert.equal(settings.realization.high, 0.9);
  assert.equal(settings.realization.base, 0.9);
  assert.equal(settings.horizonLabel, "D+14");
  assert.equal(settings.engagementRates.like, 0.044);
  assert.equal(normalizeForecastSettings(null).enabled, false);
  assert.equal(normalizeForecastSettings(undefined).includeProposed, true);
});

test("요약은 확정과 전체를 나누고 미측정 인원은 조회 합계에서 뺀다", () => {
  const settings = normalizeForecastSettings({ enabled: true });
  const summary = buildForecastSummary(
    [
      { lineupStatus: "confirmed", followers: 200000, expectedViews: 20000, tier: null },
      { lineupStatus: "confirmed", followers: 100000, expectedViews: null, tier: null },
      { lineupStatus: "negotiating", followers: 10000, expectedViews: 30000, tier: null },
      { lineupStatus: "proposed", followers: 5000, expectedViews: 100000, tier: null },
      { lineupStatus: null, followers: 999999, expectedViews: 999999, tier: null },
    ],
    settings,
  );
  assert.equal(summary.counts.total, 4);
  assert.equal(summary.counts.confirmed, 2);
  assert.equal(summary.counts.negotiating, 1);
  assert.equal(summary.counts.proposed, 1);
  assert.equal(summary.counts.unmeasured, 1);
  assert.equal(summary.all.followers, 315000);
  assert.equal(summary.all.expectedViews, 150000);
  assert.deepEqual(summary.all.views, { low: 75000, base: 112500, high: 150000 });
  assert.equal(summary.confirmed.expectedViews, 20000);
  assert.equal(summary.confirmed.measured, 1);
  assert.equal(summary.all.engagement.like.high, Math.round(150000 * 0.044));
  const anchor = summary.tiers.find((tier) => tier.tier === "anchor");
  assert.equal(anchor?.count, 1);
  assert.ok(Math.abs((anchor?.share ?? 0) - 100000 / 150000) < 1e-9);
});

test("제안 예정 제외 설정이면 인원과 합계에서 빠진다", () => {
  const settings = normalizeForecastSettings({ enabled: true, includeProposed: false });
  const summary = buildForecastSummary(
    [
      { lineupStatus: "confirmed", followers: 1000, expectedViews: 1000, tier: null },
      { lineupStatus: "proposed", followers: 1000, expectedViews: 1000, tier: null },
    ],
    settings,
  );
  assert.equal(summary.counts.total, 1);
  assert.equal(summary.all.expectedViews, 1000);
});

test("한국어 축약 표기", () => {
  assert.equal(formatKoCount(1472448), "147만");
  assert.equal(formatKoCount(736224), "74만");
  assert.equal(formatKoCount(72940), "7.3만");
  assert.equal(formatKoCount(10000), "1만");
  assert.equal(formatKoCount(9306), "1만");
  assert.equal(formatKoCount(8358), "8천");
  assert.equal(formatKoCount(7979), "8천");
  assert.equal(formatKoCount(7192), "7천");
  assert.equal(formatKoCount(12731), "1.3만");
  assert.equal(formatKoCount(1099), "1천");
  assert.equal(formatKoCount(634), "600");
  assert.equal(formatKoCount(42), "42");
  assert.equal(formatKoRange(736224, 1472448), "74만~147만");
  assert.equal(formatKoRange(5, 5), "5");
});

test("상태별 그룹은 제안 예정 포함 여부를 따르고 표시 설정 기본값은 전부 켜져 있다", () => {
  const settings = normalizeForecastSettings({ enabled: true, includeProposed: false, groupBy: "status", showComposition: false, showMethodology: false, showBadges: false });
  assert.equal(settings.groupBy, "status");
  assert.equal(settings.showComposition, false);
  assert.equal(settings.showMethodology, false);
  assert.equal(settings.showBadges, false);
  const defaults = normalizeForecastSettings({ enabled: true });
  assert.equal(defaults.groupBy, "tier");
  assert.equal(defaults.showComposition, true);
  assert.equal(defaults.showBadges, true);
  const summary = buildForecastSummary(
    [
      { lineupStatus: "confirmed", followers: 1000, expectedViews: 10000, tier: null },
      { lineupStatus: "negotiating", followers: 2000, expectedViews: 20000, tier: null },
      { lineupStatus: "proposed", followers: 3000, expectedViews: 30000, tier: null },
    ],
    settings,
  );
  assert.deepEqual(summary.byStatus.map((entry) => entry.status), ["confirmed", "negotiating"]);
  assert.equal(summary.byStatus[0].label, "확정 진행");
  assert.equal(summary.byStatus[1].group.followers, 2000);
  assert.deepEqual(summary.byStatus[1].group.views, { low: 10000, base: 15000, high: 20000 });
});

test("후보 라벨·안내문·조회 예측 표시 설정", () => {
  const defaults = normalizeForecastSettings({ enabled: true });
  assert.equal(defaults.candidateLabel, "협의 중");
  assert.equal(defaults.candidateNotice, null);
  assert.equal(defaults.showViewsForecast, true);
  assert.equal(defaults.showFollowersTotal, true);
  assert.equal(defaults.showSummary, true);
  assert.equal(normalizeForecastSettings({ enabled: true, showSummary: false }).showSummary, false);
  assert.equal(normalizeForecastSettings({ enabled: true, showFollowersTotal: false }).showFollowersTotal, false);
  const custom = normalizeForecastSettings({
    enabled: true,
    groupBy: "status",
    candidateLabel: " 협의 중 후보 ",
    candidateNotice: "후보는 일부만 진행됩니다.",
    showViewsForecast: false,
  });
  assert.equal(custom.candidateLabel, "협의 중 후보");
  assert.equal(custom.candidateNotice, "후보는 일부만 진행됩니다.");
  assert.equal(custom.showViewsForecast, false);
  const summary = buildForecastSummary(
    [
      { lineupStatus: "confirmed", followers: 1000, expectedViews: 1000, tier: null },
      { lineupStatus: "negotiating", followers: 2000, expectedViews: 2000, tier: null },
    ],
    custom,
  );
  assert.equal(summary.byStatus.find((entry) => entry.status === "negotiating")?.label, "협의 중 후보");
  assert.equal(summary.byStatus.find((entry) => entry.status === "confirmed")?.label, "확정 진행");
});
