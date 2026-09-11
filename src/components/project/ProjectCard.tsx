import Link from "next/link";
import { deadlineLabel } from "@/lib/utils/deadline";
import { getLocale, serverT } from "@/lib/i18n/server";
import { localeTag, tCount, type Translator } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locale";
import feed from "@/lib/i18n/messages/feed";

type FeedT = Translator<typeof feed>;

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
  is_standing_pool?: boolean | null;
  created_at: string;
  genre_label?: string | null;
  region_label?: string | null;
  owner_name?: string | null;
  session_count?: number;
  first_session_at?: string | null;
};

function formatPay(p: Project, t: FeedT, locale: Locale): string {
  if (p.pay_amount === 0 && p.pay_type === "total") return t("pay.none");
  if (p.pay_type === "negotiable" || (!p.pay_amount && p.pay_type !== "per_session" && p.pay_type !== "total")) {
    return t("pay.negotiable");
  }
  if (!p.pay_amount) return t("pay.negotiable");
  const amount = p.pay_amount.toLocaleString(localeTag(locale));
  if (p.pay_type === "per_session") return t("card.pay_per_session", { amount });
  return t("card.pay", { amount });
}

export async function ProjectCard({ project }: { project: Project }) {
  const locale = await getLocale();
  const t = await serverT(feed);
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
        {project.is_standing_pool ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {t("card.standing")}
          </span>
        ) : project.application_deadline ? (
          <span className="font-mono text-[11px] text-ink-3">
            {deadlineLabel(
              project.application_deadline,
              { today: t("card.deadline_today") },
              locale,
            )}
          </span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight" data-ugc>
        {project.title}
      </h3>
      {project.owner_name ? (
        <p className="mt-1 text-xs text-ink-3" data-ugc>
          {project.owner_name}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-border pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm font-medium">
            {formatPay(project, t, locale)}
          </span>
          <span className="text-[11px] text-ink-3">
            {project.session_count
              ? tCount(t, "card.sessions", locale, project.session_count)
              : t("card.no_schedule")}
          </span>
        </div>
        <span className="text-ink-3">→</span>
      </div>
    </Link>
  );
}

export async function FeaturedCard({ project }: { project: Project }) {
  const locale = await getLocale();
  const t = await serverT(feed);
  return (
    <Link
      href={`/projects/${project.short_code ?? project.id}`}
      className="block rounded-2xl bg-primary p-5 text-primary-foreground transition-opacity hover:opacity-90"
    >
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
          {t("card.featured")}
        </p>
        {project.is_standing_pool ? (
          <span className="rounded-full bg-primary-foreground px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
            {t("card.standing")}
          </span>
        ) : project.application_deadline ? (
          <span className="rounded-full bg-primary-foreground px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
            {deadlineLabel(
              project.application_deadline,
              { today: t("card.featured_today"), past: t("card.featured_closed") },
              locale,
            )}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-xl font-bold tracking-tight leading-tight" data-ugc>
        {project.title}
      </h3>
      {project.owner_name ? (
        <p className="mt-2 text-sm font-medium opacity-75" data-ugc>
          {project.owner_name}
        </p>
      ) : null}
      <div className="mt-3 flex items-end justify-between border-t border-primary-foreground/15 pt-3">
        <div>
          <div className="font-mono text-base font-semibold">
            {formatPay(project, t, locale)}
          </div>
          <div className="mt-0.5 text-[11px] opacity-60">
            {project.session_count
              ? tCount(t, "card.sessions", locale, project.session_count)
              : t("card.no_schedule")}
          </div>
        </div>
        <span className="rounded-full bg-primary-foreground px-3 py-1.5 text-xs font-semibold text-primary">
          {t("card.detail")}
        </span>
      </div>
    </Link>
  );
}
