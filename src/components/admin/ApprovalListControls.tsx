import Link from "next/link";

/**
 * 승인 큐(댄서·팀) 목록 공용 컨트롤 — 상태 탭 + 검색 + 페이지네이션 + 상태 배지.
 * 전부 서버 컴포넌트(링크·GET 폼)라 모바일/PWA에서도 JS 없이 동작한다.
 */

export type StatusKey = "pending" | "approved" | "rejected";
export type StatusFilter = StatusKey | "all";

export const STATUS_LABEL: Record<StatusFilter, string> = {
  pending: "대기 중",
  approved: "승인됨",
  rejected: "거부됨",
  all: "전체",
};

const TAB_ORDER: StatusFilter[] = ["pending", "approved", "rejected", "all"];

export function parseStatus(v: string | undefined, fallback: StatusFilter): StatusFilter {
  return v === "pending" || v === "approved" || v === "rejected" || v === "all" ? v : fallback;
}

export function parsePage(v: string | undefined): number {
  const n = Number.parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function buildHref(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export function StatusTabs({
  base,
  current,
  counts,
  q,
}: {
  base: string;
  current: StatusFilter;
  counts: Record<StatusFilter, number>;
  q?: string;
}) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {TAB_ORDER.map((s) => {
        const active = s === current;
        return (
          <Link
            key={s}
            href={buildHref(base, { status: s, q })}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-hairline-2 text-ink-2 hover:text-foreground")
            }
          >
            {STATUS_LABEL[s]}
            <span
              className={
                "rounded-full px-1.5 py-px font-mono text-[10px] " +
                (active ? "bg-primary-foreground/15" : "bg-secondary text-ink-3")
              }
            >
              {counts[s].toLocaleString()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function SearchForm({
  base,
  q,
  status,
  placeholder,
}: {
  base: string;
  q: string;
  status: StatusFilter;
  placeholder: string;
}) {
  return (
    <form method="get" action={base} className="flex items-center gap-2">
      <input type="hidden" name="status" value={status} />
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        검색
      </button>
      {q ? (
        <Link
          href={buildHref(base, { status })}
          prefetch={false}
          className="h-10 shrink-0 rounded-md border border-hairline-2 px-3 text-sm leading-10 text-ink-2 hover:text-foreground"
        >
          초기화
        </Link>
      ) : null}
    </form>
  );
}

export function Pagination({
  base,
  page,
  pageSize,
  total,
  status,
  q,
}: {
  base: string;
  page: number;
  pageSize: number;
  total: number;
  status: StatusFilter;
  q?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number) => buildHref(base, { status, q, page: p > 1 ? p : undefined });
  const btn =
    "rounded-md border border-hairline-2 px-3 py-1.5 text-xs font-medium text-ink-2 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} / {total.toLocaleString()}건
        {pages > 1 ? ` · ${page}/${pages} 페이지` : ""}
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-1.5">
          <Link href={link(1)} prefetch={false} aria-disabled={page <= 1} className={btn}>
            처음
          </Link>
          <Link href={link(page - 1)} prefetch={false} aria-disabled={page <= 1} className={btn}>
            ← 이전
          </Link>
          <Link href={link(page + 1)} prefetch={false} aria-disabled={page >= pages} className={btn}>
            다음 →
          </Link>
          <Link href={link(pages)} prefetch={false} aria-disabled={page >= pages} className={btn}>
            끝
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function StatusBadge({ status }: { status: StatusKey }) {
  const cls = {
    pending: "border-warn/30 bg-warn/5 text-warn",
    approved: "border-ok/30 bg-ok/5 text-ok",
    rejected: "border-destructive/30 bg-destructive/5 text-destructive",
  }[status];
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "–";
  // 서버(Vercel)는 UTC라 KST로 고정 표기한다.
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}
