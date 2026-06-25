import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WEEKS = 12;
const DAY = 86_400_000;

type Bucket = { label: string; value: number };

// 오늘 기준 7일 단위 롤링 버킷 (오래된 → 최신).
function weeklyBuckets(dates: Date[], weeks = WEEKS): Bucket[] {
  const now = Date.now();
  const out: Bucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const d = new Date(end);
    const value = dates.filter((x) => {
      const t = x.getTime();
      return t > start && t <= end;
    }).length;
    out.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, value });
  }
  return out;
}

function countWithin(dates: Date[], fromDaysAgo: number, toDaysAgo = 0): number {
  const now = Date.now();
  const from = now - fromDaysAgo * DAY;
  const to = now - toDaysAgo * DAY;
  return dates.filter((x) => {
    const t = x.getTime();
    return t >= from && t <= to;
  }).length;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export default async function AdminAnalyticsPage() {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  const supabase = await createClient();
  const [
    { data: pRows },
    { data: aRows },
    { data: dRows },
    { data: projRows },
    { data: chRows },
    { count: teamsCount },
  ] = await Promise.all([
    supabase.from("profiles").select("created_at"),
    supabase
      .from("applications")
      .select("created_at, status, recruitment_channel_id"),
    supabase.from("dancers").select("profile_id"),
    supabase.from("projects").select("status").is("deleted_at", null),
    supabase.from("recruitment_channels").select("id, name"),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const profileDates = ((pRows ?? []) as { created_at: string }[])
    .map((r) => new Date(r.created_at))
    .filter((d) => !Number.isNaN(d.getTime()));
  const apps = (aRows ?? []) as {
    created_at: string;
    status: string;
    recruitment_channel_id: string | null;
  }[];
  const appDates = apps
    .map((r) => new Date(r.created_at))
    .filter((d) => !Number.isNaN(d.getTime()));
  const dancers = (dRows ?? []) as { profile_id: string | null }[];
  const projects = (projRows ?? []) as { status: string }[];
  const channels = (chRows ?? []) as { id: string; name: string }[];

  // 유저
  const usersTotal = profileDates.length;
  const users7d = countWithin(profileDates, 7);
  const users30d = countWithin(profileDates, 30);
  const usersPrev30d = countWithin(profileDates, 60, 30);
  const users1d = countWithin(profileDates, 1);
  const usersDelta = deltaPct(users30d, usersPrev30d);

  // 댄서
  const dancersTotal = dancers.length;
  const dancersClaimed = dancers.filter((d) => d.profile_id).length;

  // 지원
  const appsTotal = apps.length;
  const apps7d = countWithin(appDates, 7);
  const apps30d = countWithin(appDates, 30);
  const appsPrev30d = countWithin(appDates, 60, 30);
  const appsDelta = deltaPct(apps30d, appsPrev30d);
  const accepted = apps.filter((a) => a.status === "accepted").length;
  const rejected = apps.filter(
    (a) => a.status === "rejected" || a.status === "declined",
  ).length;
  const pending = apps.filter((a) => a.status === "pending").length;
  const decided = accepted + rejected;
  const acceptanceRate = pct(accepted, decided);

  // 프로젝트
  const projectsTotal = projects.length;
  const projectsOpen = projects.filter((p) => p.status === "open").length;

  // 채널별 지원 수 (상위)
  const channelName = new Map(channels.map((c) => [c.id, c.name]));
  const byChannel = new Map<string, number>();
  let noChannel = 0;
  for (const a of apps) {
    if (!a.recruitment_channel_id) {
      noChannel++;
      continue;
    }
    byChannel.set(
      a.recruitment_channel_id,
      (byChannel.get(a.recruitment_channel_id) ?? 0) + 1,
    );
  }
  const topChannels = [...byChannel.entries()]
    .map(([id, n]) => ({ name: channelName.get(id) ?? "(삭제된 채널)", n }))
    .sort((x, y) => y.n - x.n)
    .slice(0, 6);

  const userWeeks = weeklyBuckets(profileDates);
  const appWeeks = weeklyBuckets(appDates);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 분석</p>
        <h1 className="text-2xl font-bold leading-tight tracking-tight">
          성장 · KPI
        </h1>
        <p className="text-sm text-ink-3">
          가입 {usersTotal.toLocaleString()}명 · 댄서 {dancersTotal.toLocaleString()}명 · 팀{" "}
          {(teamsCount ?? 0).toLocaleString()}개 · 지원 {appsTotal.toLocaleString()}건 (실시간)
        </p>
      </header>

      {/* 핵심 KPI */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="누적 유저"
          value={usersTotal}
          sub={`오늘 +${users1d} · 7일 +${users7d}`}
        />
        <Kpi
          label="30일 신규"
          value={users30d}
          delta={usersDelta}
          sub="직전 30일 대비"
        />
        <Kpi
          label="댄서 프로필"
          value={dancersTotal}
          sub={`클레임 ${pct(dancersClaimed, dancersTotal)}%`}
        />
        <Kpi
          label="프로젝트"
          value={projectsTotal}
          sub={`모집중 ${projectsOpen}`}
        />
        <Kpi
          label="지원 (30일)"
          value={apps30d}
          delta={appsDelta}
          sub={`누적 ${appsTotal.toLocaleString()}`}
        />
        <Kpi label="수락률" value={`${acceptanceRate}%`} sub={`수락 ${accepted} / 처리 ${decided}`} />
      </section>

      {/* 추이 */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="주간 신규 가입"
          caption={`최근 ${WEEKS}주 · 누적 ${usersTotal.toLocaleString()}명`}
          buckets={userWeeks}
          tone="primary"
        />
        <ChartCard
          title="주간 지원"
          caption={`최근 ${WEEKS}주 · 7일 ${apps7d}건`}
          buckets={appWeeks}
          tone="info"
        />
      </section>

      {/* 퍼널 + 분해 */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-ink-2">지원 처리 현황</h2>
          <BreakdownBar
            rows={[
              { label: "대기", value: pending, tone: "neutral" },
              { label: "수락", value: accepted, tone: "ok" },
              { label: "거절", value: rejected, tone: "danger" },
            ]}
            total={appsTotal}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-ink-2">댄서 클레임</h2>
          <BreakdownBar
            rows={[
              { label: "클레임 완료", value: dancersClaimed, tone: "ok" },
              {
                label: "미클레임 (큐레이션)",
                value: dancersTotal - dancersClaimed,
                tone: "neutral",
              },
            ]}
            total={dancersTotal}
          />
        </div>
      </section>

      {/* 채널별 지원 */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-bold text-ink-2">모집채널별 지원 (상위)</h2>
        {topChannels.length === 0 ? (
          <p className="text-sm text-ink-3">집계할 채널 데이터가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {topChannels.map((c) => (
              <RankRow
                key={c.name}
                label={c.name}
                value={c.n}
                max={topChannels[0].n}
              />
            ))}
            {noChannel > 0 ? (
              <RankRow
                label="채널 없음"
                value={noChannel}
                max={topChannels[0].n}
                muted
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: number | string;
  sub?: string;
  delta?: number | null;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-ink-3">{label}</p>
      <p className="text-2xl font-bold leading-none tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <div className="flex items-center gap-1.5">
        {typeof delta === "number" ? (
          <span
            className={`text-[11px] font-semibold ${
              delta >= 0 ? "text-ok" : "text-destructive"
            }`}
          >
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        ) : null}
        {sub ? <span className="text-[11px] text-ink-3">{sub}</span> : null}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  caption,
  buckets,
  tone,
}: {
  title: string;
  caption: string;
  buckets: Bucket[];
  tone: "primary" | "info";
}) {
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const barColor = tone === "primary" ? "bg-primary" : "bg-sky-500";
  // 픽셀 높이(퍼센트는 auto-height 부모에서 붕괴) — 트랙 h-40(160px)에 라벨 여유 제외.
  const MAX_BAR_PX = 124;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-2">{title}</h2>
        <span className="text-[11px] text-ink-3">{caption}</span>
      </div>
      <div className="flex h-40 items-end gap-1.5">
        {buckets.map((b, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center justify-end gap-1"
            title={`${b.label}: ${b.value}`}
          >
            <span className="text-[9px] font-medium text-ink-3">
              {b.value > 0 ? b.value : ""}
            </span>
            <div
              className={`w-full rounded-t ${barColor}`}
              style={{
                height: b.value > 0 ? Math.max(2, Math.round((b.value / max) * MAX_BAR_PX)) : 0,
              }}
            />
            <span className="text-[9px] text-ink-4">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownBar({
  rows,
  total,
}: {
  rows: { label: string; value: number; tone: "ok" | "danger" | "neutral" }[];
  total: number;
}) {
  const toneBar: Record<string, string> = {
    ok: "bg-ok",
    danger: "bg-destructive",
    neutral: "bg-ink-3/40",
  };
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {rows.map((r) =>
          r.value > 0 ? (
            <div
              key={r.label}
              className={toneBar[r.tone]}
              style={{ width: `${pct(r.value, total)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className={`size-2.5 rounded-sm ${toneBar[r.tone]}`} />
              {r.label}
            </span>
            <span className="text-ink-3">
              {r.value.toLocaleString()}{" "}
              <span className="text-ink-4">({pct(r.value, total)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RankRow({
  label,
  value,
  max,
  muted,
}: {
  label: string;
  value: number;
  max: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs font-medium text-ink-2">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className={muted ? "h-full bg-ink-3/40" : "h-full bg-primary"}
          style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-3">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
