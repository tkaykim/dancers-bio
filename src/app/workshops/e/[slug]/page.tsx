import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { EventRegisterClient } from "@/components/workshops/EventRegisterClient";
import { getProfile, getUser } from "@/lib/auth/guard";
import { ET, type EventLang } from "@/lib/workshops/event-shared";
import { getPublicEventBySlug } from "@/lib/workshops/event-queries";

// 개설 행사 상세 — 시간표(세션 다중 선택)·신청·결제.
// 해외 행사는 default_lang=en 이라 기본 영어로 뜨고 ?lang=ko 로 전환할 수 있다.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublicEventBySlug(slug);
  if (!found) return { title: "deetz Workshop" };
  return {
    title: `${found.event.title} · deetz Workshop`,
    description: found.event.subtitle ?? found.event.title,
    alternates: { canonical: `/workshops/e/${slug}` },
  };
}

function formatDateRange(startsOn: string, endsOn: string, lang: EventLang): string {
  const s = new Date(`${startsOn}T00:00:00`);
  const e = new Date(`${endsOn}T00:00:00`);
  const fmt = new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
    year: "numeric",
  });
  if (startsOn === endsOn) return fmt.format(s);
  return `${fmt.format(s)} – ${fmt.format(e)}`;
}

export default async function WorkshopEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const found = await getPublicEventBySlug(slug);
  if (!found) notFound();
  const { event, sessions } = found;

  const lang: EventLang =
    sp.lang === "ko" || sp.lang === "en"
      ? (sp.lang as EventLang)
      : event.default_lang === "ko"
        ? "ko"
        : "en";
  const t = ET[lang];

  const user = await getUser();
  const profile = user ? await getProfile() : null;

  const closedEvent = event.status !== "open";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col break-keep px-6 pb-20 pt-6 md:max-w-3xl md:px-10 md:pb-24 md:pt-10">
      <div className="mb-7 flex items-center justify-between">
        <Link
          href="/workshops"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          deetz Workshop
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/workshops/e/${slug}?lang=${lang === "ko" ? "en" : "ko"}`}
            className="rounded-md border border-hairline-2 px-2 py-1 text-xs text-ink-3 transition-colors hover:text-foreground"
          >
            {lang === "ko" ? "EN" : "한국어"}
          </Link>
          <DeetzLogo className="h-6 w-auto" />
        </div>
      </div>

      {/* 헤더 */}
      <div className="overflow-hidden rounded-2xl border border-hairline-2 bg-card">
        {event.poster_url ? (
          <div className="aspect-[16/9] overflow-hidden bg-secondary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.poster_url} alt={event.title} className="size-full object-cover" />
          </div>
        ) : null}
        <div className="p-5 md:p-6">
          <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">{event.title}</h1>
          {event.subtitle ? <p className="mt-1 text-[14px] text-ink-2">{event.subtitle}</p> : null}
          <div className="mt-4 flex flex-col gap-1.5 text-[13px] text-ink-2">
            <p className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-ink-3" />
              {formatDateRange(event.starts_on, event.ends_on, lang)}
            </p>
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
              <span>
                {event.venue_name ?? "TBA"}
                {event.venue_address ? <span className="block text-[12px] text-ink-3">{event.venue_address}</span> : null}
                {event.venue_map_url ? (
                  <a
                    href={event.venue_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] underline underline-offset-2"
                  >
                    Map
                  </a>
                ) : null}
              </span>
            </p>
          </div>
          {event.description ? (
            <p className="mt-4 text-[14px] leading-relaxed text-ink-2">
              {event.description.split("\n").map((line, i) => (
                <span key={i} className="block">
                  {line}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-7">
        {closedEvent ? (
          <div className="rounded-2xl border border-hairline-2 bg-card p-6 text-center">
            <p className="text-base font-bold">{t.seatErrors.DEADLINE}</p>
            <p className="mt-1.5 text-[13px] text-ink-3">{t.contact}</p>
          </div>
        ) : (
          <EventRegisterClient
            event={event}
            sessions={sessions}
            lang={lang}
            defaultName={profile?.display_name ?? ""}
            defaultEmail={user?.email ?? ""}
          />
        )}
      </div>

      <p className="mt-10 text-center text-[12px] text-ink-4">{t.contact}</p>
    </div>
  );
}
