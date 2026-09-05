import type { ForecastSummary as ForecastSummaryData } from "@/lib/casting/forecast";
import {
  TIER_DESCRIPTION,
  formatKoCount,
  formatKoRange,
  type LineupTier,
} from "@/lib/casting/forecast";

const TIER_BAR_CLASS: Record<LineupTier, string> = {
  anchor: "bg-primary",
  mid: "bg-amber-400",
  longtail: "bg-slate-400",
};

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3.5 ${
        accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <p className="text-[11px] font-semibold text-ink-3">{label}</p>
      <p
        className={`mt-1 text-xl font-extrabold tabular-nums leading-tight ${
          accent ? "text-primary" : "text-ink-1"
        }`}
      >
        {value}
      </p>
      {sub ? (
        <p className="mt-1 text-[11px] leading-snug text-ink-2">{sub}</p>
      ) : null}
    </div>
  );
}

// 클라이언트 보드 상단 예측 요약. 금액은 표시하지 않는다.
export function ForecastSummary({ forecast }: { forecast: ForecastSummaryData }) {
  const { counts, all, confirmed, tiers, settings, byStatus } = forecast;
  const visibleTiers = tiers.filter((tier) => tier.share > 0);
  const statusLine = byStatus
    .filter((entry) => entry.group.count > 0)
    .map((entry) => `${entry.label} ${entry.group.count}`)
    .join(" · ");

  return (
    <section className="mt-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="진행 크리에이터"
          value={`${counts.total}명`}
          sub={statusLine || undefined}
        />
        <Stat
          label="팔로워 합계"
          value={formatKoCount(all.followers)}
          sub={confirmed.count > 0 ? `확정 진행 ${formatKoCount(confirmed.followers)}` : undefined}
        />
        <Stat
          label={`예상 조회수 · ${settings.horizonLabel}`}
          value={`${formatKoRange(all.views.low, all.views.high)} 회`}
          sub={
            confirmed.count > 0
              ? `확정 진행 ${formatKoRange(confirmed.views.low, confirmed.views.high)} 회`
              : undefined
          }
          accent
        />
        <Stat
          label="예상 상호작용"
          value={`좋아요 ${formatKoRange(all.engagement.like.low, all.engagement.like.high)}`}
          sub={`댓글 ${formatKoRange(all.engagement.comment.low, all.engagement.comment.high)} · 공유 ${formatKoRange(all.engagement.share.low, all.engagement.share.high)}`}
        />
      </div>
      {counts.unmeasured > 0 ? (
        <p className="mt-2 text-[11px] text-ink-3">
          지표 확인 중인 {counts.unmeasured}명은 인원과 팔로워 합계에만 포함하고 예상 조회수와 상호작용에서는 제외했습니다.
        </p>
      ) : null}

      {settings.showComposition ? (
        <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              LINEUP MIX
            </p>
            <p className="text-[11px] text-ink-3">기대 조회 기여도</p>
          </div>
          <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-secondary">
            {visibleTiers.map((tier) => (
              <div
                key={tier.tier}
                className={TIER_BAR_CLASS[tier.tier]}
                style={{ width: pct(tier.share) }}
                title={`${tier.label} ${pct(tier.share)}`}
              />
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {tiers.map((tier) => (
              <div key={tier.tier} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TIER_BAR_CLASS[tier.tier]}`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink-1">
                    {tier.label}{" "}
                    <span className="font-semibold text-ink-3">{tier.count}명</span>
                  </p>
                  <p className="text-[11px] leading-snug text-ink-3">
                    {TIER_DESCRIPTION[tier.tier]} · 기대 조회 {formatKoCount(tier.expectedViews)} 회 · {pct(tier.share)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {settings.showMethodology ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          {settings.collectedOn ? `${settings.collectedOn} Instagram 공개 화면 기준입니다. ` : ""}
          최근 릴스 평균 조회는 고정 게시물을 제외한 최근 릴스 10개에서 상·하위 2개를 제외한 6개 평균이며, 편차가 큰 계정은 중앙값 기준으로 낮춰 반영했습니다.
          예상 조회수는 계정별 평균의 합에 저희 직전 챌린지 캠페인 실측 실현율 {pct(settings.realization.low)}~{pct(settings.realization.high)}를 적용한 값이고, 업로드 후 {settings.horizonLabel} 공개 재생 카운트 기준입니다.
          팔로워 합계는 도달과 같지 않으며, 제안 예정 인원은 협의 결과에 따라 바뀔 수 있습니다.
        </p>
      ) : null}
    </section>
  );
}
