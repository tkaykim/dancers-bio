"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { instagramUrl, type DemandBand } from "@/lib/workshops/shared";
import { InstagramGlyph } from "./InstagramGlyph";
import { T, type Lang } from "./copy";
import { VoteBox } from "./VoteBox";

/**
 * deetz 안무가 프로필 카드 모달 — 카드·칩·검색 결과를 눌렀을 때 인스타로 이탈하는 대신
 * 사이트 안에서 프로필을 보여주고 그 자리에서 투표까지 잇는다(대표 지시 2026-08-26).
 * 인스타그램은 모달 안의 보조 링크로만 연다.
 */
export type ProfileTarget = {
  /** workshop_artists 카드가 있으면 그 id 로 투표하고, 없으면(deetz 댄서) nominate 로 카드를 만든다. */
  artistId?: string;
  nominate?: { name: string; instagramHandle: string };
  name: string;
  instagram_handle: string;
  genres: string[];
  country: string | null;
  headline: string | null;
  image_url: string | null;
  badge: "official" | "confirmed" | "completed" | "dancer" | null;
  demand_band: DemandBand | null;
  /** published 이상 카드의 상세(모집) 페이지 slug */
  slug: string | null;
  /** deetz 댄서 공개 프로필 slug (/d/[slug]) */
  dancerSlug: string | null;
};

export function ArtistProfileModal({
  target,
  isLoggedIn,
  lang,
  onClose,
}: {
  target: ProfileTarget;
  isLoggedIn: boolean;
  lang: Lang;
  onClose: () => void;
}) {
  const c = T[lang];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const badgeLabel =
    target.badge === "official"
      ? c.officialBadge
      : target.badge === "confirmed"
        ? c.confirmedBadge
        : target.badge === "completed"
          ? c.completedBadge
          : target.badge === "dancer"
            ? c.searchStatusDancer
            : null;
  const votable = target.badge !== "confirmed" && target.badge !== "completed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 md:items-center md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={target.name}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card shadow-xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-secondary">
          {target.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={target.image_url} alt={target.name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <span className="text-6xl font-bold tracking-tight text-ink-4">
                {target.name.trim().charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-background/90 text-foreground transition-colors hover:bg-background"
          >
            <X className="size-4" />
          </button>
          {badgeLabel ? (
            {/* uppercase 금지 — "deetz" 브랜드 소문자 표기 규칙 */}
            <span
              className={cn(
                "absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold",
                target.badge === "dancer"
                  ? "bg-background/90 text-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {badgeLabel}
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <h3 className="text-xl font-bold tracking-tight text-foreground">{target.name}</h3>
              {target.country ? <span className="text-[12px] text-ink-3">{target.country}</span> : null}
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-3">
              <InstagramGlyph className="size-3.5" />@{target.instagram_handle}
            </p>
          </div>

          {target.genres.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {target.genres.slice(0, 6).map((g) => (
                <span key={g} className="rounded-full bg-secondary px-2.5 py-1 text-[12px] text-ink-2">
                  {g}
                </span>
              ))}
            </div>
          ) : null}

          {target.headline ? (
            <p className="text-[13.5px] leading-relaxed text-ink-2">{target.headline}</p>
          ) : null}

          {target.demand_band ? (
            <p className="text-[13px] font-semibold text-foreground">{c.demandBand[target.demand_band]}</p>
          ) : null}

          {votable ? (
            <VoteBox
              artistId={target.artistId}
              nominate={target.nominate}
              isLoggedIn={isLoggedIn}
              lang={lang}
            />
          ) : null}

          <div className="flex flex-col gap-1.5 border-t border-hairline-2 pt-3">
            {target.slug ? (
              <Link
                href={`/workshops/${target.slug}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground underline-offset-2 hover:underline"
              >
                {c.modalGoDetail} <ExternalLink className="size-3" />
              </Link>
            ) : null}
            {target.dancerSlug ? (
              <Link
                href={`/d/${target.dancerSlug}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground underline-offset-2 hover:underline"
              >
                {c.modalDeetzProfile} <ExternalLink className="size-3" />
              </Link>
            ) : null}
            <a
              href={instagramUrl(target.instagram_handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
            >
              {c.modalInsta} <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
