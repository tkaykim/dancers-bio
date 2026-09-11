"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import portfolio from "@/lib/i18n/messages/portfolio";

/**
 * 내 프로필 링크 카드 — 승인된 댄서에게만 보인다.
 *
 * 대표 링크는 dancers.bio/<slug> 하나로 민다(docs/APPROVAL_ONBOARDING_PLAN.md §4-2).
 * deetz.kr/d/<slug> 도 동작하지만 보조 링크로만 두고, 복사 버튼은 대표 링크만 준다 —
 * 두 주소를 나란히 주면 어느 걸 써야 하는지 헷갈린다.
 */
export function ProfileLinkCard({
  slug,
  approved,
}: {
  slug: string | null;
  approved: boolean;
}) {
  const t = useT(portfolio);
  const [copied, setCopied] = useState(false);

  if (!approved || !slug) return null;

  const vanity = `dancers.bio/${slug}`;
  const vanityUrl = `https://${vanity}`;

  function copy() {
    void navigator.clipboard.writeText(vanityUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("profile_link.title")}</h2>
        <a
          href={`https://deetz.kr/d/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-foreground"
        >
          {t("profile_link.view_on_deetz")}
          <ExternalLink size={10} aria-hidden />
        </a>
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold">
          {vanity}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-semibold text-background hover:opacity-90"
        >
          <Copy size={12} aria-hidden />
          {copied ? t("profile_link.copied") : t("profile_link.copy")}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-3">
        {t("profile_link.tip_1")}
        <br />
        {t("profile_link.tip_2")}
        <br />
        {t("profile_link.tip_3")}
      </p>
    </section>
  );
}
