import Link from "next/link";
import type { CampaignData, SnapshotCosts } from "@/lib/campaign/types";
import {
  compareSameSet,
  distribution,
  followerTiers,
  forecast,
  isConfirmed,
  selectedRows,
  snapshotContext,
  summarize,
  topShares,
} from "@/lib/campaign/metrics";
import {
  Bars,
  date,
  ForecastTable,
  number,
  tableClass,
  TiersTable,
} from "@/components/campaign/ResultsReport";
import { CostPanel } from "./CostPanel";
export function TrendPanel({
  projectId,
  data,
  snapshotId,
  costs,
  supplyAmount,
}: {
  projectId: string;
  data: CampaignData;
  snapshotId: string | null;
  costs?: (SnapshotCosts & {
    id: string;
  })[];
  supplyAmount?: number;
}) {
  const context = snapshotId ? snapshotContext(data, snapshotId) : null;
  const rows = context ? selectedRows(data.posts, context.metrics) : [];
  const confirmed = data.snapshots.filter((s) => isConfirmed(s.status));
  const selectedIndex = confirmed.findIndex((s) => s.id === snapshotId);
  const comparison =
    context && selectedIndex > 0
      ? compareSameSet(
          selectedRows(
            data.posts,
            data.metrics.filter(
              (m) => m.snapshot_id === confirmed[selectedIndex - 1].id,
            ),
          ),
          rows,
        )
      : null;
  return (
    <div className="space-y-8">
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              {[
                "회차",
                "측정 시각",
                "상태",
                "확인/대상",
                "재생",
                "좋아요",
                "댓글",
                "공유",
                "실행자",
                ...(costs ? ["예상/실제 수집비"] : []),
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.snapshots.map((s) => {
              const total = summarize(
                data.posts,
                data.metrics.filter((m) => m.snapshot_id === s.id),
                [],
                data.rules,
              );
              const cost = costs?.find((c) => c.id === s.id);
              return (
                <tr key={s.id}>
                  <td>
                    {isConfirmed(s.status) ? (
                      <Link
                        className="underline"
                        href={`/tools/campaigns/${projectId}?tab=posts&snapshot=${s.id}`}
                      >
                        {s.label}
                      </Link>
                    ) : (
                      s.label
                    )}
                  </td>
                  <td>{date(s.taken_at)}</td>
                  <td>
                    {s.status}
                    {s.error && <small className="block">{s.error}</small>}
                  </td>
                  <td>
                    {s.posts_found}/{s.posts_total}
                  </td>
                  <td>
                    {isConfirmed(s.status) ? number(total.plays.sum) : "—"}
                  </td>
                  <td>
                    {isConfirmed(s.status)
                      ? `${number(total.likes.sum)} (${total.likes.label})`
                      : "—"}
                  </td>
                  <td>
                    {isConfirmed(s.status)
                      ? `${number(total.comments.sum)} (${total.comments.label})`
                      : "—"}
                  </td>
                  <td>
                    {isConfirmed(s.status)
                      ? `${number(total.shares.sum)} (${total.shares.label})`
                      : "—"}
                  </td>
                  <td>{s.created_by ?? "백필"}</td>
                  {costs && (
                    <td>
                      ${cost?.estimated_cost_usd} /{" "}
                      {cost?.apify_cost_usd == null
                        ? "미확인"
                        : `$${cost.apify_cost_usd}`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {context && (
        <>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">
              {context.snapshot.label} · 동일집합 비교
            </h2>
            <p>
              {comparison
                ? `${comparison.count}개 기준 · ${number(comparison.before)} → ${number(comparison.after)} · 증가율 ${comparison.growth == null ? "—" : number(comparison.growth) + "%"}`
                : "비교할 이전 확정 회차가 없습니다."}
            </p>
            {comparison?.recommendStop && (
              <p className="text-amber-700">
                동일집합 재생 증가율이 5% 미만입니다.
                <br />
                LG 기준에 따라 추가 측정 종료를 검토할 수 있습니다.
              </p>
            )}
          </section>
          <section>
            <h2 className="text-xl font-semibold">재생 분포</h2>
            <Bars
              rows={distribution(rows).map((d) => ({
                label: d.label,
                value: d.count,
              }))}
            />
            <p>
              {topShares(rows)
                .map(
                  (t) =>
                    `상위 ${t.top}개 ${t.percent == null ? "—" : number(t.percent) + "%"}`,
                )
                .join(" · ")}
            </p>
          </section>
          <TiersTable
            rows={followerTiers(data.posts, rows, context.accounts)}
          />
          <ForecastTable data={forecast(data.posts, rows)} />
          {supplyAmount !== undefined && (
            <CostPanel
              projectId={projectId}
              supplyAmount={supplyAmount}
              summary={summarize(
                data.posts,
                rows,
                context.accounts,
                data.rules,
              )}
            />
          )}
        </>
      )}
    </div>
  );
}
