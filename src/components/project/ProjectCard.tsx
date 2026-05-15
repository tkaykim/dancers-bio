import Link from "next/link";

type Project = {
  id: string;
  /** 6자 short_code. URL 노출용 (UUID 대체). */
  short_code?: string | null;
  title: string;
  description: string;
  visibility: "public" | "private";
  status: string;
  pay_amount: number | null;
  pay_type: "per_session" | "total" | "negotiable" | null;
  application_deadline: string | null;
  created_at: string;
  genre_label?: string | null;
  region_label?: string | null;
  owner_name?: string | null;
  session_count?: number;
  first_session_at?: string | null;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const now = Date.now();
  const target = new Date(iso).getTime();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

function formatPay(p: Project): string {
  if (p.pay_type === "negotiable" || (!p.pay_amount && p.pay_type !== "per_session" && p.pay_type !== "total")) {
    return "협의";
  }
  if (!p.pay_amount) return "협의";
  const won = `₩ ${p.pay_amount.toLocaleString("ko-KR")}`;
  if (p.pay_type === "per_session") return `${won} · 회차당`;
  return won;
}

export function ProjectCard({ project }: { project: Project }) {
  const dDay = daysUntil(project.application_deadline);
  return (
    <Link
      href={`/projects/${project.short_code ?? project.id}`}
      className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-secondary"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {project.genre_label ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              {project.genre_label}
            </span>
          ) : null}
          {project.region_label ? (
            <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-ink-2">
              {project.region_label}
            </span>
          ) : null}
        </div>
        {dDay !== null ? (
          <span className="font-mono text-[11px] text-ink-3">
            {dDay === 0 ? "오늘 마감" : `D-${dDay}`}
          </span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight">
        {project.title}
      </h3>
      {project.owner_name ? (
        <p className="mt-1 text-xs text-ink-3">{project.owner_name}</p>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-border pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-medium">
            {formatPay(project)}
          </span>
          <span className="text-[11px] text-ink-3">
            {project.session_count
              ? `${project.session_count}개 일정`
              : "일정 미정"}
          </span>
        </div>
        <span className="text-ink-3">→</span>
      </div>
    </Link>
  );
}

export function FeaturedCard({ project }: { project: Project }) {
  const dDay = daysUntil(project.application_deadline);
  return (
    <Link
      href={`/projects/${project.short_code ?? project.id}`}
      className="block rounded-2xl bg-primary p-5 text-primary-foreground transition-opacity hover:opacity-90"
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
          ↳ Featured · 모집 중
        </p>
        {dDay !== null ? (
          <span className="rounded-full bg-primary-foreground px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
            {dDay === 0 ? "TODAY" : `D-${dDay}`}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-xl font-bold tracking-tight leading-tight">
        {project.title}
      </h3>
      {project.owner_name ? (
        <p className="mt-2 text-sm font-medium opacity-75">
          {project.owner_name}
        </p>
      ) : null}
      <div className="mt-3 flex items-end justify-between border-t border-primary-foreground/15 pt-3">
        <div>
          <div className="font-mono text-base font-semibold">
            {formatPay(project)}
          </div>
          <div className="mt-0.5 text-[11px] opacity-60">
            {project.session_count
              ? `${project.session_count}개 일정`
              : "일정 미정"}
          </div>
        </div>
        <span className="rounded-full bg-primary-foreground px-3 py-1.5 text-xs font-semibold text-primary">
          자세히 →
        </span>
      </div>
    </Link>
  );
}
