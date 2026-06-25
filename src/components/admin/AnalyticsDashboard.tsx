"use client";

import { useMemo, useState } from "react";

export type AnalyticsData = {
  signups: { id: string; t: number }[];
  apps: { uid: string | null; t: number; status: string; ch: string | null }[];
  dancers: { claimed: boolean; t: number | null }[];
  channels: { id: string; name: string }[];
  projects: { status: string }[];
};

type Period = "day" | "week" | "month" | "year";

const PERIODS: { key: Period; label: string; bars: number; windowDays: number }[] = [
  { key: "day", label: "일간", bars: 30, windowDays: 1 },
  { key: "week", label: "주간", bars: 16, windowDays: 7 },
  { key: "month", label: "월간", bars: 12, windowDays: 30 },
  { key: "year", label: "연간", bars: 4, windowDays: 365 },
];

const DAY = 86_400_000;

function startOf(ms: number, p: Period): number {
  const x = new Date(ms);
  x.setHours(0, 0, 0, 0);
  if (p === "day") return x.getTime();
  if (p === "week") {
    const dow = (x.getDay() + 6) % 7; // 월요일 시작
    x.setDate(x.getDate() - dow);
    return x.getTime();
  }
  if (p === "month") {
    x.setDate(1);
    return x.getTime();
  }
  x.setMonth(0, 1);
  return x.getTime();
}

function addPeriod(ms: number, p: Period, n: number): number {
  const x = new Date(ms);
  if (p === "day") x.setDate(x.getDate() + n);
  else if (p === "week") x.setDate(x.getDate() + n * 7);
  else if (p === "month") x.setMonth(x.getMonth() + n);
  else x.setFullYear(x.getFullYear() + n);
  return x.getTime();
}

function labelFor(ms: number, p: Period): string {
  const d = new Date(ms);
  const m = d.getMonth() + 1;
  if (p === "day" || p === "week") return `${m}/${d.getDate()}`;
  if (p === "month") return `${String(d.getFullYear()).slice(2)}.${m}`;
  return `${d.getFullYear()}`;
}

function pct(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((part / whole) * 100);
}

function within(now: number, ts: number[], fromDaysAgo: number, toDaysAgo = 0): number {
  const from = now - fromDaysAgo * DAY;
  const to = now - toDaysAgo * DAY;
  let c = 0;
  for (const t of ts) if (t >= from && t <= to) c++;
  return c;
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export type ActivityData = {
  dau: number;
  wau: number;
  mau: number;
  trackedSince: string | null;
  totalEvents: number;
  series: { label: string; value: number }[];
  mauSeries: { label: string; value: number }[];
};

export function AnalyticsDashboard({
  data,
  activity,
  now,
}: {
  data: AnalyticsData;
  activity: ActivityData;
  now: number;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const cfg = useMemo(() => PERIODS.find((p) => p.key === period)!, [period]);

  const signupTs = useMemo(() => data.signups.map((s) => s.t).sort((a, b) => a - b), [data.signups]);
  const appTs = useMemo(() => data.apps.map((a) => a.t), [data.apps]);

  // 기간 버킷 (가입/지원/활동 추이) — React Compiler가 자동 메모이즈.
  const series = ((): { label: string; signups: number; cumulative: number; apps: number; active: number }[] => {
    const cur = startOf(now, period);
    const slots: { start: number; label: string }[] = [];
    for (let i = cfg.bars - 1; i >= 0; i--) {
      const s = addPeriod(cur, period, -i);
      slots.push({ start: s, label: labelFor(s, period) });
    }
    const firstStart = slots[0].start;
    const baselineSignups = signupTs.filter((t) => t < firstStart).length;

    const signupByBucket = new Array(slots.length).fill(0);
    for (const t of signupTs) {
      const k = startOf(t, period);
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].start === k) {
          signupByBucket[i]++;
          break;
        }
      }
    }
    const appByBucket = new Array(slots.length).fill(0);
    const activeSets: Set<string>[] = slots.map(() => new Set());
    for (const a of data.apps) {
      const k = startOf(a.t, period);
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].start === k) {
          appByBucket[i]++;
          if (a.uid) activeSets[i].add(a.uid);
          break;
        }
      }
    }
    let run = baselineSignups;
    const cumulative = signupByBucket.map((n) => (run += n));
    return slots.map((s, i) => ({
      label: s.label,
      signups: signupByBucket[i],
      cumulative: cumulative[i],
      apps: appByBucket[i],
      active: activeSets[i].size,
    }));
  })();

  // 기간 KPI (롤링 윈도)
  const w = cfg.windowDays;
  const usersTotal = signupTs.length;
  const newCurr = within(now, signupTs, w);
  const newPrev = within(now, signupTs, w * 2, w);
  const appCurr = within(now, appTs, w);
  const appPrev = within(now, appTs, w * 2, w);
  const newToday = within(now, signupTs, 1);
  const activeCurr = useMemo(() => {
    const from = now - cfg.windowDays * DAY;
    const s = new Set<string>();
    for (const a of data.apps) if (a.t >= from && a.uid) s.add(a.uid);
    return s.size;
  }, [data.apps, cfg, now]);

  // 활성화 퍼널
  const appliedUsers = useMemo(() => {
    const s = new Set<string>();
    for (const a of data.apps) if (a.uid) s.add(a.uid);
    return s.size;
  }, [data.apps]);
  const acceptedUsers = useMemo(() => {
    const s = new Set<string>();
    for (const a of data.apps) if (a.uid && a.status === "accepted") s.add(a.uid);
    return s.size;
  }, [data.apps]);

  // 지원 상태 분해
  const statusCounts = useMemo(() => {
    let pending = 0, accepted = 0, rejected = 0;
    for (const a of data.apps) {
      if (a.status === "pending") pending++;
      else if (a.status === "accepted") accepted++;
      else if (a.status === "rejected" || a.status === "declined") rejected++;
    }
    return { pending, accepted, rejected };
  }, [data.apps]);
  const decided = statusCounts.accepted + statusCounts.rejected;

  // 댄서 클레임
  const dancersTotal = data.dancers.length;
  const dancersClaimed = data.dancers.filter((d) => d.claimed).length;

  // 채널 랭킹
  const topChannels = useMemo(() => {
    const name = new Map(data.channels.map((c) => [c.id, c.name]));
    const by = new Map<string, number>();
    let none = 0;
    for (const a of data.apps) {
      if (!a.ch) { none++; continue; }
      by.set(a.ch, (by.get(a.ch) ?? 0) + 1);
    }
    const arr = [...by.entries()]
      .map(([id, n]) => ({ name: name.get(id) ?? "(삭제됨)", n }))
      .sort((x, y) => y.n - x.n)
      .slice(0, 6);
    return { arr, none };
  }, [data.apps, data.channels]);

  // DAU (최근 30일 일별 활동 = 가입 OR 지원)
  const dau = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    const today = startOf(now, "day");
    for (let i = 29; i >= 0; i--) {
      const d = today - i * DAY;
      const s = new Set<string>();
      for (const a of data.apps) if (startOf(a.t, "day") === d && a.uid) s.add(a.uid);
      for (const su of data.signups) if (startOf(su.t, "day") === d) s.add(su.id);
      const dd = new Date(d);
      days.push({ label: `${dd.getMonth() + 1}/${dd.getDate()}`, value: s.size });
    }
    return days;
  }, [data.apps, data.signups, now]);

  // 리텐션 코호트 (월 가입 코호트 × 이후 N개월 지원 활동)
  const cohorts = useMemo(() => {
    const OFFSETS = 4;
    const signupMonth = new Map<string, number>();
    for (const s of data.signups) signupMonth.set(s.id, startOf(s.t, "month"));
    const userAppMonths = new Map<string, Set<number>>();
    for (const a of data.apps) {
      if (!a.uid) continue;
      const m = startOf(a.t, "month");
      const set = userAppMonths.get(a.uid) ?? new Set<number>();
      set.add(m);
      userAppMonths.set(a.uid, set);
    }
    const cohortUsers = new Map<number, string[]>();
    for (const [uid, m] of signupMonth) {
      const arr = cohortUsers.get(m) ?? [];
      arr.push(uid);
      cohortUsers.set(m, arr);
    }
    const months = [...cohortUsers.keys()].sort((a, b) => a - b).slice(-6);
    return months.map((m) => {
      const users = cohortUsers.get(m) ?? [];
      const cells: (number | null)[] = [];
      for (let k = 0; k < OFFSETS; k++) {
        const target = addPeriod(m, "month", k);
        if (target > now) { cells.push(null); continue; }
        let active = 0;
        for (const u of users) if (userAppMonths.get(u)?.has(target)) active++;
        cells.push(pct(active, users.length));
      }
      return { label: labelFor(m, "month"), size: users.length, cells };
    });
  }, [data.signups, data.apps, now]);

  const projectsOpen = data.projects.filter((p) => p.status === "open").length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">↳ 분석</p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">성장 · KPI</h1>
          <p className="text-sm text-ink-3">
            가입 {usersTotal.toLocaleString()} · 댄서 {dancersTotal.toLocaleString()} · 지원{" "}
            {data.apps.length.toLocaleString()} (실시간)
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                period === p.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-ink-3 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {/* 기간 KPI */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="누적 유저" value={usersTotal} sub={`오늘 +${newToday}`} />
        <Kpi label={`신규 (${cfg.label})`} value={newCurr} delta={deltaPct(newCurr, newPrev)} sub="직전 동기 대비" />
        <Kpi label={`지원 (${cfg.label})`} value={appCurr} delta={deltaPct(appCurr, appPrev)} sub={`누적 ${data.apps.length}`} />
        <Kpi label={`활동 유저 (${cfg.label})`} value={activeCurr} sub="지원한 distinct" />
        <Kpi label="활성화율" value={`${pct(appliedUsers, usersTotal)}%`} sub={`지원 경험 ${appliedUsers}`} />
        <Kpi label="수락률" value={`${pct(statusCounts.accepted, decided)}%`} sub={`수락 ${statusCounts.accepted}/${decided}`} />
      </section>

      {/* 방문 기반 활동 (DAU/MAU) — 실제 로그인 방문 로그 */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-2">방문 기반 활동 (DAU / MAU)</h2>
          <span className="text-[11px] text-ink-3">
            {activity.trackedSince
              ? `${activity.trackedSince}부터 수집`
              : "오늘부터 수집 시작"}
          </span>
        </div>
        {activity.totalEvents === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline-2 p-5 text-center text-sm text-ink-3">
            방문 기록 수집을 시작했습니다. 로그인 사용자가 접속하면 하루 1회 집계되어,
            며칠 뒤부터 DAU/MAU 추이가 채워집니다. (과거 소급 불가)
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="DAU (오늘)" value={activity.dau} />
              <Kpi label="WAU (7일)" value={activity.wau} />
              <Kpi label="MAU (30일)" value={activity.mau} />
              <Kpi label="고착도 (DAU/MAU)" value={`${pct(activity.dau, activity.mau)}%`} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink-2">일별 DAU</h3>
                  <span className="text-[11px] text-ink-3">최근 {activity.series.length}일</span>
                </div>
                <Bars rows={activity.series} barClass="bg-primary" labelEvery={7} />
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink-2">월별 MAU</h3>
                  <span className="text-[11px] text-ink-3">달력월 distinct</span>
                </div>
                {activity.mauSeries.length === 0 ? (
                  <p className="py-8 text-center text-xs text-ink-3">
                    한 달 이상 누적되면 표시됩니다.
                  </p>
                ) : (
                  <Bars rows={activity.mauSeries} barClass="bg-sky-500" labelEvery={1} />
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* 추이 (기간 토글 반영) */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ComboCard
          title="신규 가입 + 누적"
          caption={`${cfg.label} · 누적 ${usersTotal.toLocaleString()}`}
          rows={series.map((s) => ({ label: s.label, bar: s.signups, line: s.cumulative }))}
          barClass="bg-primary"
        />
        <ComboCard
          title="지원 + 활동 유저"
          caption={`${cfg.label}`}
          rows={series.map((s) => ({ label: s.label, bar: s.apps, line: s.active }))}
          barClass="bg-sky-500"
        />
      </section>

      {/* DAU */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-2">일별 활동 (지원 기반 proxy)</h2>
          <span className="text-[11px] text-ink-3">최근 30일 · 지원·가입한 distinct (방문 로그 누적 전 추정)</span>
        </div>
        <Bars rows={dau} barClass="bg-primary" labelEvery={3} />
      </section>

      {/* 활성화 퍼널 + 리텐션 */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-ink-2">활성화 퍼널</h2>
          <Funnel
            steps={[
              { label: "가입", value: usersTotal },
              { label: "지원 (≥1건)", value: appliedUsers },
              { label: "수락된 유저", value: acceptedUsers },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-ink-2">리텐션 코호트</h2>
          <p className="-mt-1 text-[11px] text-ink-3">
            월 가입 코호트가 이후 N개월에 지원 활동한 비율 (지원 데이터는 5월부터 존재)
          </p>
          <CohortGrid cohorts={cohorts} />
        </div>
      </section>

      {/* 분해 + 채널 */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-ink-2">지원 처리 현황</h2>
          <BreakdownBar
            rows={[
              { label: "대기", value: statusCounts.pending, tone: "neutral" },
              { label: "수락", value: statusCounts.accepted, tone: "ok" },
              { label: "거절", value: statusCounts.rejected, tone: "danger" },
            ]}
            total={data.apps.length}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
            <span>프로젝트 {data.projects.length} · 모집중 {projectsOpen}</span>
            <span>댄서 클레임 {pct(dancersClaimed, dancersTotal)}%</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-ink-2">모집채널별 지원 (상위)</h2>
          {topChannels.arr.length === 0 ? (
            <p className="text-sm text-ink-3">데이터 없음</p>
          ) : (
            <div className="flex flex-col gap-2">
              {topChannels.arr.map((c) => (
                <RankRow key={c.name} label={c.name} value={c.n} max={topChannels.arr[0].n} />
              ))}
              {topChannels.none > 0 ? (
                <RankRow label="채널 없음" value={topChannels.none} max={topChannels.arr[0].n} muted />
              ) : null}
            </div>
          )}
        </div>
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
          <span className={`text-[11px] font-semibold ${delta >= 0 ? "text-ok" : "text-destructive"}`}>
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        ) : null}
        {sub ? <span className="text-[11px] text-ink-3">{sub}</span> : null}
      </div>
    </div>
  );
}

const BAR_PX = 116;

function ComboCard({
  title,
  caption,
  rows,
  barClass,
}: {
  title: string;
  caption: string;
  rows: { label: string; bar: number; line: number }[];
  barClass: string;
}) {
  const barMax = Math.max(1, ...rows.map((r) => r.bar));
  const lineMax = Math.max(1, ...rows.map((r) => r.line));
  const n = rows.length;
  const step = Math.max(1, Math.ceil(n / 8));
  const points = rows
    .map((r, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = 100 - (r.line / lineMax) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink-2">{title}</h2>
        <span className="text-[11px] text-ink-3">{caption}</span>
      </div>
      <div className="relative h-40">
        <div className="flex h-full items-end gap-1">
          {rows.map((r, i) => (
            <div
              key={i}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={`${r.label} · 막대 ${r.bar} · 선 ${r.line}`}
            >
              <div
                className={`w-full rounded-t ${barClass}`}
                style={{ height: r.bar > 0 ? Math.max(2, Math.round((r.bar / barMax) * BAR_PX)) : 0 }}
              />
            </div>
          ))}
        </div>
        <svg
          className="pointer-events-none absolute inset-x-0 top-0 h-full w-full text-emerald-500"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="flex gap-1 text-[9px] text-ink-4">
        {rows.map((r, i) => (
          <span key={i} className="flex-1 text-center">
            {i % step === 0 ? r.label : ""}
          </span>
        ))}
      </div>
      <div className="flex gap-3 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className={`size-2.5 rounded-sm ${barClass}`} />막대
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 bg-emerald-500" />선(누적/활동)
        </span>
      </div>
    </div>
  );
}

function Bars({
  rows,
  barClass,
  labelEvery = 1,
}: {
  rows: { label: string; value: number }[];
  barClass: string;
  labelEvery?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <div className="flex h-32 items-end gap-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end" title={`${r.label}: ${r.value}`}>
            <div
              className={`w-full rounded-t ${barClass}`}
              style={{ height: r.value > 0 ? Math.max(2, Math.round((r.value / max) * 110)) : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[9px] text-ink-4">
        {rows.map((r, i) => (
          <span key={i} className="flex-1 text-center">
            {i % labelEvery === 0 ? r.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  return (
    <div className="flex flex-col gap-2.5">
      {steps.map((s, i) => (
        <div key={s.label} className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink-2">{s.label}</span>
            <span className="text-ink-3">
              {s.value.toLocaleString()}{" "}
              <span className="text-ink-4">
                ({pct(s.value, top)}%{i > 0 ? ` · 전환 ${pct(s.value, steps[i - 1].value)}%` : ""})
              </span>
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${Math.max(2, pct(s.value, top))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CohortGrid({
  cohorts,
}: {
  cohorts: { label: string; size: number; cells: (number | null)[] }[];
}) {
  if (cohorts.length === 0) return <p className="text-sm text-ink-3">데이터 없음</p>;
  const cols = cohorts[0].cells.length;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-center text-[11px]">
        <thead>
          <tr className="text-ink-3">
            <th className="px-1 py-1 text-left font-medium">코호트</th>
            <th className="px-1 py-1 font-medium">규모</th>
            {Array.from({ length: cols }, (_, k) => (
              <th key={k} className="px-1 py-1 font-medium">
                M{k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.label}>
              <td className="px-1 py-1 text-left font-medium text-ink-2">{c.label}</td>
              <td className="px-1 py-1 text-ink-3">{c.size}</td>
              {c.cells.map((v, k) => (
                <td key={k} className="px-0.5 py-0.5">
                  {v === null ? (
                    <span className="text-ink-4">·</span>
                  ) : (
                    <span
                      className="block rounded py-1 text-[10px] font-medium"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--color-primary, #6366f1) ${Math.max(6, v)}%, transparent)`,
                      }}
                    >
                      {v}%
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
            <div key={r.label} className={toneBar[r.tone]} style={{ width: `${pct(r.value, total)}%` }} />
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
              {r.value.toLocaleString()} <span className="text-ink-4">({pct(r.value, total)}%)</span>
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
      <span className="w-28 shrink-0 truncate text-xs font-medium text-ink-2">{label}</span>
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
