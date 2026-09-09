import { UploadProgress } from "./UploadProgress";
import { DeliveryReport } from "./DeliveryReport";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import type {
  PublicReport,
  PublicPost,
  Tier,
  Forecast,
} from "@/lib/campaign/types";
export const number = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("ko-KR", {
        maximumFractionDigits: 1,
      });
// Explicit KST formatting avoids Node/Chromium ICU differences (PM vs 오후) during hydration.
export const date = (v: string | null) => {
  const time = v ? Date.parse(v) : NaN;
  return Number.isFinite(time)
    ? new Date(time + 9 * 3600000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ") + " KST"
    : "—";
};
export const shortDate = (v: string | null, time = true) => {
  if (!v) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}) }).formatToParts(new Date(v));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}${time ? ` ${get("hour")}:${get("minute")}` : ""}`;
};
export const tableClass =
  "w-full border-collapse text-left text-sm [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-ink-3 [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_tr]:h-11 [&_tbody_tr]:odd:bg-secondary/40 [&_td]:tabular-nums";
export function Bars({
  rows,
}: {
  rows: {
    label: string;
    value: number;
  }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <svg
      role="img"
      aria-label="회차별 관측값 막대 그래프"
      viewBox={`0 0 700 ${Math.max(50, rows.length * 38)}`}
      className="w-full max-w-3xl text-primary"
    >
      <title>관측값 비교</title>
      {rows.map((r, i) => (
        <g key={`${r.label}-${i}`}>
          <text x="0" y={i * 38 + 22} fontSize="12" fill="currentColor">
            {r.label}
          </text>
          <rect
            x="110"
            y={i * 38 + 6}
            height="22"
            width={(r.value / max) * 460}
            fill="currentColor"
            opacity=".7"
          />
          <text
            x={120 + (r.value / max) * 460}
            y={i * 38 + 22}
            fontSize="12"
            fill="currentColor"
          >
            {number(r.value)}
          </text>
        </g>
      ))}
    </svg>
  );
}
export function Histogram({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <svg role="img" aria-label="재생 구간별 게시물 수" viewBox="0 0 480 230" className="w-full">
    <title>재생 구간별 게시물 수</title>
    {[0, .5, 1].map(tick => <g key={tick} className="text-ink-3"><line x1="36" x2="474" y1={184 - tick * 144} y2={184 - tick * 144} stroke="currentColor" strokeOpacity=".2" /><text x="29" y={188 - tick * 144} textAnchor="end" fontSize="10" fill="currentColor">{number(max * tick)}</text></g>)}
    {rows.map((r, i) => { const width = 438 / Math.max(1, rows.length), x = 36 + width * i, height = r.value / max * 144; return <g key={r.label}>
      <rect x={x + width * .18} y={184 - height} width={width * .64} height={height} rx="2" className="fill-primary" opacity=".8" />
      <text x={x + width / 2} y={176 - height} textAnchor="middle" fontSize="11" className="fill-foreground">{r.value}</text>
      <text x={x + width / 2} y="205" textAnchor="middle" fontSize="10" className="fill-ink-3"><title>{r.label}</title>{["500 미만", "~1천", "~2천", "~5천", "~1만", "1만 이상"][i] ?? r.label}</text>
    </g>; })}
  </svg>;
}
export function TiersTable({ rows }: { rows: Tier[] }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass + " [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right"}>
        <caption className="text-left font-semibold">
          팔로워 구간별 게시물 · 전체 참여 계정 팔로워 확인 건 기준
        </caption>
        <thead>
          <tr>
            {[
              "팔로워 구간",
              "게시물",
              "팔로워 합",
              "재생 합",
              "평균 재생",
              "재생/팔로워",
            ].map((h) => (
              <th scope="col" key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td>{r.posts}</td>
              <td>{number(r.followers)}</td>
              <td>{number(r.plays)}</td>
              <td>{number(r.average)}</td>
              <td>{number(r.ratio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ForecastTable({ data }: { data: Forecast }) {
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">계정별 예측 대비 실현율</h3>
      <p className="text-xs text-ink-3">{data.label} · 중앙값 <strong className="text-lg text-foreground tabular-nums">{number(data.median)}{data.median == null ? "" : "%"}</strong></p>
      <div className="overflow-x-auto">
        <table className={tableClass + " [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right"}>
          <thead>
            <tr>
              <th scope="col">계정</th>
              <th scope="col">재생 합</th>
              <th scope="col">기대조회</th>
              <th scope="col">실현율</th>
            </tr>
          </thead>
          <tbody>
            {!data.accounts.length && <tr><td colSpan={4} className="text-center text-ink-3">예측 기준과 연결된 측정 계정이 없습니다.</td></tr>}
            {data.accounts.map((a) => (
              <tr key={a.handle}>
                <td>@{a.handle}</td>
                <td>{number(a.plays)}</td>
                <td>{number(a.expected)}</td>
                <td>{number(a.realization)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function PostTable({ posts, title }: { posts: PublicPost[]; title: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={tableClass + " [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right"}>
        <caption className="text-left font-semibold">{title}</caption>
        <thead>
          <tr>
            {[
              "계정",
              "게시물",
              "게시일",
              "재생",
              "좋아요",
              "댓글",
              "공유",
              ...(posts.some((p) => p.followers) ? ["팔로워"] : []),
              ...(posts.some((p) => p.compliance) ? ["준수"] : []),
            ].map((h) => (
              <th scope="col" key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.shortCode}>
              <td>
                @{p.handle ?? "미확인"}
                {p.displayName && (
                  <span className="block">{p.displayName}</span>
                )}
                {p.collabHandles.length > 0 && (
                  <small className="block">
                    공동작업 {p.collabHandles.map((h) => `@${h}`).join(", ")}
                  </small>
                )}
              </td>
              <td>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {p.shortCode}
                </a>
                {!p.found && <span className="block">공개 확인 불가</span>}
              </td>
              <td>{date(p.postedAt)}</td>
              <td>{number(p.plays)}</td>
              <td>{number(p.likes)}</td>
              <td>{number(p.comments)}</td>
              <td>{number(p.shares)}</td>
              {p.followers && (
                <td>
                  {number(p.followers.sum)}
                  <small className="block">{p.followers.label}</small>
                </td>
              )}
              {p.compliance && (
                <td>
                  {Object.entries(p.compliance).map(([k, v]) => (
                    <span className="block" key={k}>
                      {
                        (
                          {
                            audio: "음원",
                            tags: "태그",
                            mentions: "멘션",
                            partnership: "유료 파트너십",
                          } as Record<string, string>
                        )[k]
                      }
                      : {v === null ? "미확인" : v ? "확인" : "미충족"}
                    </span>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ResultsReport({ report }: { report: PublicReport }) {
  if (report.delivery) return <DeliveryReport report={report} />;
  const s = report.summary;
  return (
    <article className="mx-auto flex w-full max-w-[900px] flex-col gap-10 bg-background px-5 py-12 text-foreground sm:px-8 [&_h2]:border-t [&_h2]:border-foreground/30 [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_caption]:pb-3 [&_caption]:text-sm [&_small]:text-[11px] [&_small]:text-ink-3 [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right">
      <header className="space-y-3 border-b border-foreground/40 pb-6">
        <DeetzLogo className="h-auto w-24 dark:invert" />
        <p className="text-ink-3">
          {report.settings.brandLabel ?? report.clientLabel}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{report.title}</h1>
        <p>
          재생 기준 {report.snapshot.label} · {date(report.snapshot.takenAt)}
        </p>
        {"followersSnapshot" in report && (
          <p>
            팔로워 기준{" "}
            {report.followersSnapshot
              ? `${report.followersSnapshot.label} · ${date(report.followersSnapshot.takenAt)}`
              : "팔로워 미측정"}
          </p>
        )}
      </header>
      {report.uploads && <UploadProgress uploads={report.uploads} />}
      <section className="grid grid-cols-2 gap-0 border-y border-border bg-secondary/30 text-xs text-ink-2 sm:grid-cols-4 [&>div]:border-b [&>div]:border-border [&>div]:px-4 [&>div]:py-5 [&_p]:mt-2 [&_p]:text-foreground [&_p]:tabular-nums">
        <div>
          게시물<p className="text-2xl font-bold">{s.posts}개</p>
        </div>
        <div>
          공개 확인
          <p className="text-2xl font-bold">
            {s.found}/{s.posts}
          </p>
        </div>
        <div>
          참여 계정<p className="text-2xl font-bold">{s.accounts}개</p>
        </div>
        {(["plays", "likes", "comments", "shares"] as const).map((k) => (
          <div key={k}>
            {
              {
                plays: "재생",
                likes: "좋아요",
                comments: "댓글",
                shares: "공유",
              }[k]
            }
            <p className="text-2xl font-bold">{number(s[k].sum)}</p>
            <small>{s[k].label}</small>
          </div>
        ))}
        {s.followers && (
          <div>
            참여 계정 팔로워 합
            <p className="text-2xl font-bold">{number(s.followers.sum)}</p>
            <small>
              {s.followers.confirmed}/{s.followers.total}계정 기준
            </small>
          </div>
        )}
      </section>
      {s.errors > 0 && (
        <p className="text-ink-3">
          수집 오류 {s.errors}개는 성과 합계와 분모에서 제외했습니다.
        </p>
      )}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">회차별 추이</h2>
        <Bars
          rows={report.trend.map((t) => ({
            label: t.label,
            value: t.plays,
          }))}
        />
        <div className="overflow-x-auto">
          <table className={tableClass + " [&_td:not(:first-child)]:text-right [&_th:not(:first-child)]:text-right"}>
            <thead>
              <tr>
                <th scope="col">회차</th>
                <th scope="col">측정 시각</th>
                <th scope="col">공개 확인</th>
                <th scope="col">재생</th>
                <th scope="col">동일집합 증가율</th>
              </tr>
            </thead>
            <tbody>
              {report.trend.map((t) => (
                <tr key={t.id}>
                  <td>{t.label}</td>
                  <td>{date(t.takenAt)}</td>
                  <td>
                    {t.found}/{t.total}
                  </td>
                  <td>{number(t.plays)}</td>
                  <td>
                    {t.comparison?.growth == null
                      ? "—"
                      : `${number(t.comparison.growth)}%`}{" "}
                    {t.comparison && `(${t.comparison.count}개 기준)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {report.distribution && (
        <section>
          <h2 className="text-xl font-semibold">재생 분포</h2>
          <Histogram
            rows={report.distribution.map((d) => ({
              label: d.label,
              value: d.count,
            }))}
          />
          <p>
            {report.topShares
              ?.map(
                (t) =>
                  `상위 ${t.top}개 ${t.percent == null ? "—" : number(t.percent) + "%"}`,
              )
              .join(" · ")}
          </p>
        </section>
      )}
      {report.followerTiers && <TiersTable rows={report.followerTiers} />}
      {report.topPosts.length > 0 && (
        <PostTable posts={report.topPosts} title="상위 게시물" />
      )}
      {report.allPosts && (
        <PostTable posts={report.allPosts} title="전체 게시물" />
      )}
      {s.compliance && (
        <section>
          <h2 className="text-xl font-semibold">준수 확인</h2>
          {Object.entries(s.compliance).map(([key, value]) => (
            <p key={key}>
              {
                (
                  {
                    audio: "공식 음원",
                    tags: "필수 태그",
                    mentions: "필수 멘션",
                    partnership: "유료 파트너십 라벨",
                  } as Record<string, string>
                )[key]
              }
              : {value.passed}개 충족 · {value.confirmed}/{value.total}개 확인
            </p>
          ))}
        </section>
      )}
      {report.forecast && <ForecastTable data={report.forecast} />}
      <footer className="space-y-3 border-t border-border pt-5 text-xs leading-relaxed text-ink-3">
        <p className="whitespace-pre-line">{report.notice}</p>
        <p>보고서 문의는 캠페인 담당자에게 연락해 주세요.</p>
        <a href="https://www.deetz.kr" className="underline">
          deetz
        </a>
      </footer>
    </article>
  );
}
