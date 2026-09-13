"use client";
import Link from "next/link";
import { ImportEntryButton } from "./import/ImportEntryButton";
import { ProfileLinkCard } from "./ProfileLinkCard";
import { useT } from "@/lib/i18n/provider";
import messages from "@/lib/i18n/messages/portfolio-journey";

export function PortfolioJourney({ profileId, dancerId, importEnabled }: {
  profileId: string; dancerId: string; importEnabled: boolean;
}) {
  const t = useT(messages);
  return <section className="flex flex-col gap-4 rounded-2xl border border-border p-5">
    <h2 className="text-xl font-bold">{t("title")}</h2>
    <p className="text-sm text-ink-2">{t("intro")}</p>
    <h3 className="font-semibold">{t("import")}</h3>
    <p className="whitespace-pre-line text-sm text-ink-2">{t(importEnabled ? "importHint" : "unavailable")}</p>
    {importEnabled && <ImportEntryButton profileId={profileId} dancerId={dancerId} />}
    <Link className="min-h-11 rounded-xl bg-secondary px-4 py-3 text-sm" href={`/me/portfolio/${dancerId}/careers`}>{t("manual")} →</Link>
    <h3 className="font-semibold">{t("profile")}</h3>
    <a href="#portfolio-profile" onClick={() => document.getElementById("portfolio-profile")?.setAttribute("open", "")} className="py-2 text-sm underline">{t("edit")}</a>
    <a href="#portfolio-media" className="py-2 text-sm underline">{t("media")}</a>
    <a href="#portfolio-share" className="py-2 text-sm underline">{t("share")}</a>
  </section>;
}

export function PortfolioShareStep({ slug, approved }: { slug: string | null; approved: boolean }) {
  const t = useT(messages);
  return <section id="portfolio-share" className="flex scroll-mt-24 flex-col gap-4">
    <h3 className="font-semibold">{t("share")}</h3>
    {approved && slug ? <ProfileLinkCard slug={slug} approved /> :
      <p className="whitespace-pre-line text-sm text-ink-2">{t(approved ? "noSlug" : "pending")}</p>}
  </section>;
}
