import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/auth/guard";
import { listMyWorkshopReservations } from "@/lib/workshops/queries";
import { type ReservationStatus } from "@/lib/workshops/shared";
import { formatMoney } from "@/lib/settlement";
import { serverT, getLocale } from "@/lib/i18n/server";
import me from "@/lib/i18n/messages/me";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await serverT(me);
  return { title: t("workshops.meta_title") };
}

const TONE: Partial<Record<ReservationStatus, string>> = {
  paid: "bg-ok/15 text-ok",
  confirmed: "bg-ok/15 text-ok",
  pending: "bg-warn/15 text-warn",
  refunded: "bg-secondary text-ink-3",
  transferred: "bg-secondary text-ink-3",
};

/** 예약 상태 → 사전 키. 사전에 없는 값은 원문 status 를 그대로 보여준다(기존 동작 유지). */
const STATUS_KEY = {
  pending: "workshops.status.pending",
  paid: "workshops.status.paid",
  cancelled: "workshops.status.cancelled",
  refunded: "workshops.status.refunded",
  transferred: "workshops.status.transferred",
  confirmed: "workshops.status.confirmed",
  recovery_required: "workshops.status.recovery_required",
} as const satisfies Record<ReservationStatus, keyof typeof me.ko>;

export default async function MyWorkshopsPage() {
  await requireUser();
  const t = await serverT(me);
  const locale = await getLocale();
  const rows = await listMyWorkshopReservations();

  return (
    <div className="flex flex-col gap-5 px-6 pb-10 pt-8 lg:mx-auto lg:max-w-2xl">
      <div>
        <Link
          href="/me"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("workshops.back")}
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight">{t("workshops.title")}</h1>
        <p className="mt-1 text-sm text-ink-3">{t("workshops.desc")}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center">
          <p className="text-sm text-ink-3">{t("workshops.empty")}</p>
          <Link
            href="/workshops"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("workshops.browse_cta")}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => {
            const statusKey = STATUS_KEY[r.status as ReservationStatus];
            return (
            <li key={r.id} className="rounded-2xl border border-hairline-2 bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-bold",
                    TONE[r.status as ReservationStatus] ?? "bg-secondary text-ink-3",
                  )}
                >
                  {statusKey ? t(statusKey) : r.status}
                </span>
                {r.artist_status === "confirmed" ? (
                  <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                    {t("workshops.artist_confirmed")}
                  </span>
                ) : null}
              </div>

              <p
                data-ugc
                className="mt-2.5 text-base font-bold tracking-tight text-foreground"
              >
                {t("workshops.card_title", { artist: r.artist_name })}
              </p>
              {r.expected_period ? (
                <p data-ugc className="text-[12px] text-ink-3">
                  {t("workshops.expected_period", { period: r.expected_period })}
                </p>
              ) : null}

              <dl className="mt-3 flex flex-col gap-1.5 rounded-lg bg-secondary/40 p-3.5 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{t("workshops.order_no")}</dt>
                  <dd className="font-mono font-semibold text-foreground">{r.order_no}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">{t("workshops.deposit")}</dt>
                  <dd className="font-bold text-foreground">{formatMoney(r.amount, locale)}</dd>
                </div>
                {r.total_price ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-3">{t("workshops.total_price")}</dt>
                    <dd className="text-ink-2">
                      {t("workshops.total_price_value", {
                        amount: formatMoney(r.total_price, locale),
                      })}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.artist_slug ? (
                  <Link
                    href={`/workshops/${r.artist_slug}`}
                    className="rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
                  >
                    {r.status === "pending"
                      ? t("workshops.continue_payment")
                      : t("workshops.view_progress")}
                  </Link>
                ) : null}
                {r.receipt_url ? (
                  <a
                    href={r.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-secondary/50"
                  >
                    {t("workshops.receipt")}
                  </a>
                ) : null}
              </div>
            </li>
            );
          })}
        </ul>
      )}

      <p className="text-[12px] leading-relaxed text-ink-4">
        <span className="block">{t("workshops.note_contact")}</span>
        <span className="block">{t("workshops.note_refund")}</span>
      </p>
    </div>
  );
}
