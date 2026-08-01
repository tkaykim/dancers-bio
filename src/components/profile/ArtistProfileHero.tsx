import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { ShareLinkButton } from "@/components/share/ShareLinkButton";
import { SocialIconRow } from "@/components/share/SocialIconRow";
import { BackButton } from "@/components/ui/back-button";

type HeroStat = {
  label: string;
  value: string | number;
};

export function ArtistProfileHero({
  name,
  localName,
  eyebrow,
  descriptor,
  imageUrl,
  imageAlt,
  imageMode = "portrait",
  social,
  canonicalUrl,
  shareTitle,
  backHref,
  verified = false,
  verifiedLabel = "인증 프로필",
  location,
  editHref,
  stats,
  action,
}: {
  name: string;
  localName?: string | null;
  eyebrow: string;
  descriptor?: string | null;
  imageUrl?: string | null;
  imageAlt: string;
  imageMode?: "portrait" | "cover";
  social?: Record<string, string> | null;
  canonicalUrl: string;
  shareTitle: string;
  backHref: string;
  verified?: boolean;
  verifiedLabel?: string;
  location?: string | null;
  editHref?: string | null;
  stats?: HeroStat[];
  action?: ReactNode;
}) {
  const foregroundClass =
    imageMode === "portrait"
      ? "object-cover object-[center_18%] lg:object-contain lg:object-right"
      : "object-cover object-center";

  return (
    <section className="relative min-h-[540px] overflow-hidden bg-[#11100e] text-white lg:min-h-[560px] lg:rounded-[28px]">
      {imageUrl ? (
        <>
          <Image
            src={imageUrl}
            alt=""
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 1180px"
            className="scale-110 object-cover opacity-45 blur-3xl"
            aria-hidden
          />
          <div className="absolute inset-0 lg:left-auto lg:w-[64%]">
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              priority
              sizes="(max-width: 1023px) 100vw, 760px"
              className={foregroundClass}
            />
          </div>
        </>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 72% 28%, rgba(255,255,255,.12), transparent 34%), linear-gradient(135deg, #292722, #11100e 62%)",
          }}
        />
      )}

      <div
        className="absolute inset-0 lg:hidden"
        style={{
          background:
            "linear-gradient(to top, rgba(17,16,14,.98) 3%, rgba(17,16,14,.82) 35%, rgba(17,16,14,.12) 72%)",
        }}
      />
      <div
        className="absolute inset-0 hidden lg:block"
        style={{
          background:
            "linear-gradient(90deg, rgba(17,16,14,1) 0%, rgba(17,16,14,.96) 34%, rgba(17,16,14,.44) 62%, rgba(17,16,14,.08) 100%), linear-gradient(to top, rgba(17,16,14,.72), transparent 48%)",
        }}
      />

      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
        <BackButton
          fallback={backHref}
          ariaLabel="뒤로"
          className="flex size-11 items-center justify-center rounded-full bg-black/35 text-white ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </BackButton>

        <Link
          href="/feed"
          aria-label="deetz 홈"
          className="absolute left-1/2 top-5 inline-flex -translate-x-1/2 sm:top-7 lg:hidden"
        >
          <DeetzLogo tone="white" className="h-6 w-auto" priority />
        </Link>

        <div className="flex items-center gap-2">
          <ShareLinkButton
            url={canonicalUrl}
            title={shareTitle}
            variant="icon"
            className="!size-11 !bg-black/35 !text-white ring-1 ring-white/15 hover:!bg-black/55"
          />
          {editHref ? (
            <Link
              href={editHref}
              className="inline-flex h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#14120c] transition-colors hover:bg-white/88 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              프로필 수정
            </Link>
          ) : null}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-6 pb-7 sm:px-8 sm:pb-9 lg:max-w-[680px] lg:px-12 lg:pb-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/62">
          {eyebrow}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/14 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/18 backdrop-blur">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
              {verifiedLabel}
            </span>
          ) : null}
          {location ? (
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/78 ring-1 ring-white/15 backdrop-blur">
              {location}
            </span>
          ) : null}
        </div>

        <h1 className="mt-4 max-w-full text-[clamp(3rem,13vw,4.4rem)] font-extrabold leading-[0.88] tracking-[-0.06em] text-white [overflow-wrap:anywhere] lg:text-[clamp(4.6rem,7vw,6.4rem)]">
          {name}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-white/72">
          {localName ? <span>{localName}</span> : null}
          {localName && descriptor ? (
            <span className="size-1 rounded-full bg-white/35" aria-hidden />
          ) : null}
          {descriptor ? <span>{descriptor}</span> : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SocialIconRow social={social} />
          {action}
        </div>

        {stats && stats.length > 0 ? (
          <dl className="mt-6 flex flex-wrap gap-x-7 gap-y-3 border-t border-white/18 pt-5">
            {stats.map((stat) => (
              <div key={stat.label} className="flex items-baseline gap-2">
                <dd className="text-lg font-bold tabular-nums text-white">
                  {stat.value}
                </dd>
                <dt className="text-[11px] font-medium text-white/52">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
