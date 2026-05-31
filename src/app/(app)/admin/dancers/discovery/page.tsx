import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import {
  EnqueueButton,
  QueueRowControls,
  HashtagDiscoverForm,
} from "./QueueControls";

type DiscoveryRow = {
  id: string;
  ig_user_id: string | null;
  ig_handle: string | null;
  display_name: string | null;
  follower_count: number | null;
  mutuals_with_seed: number | null;
  bio_text: string | null;
  bio_keyword_hit: boolean | null;
  rank_score: number | null;
  source: string | null;
  status: string;
  matched_dancer_id: string | null;
  discovered_at: string | null;
};

type QueueRow = {
  id: string;
  ig_discovery_id: string;
  scheduled_date: string | null;
  priority: number | null;
  status: string;
  attempts: number | null;
  last_error: string | null;
  scraped_at: string | null;
};

type Stats = {
  discovered?: number;
  queued?: number;
  scraping?: number;
  draft?: number;
  approved?: number;
  outreach_queued?: number;
  outreach_sent?: number;
  claimed?: number;
};

const QUEUE_STATUS_LABEL: Record<string, string> = {
  queued: "대기",
  scraping: "스크랩 중",
  done: "완료",
  failed: "실패",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}

export default async function AdminDiscoveryPage() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: statsData }, { data: discoveryData }, { data: queueData }] =
    await Promise.all([
      supabase.rpc("dancer_ingestion_stats"),
      supabase
        .from("ig_discovery")
        .select(
          "id, ig_user_id, ig_handle, display_name, follower_count, mutuals_with_seed, bio_text, bio_keyword_hit, rank_score, source, status, matched_dancer_id, discovered_at",
        )
        .eq("status", "discovered")
        .order("rank_score", { ascending: false, nullsFirst: false })
        .limit(50),
      supabase
        .from("dancer_scrape_queue")
        .select(
          "id, ig_discovery_id, scheduled_date, priority, status, attempts, last_error, scraped_at",
        )
        .order("priority", { ascending: false, nullsFirst: false })
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .limit(100),
    ]);

  const stats = (statsData as Stats | null) ?? {};
  const discovery = (discoveryData ?? []) as DiscoveryRow[];
  const queue = (queueData ?? []) as QueueRow[];

  // join queue → discovery handle
  const discoveryIds = Array.from(new Set(queue.map((q) => q.ig_discovery_id)));
  const handleMap = new Map<string, DiscoveryRow>();
  if (discoveryIds.length > 0) {
    const { data: joinRows } = await supabase
      .from("ig_discovery")
      .select(
        "id, ig_user_id, ig_handle, display_name, follower_count, mutuals_with_seed, bio_text, bio_keyword_hit, rank_score, source, status, matched_dancer_id, discovered_at",
      )
      .in("id", discoveryIds);
    for (const row of (joinRows ?? []) as DiscoveryRow[]) {
      handleMap.set(row.id, row);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 관리자 콘솔
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 댄서 발굴 파이프라인
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          발견 풀 &amp; 스크랩 큐
        </h1>
        <p className="text-sm text-ink-2">
          인스타에서 발견한 댄서 후보를 스크랩 큐에 넣고, 프로필을 수집합니다.
        </p>
      </header>

      {/* 파이프라인 통계 */}
      <section className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <StatCard label="발견" value={stats.discovered ?? 0} />
          <StatCard label="큐" value={stats.queued ?? 0} />
          <StatCard label="스크랩 중" value={stats.scraping ?? 0} />
          <StatCard label="검수 대기" value={stats.draft ?? 0} />
          <StatCard label="승인" value={stats.approved ?? 0} />
          <StatCard
            label="아웃리치"
            value={(stats.outreach_queued ?? 0) + (stats.outreach_sent ?? 0)}
          />
        </div>
        <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] text-ink-3">
          발견 {stats.discovered ?? 0} / 스크랩 {stats.scraping ?? 0} / 대기{" "}
          {stats.queued ?? 0} — 꼬리(tail)가 아직 다 처리되지 않았습니다.
        </p>
      </section>

      {/* 해시태그 발견 */}
      <HashtagDiscoverForm />

      {/* Section A: 발견 풀 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">
          발견 풀 ({discovery.length})
        </h2>
        {discovery.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline-2 bg-card p-6 text-center text-sm text-ink-3">
            아직 발견된 후보가 없습니다. 발견 잡이 돌면 여기에 채워집니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {discovery.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        @{d.ig_handle ?? "(handle 없음)"}
                      </p>
                      {d.bio_keyword_hit ? (
                        <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                          키워드 일치
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-ink-3">
                      {d.display_name ?? "—"}
                    </p>
                    {d.bio_text ? (
                      <p className="mt-1 line-clamp-2 text-xs text-ink-2">
                        {d.bio_text}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full border border-hairline-2 px-2.5 py-0.5 text-[11px] font-medium text-ink-2">
                    rank {d.rank_score ?? 0}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
                  <span>팔로워 {(d.follower_count ?? 0).toLocaleString()}</span>
                  <span>맞팔 {d.mutuals_with_seed ?? 0}</span>
                  {d.source ? <span>· {d.source}</span> : null}
                </div>

                <div className="flex justify-end">
                  <EnqueueButton discoveryId={d.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section B: 스크랩 큐 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">
          스크랩 큐 ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline-2 bg-card p-6 text-center text-sm text-ink-3">
            큐가 비어 있습니다. 발견 풀에서 후보를 큐에 추가하세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {queue.map((q) => {
              const disc = handleMap.get(q.ig_discovery_id);
              const statusColor =
                q.status === "failed"
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : q.status === "done"
                    ? "border-ok/30 bg-ok/5 text-ok"
                    : q.status === "scraping"
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-hairline-2 text-ink-2";
              return (
                <li
                  key={q.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        @{disc?.ig_handle ?? q.ig_discovery_id}
                      </p>
                      <p className="font-mono text-[11px] text-ink-3">
                        예약 {fmtDate(q.scheduled_date)} · 우선순위{" "}
                        {q.priority ?? 0} · 시도 {q.attempts ?? 0}회
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${statusColor}`}
                    >
                      {QUEUE_STATUS_LABEL[q.status] ?? q.status}
                    </span>
                  </div>

                  {q.last_error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
                      마지막 오류: {q.last_error}
                    </p>
                  ) : null}

                  <QueueRowControls
                    queueId={q.id}
                    priority={q.priority}
                    scheduledDate={q.scheduled_date}
                    status={q.status}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
        {label}
      </p>
      <p className="text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
