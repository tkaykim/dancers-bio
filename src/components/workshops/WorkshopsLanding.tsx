"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Flame, Megaphone, Users } from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { cn } from "@/lib/utils";
import { instagramUrl, won, type WorkshopArtistPublic } from "@/lib/workshops/shared";
import { ArtistSearch } from "./ArtistSearch";
import { InstagramGlyph } from "./InstagramGlyph";
import { LANG_STORAGE_KEY, LANGS, T, WORKSHOP_FULL_NAME, splitSentences, type Lang } from "./copy";
import { NominateForm } from "./NominateForm";
import { VoteBox } from "./VoteBox";

/** '다른 댄서들이 희망한 안무가' — suggested 카드의 공개 최소 정보 (수요 수는 싣지 않는다 — D1). */
export type WorkshopWish = { name: string; instagram_handle: string };

/** 개설 행사 카드 — event-queries.listOpenEvents 의 결과. */
export type OpenEvent = {
  slug: string;
  title: string;
  subtitle: string | null;
  poster_url: string | null;
  venue_name: string | null;
  starts_on: string;
  ends_on: string;
  session_count: number;
};

export function WorkshopsLanding({
  recruiting,
  candidates,
  wishes,
  openEvents,
  isLoggedIn,
  initialLang = "ko",
  lockLang = false,
}: {
  recruiting: WorkshopArtistPublic[];
  candidates: WorkshopArtistPublic[];
  wishes: WorkshopWish[];
  openEvents: OpenEvent[];
  isLoggedIn: boolean;
  initialLang?: Lang;
  lockLang?: boolean;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  // 검색 우선 플로우 — 직접 입력 폼은 검색으로 못 찾았을 때만 연다(검색어를 이름으로 이어받음).
  const [manualForm, setManualForm] = useState<{ open: boolean; initialName: string }>({
    open: false,
    initialName: "",
  });

  const selectLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      /* localStorage 불가 환경 무시 */
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", l);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL 조작 불가 환경 무시 */
    }
  };

  // ?lang= 명시가 최우선, 아니면 저장값 → 브라우저 언어. 기본은 ko (국내 댄서가 1차 대상).
  useEffect(() => {
    if (lockLang) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const nav = navigator.language?.toLowerCase() ?? "";
    const detected: Lang = nav.startsWith("ja") ? "ja" : nav.startsWith("ko") ? "ko" : "en";
    const next: Lang = saved === "ko" || saved === "en" || saved === "ja" ? (saved as Lang) : detected;
    if (next !== "ko") {
      // 클라이언트 전용 신호(localStorage·navigator)라 SSR에서 알 수 없어 마운트 후 동기화가 불가피.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLang(next);
    }
  }, [lockLang]);

  const c = T[lang];

  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-16 pt-6 md:max-w-3xl md:px-10 md:pb-24 md:pt-10",
        lang === "ko" && "break-keep",
      )}
    >
      <div className="mb-9 flex items-center justify-between md:mb-12">
        <Link href="/feed" aria-label="deetz">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
        <div className="flex items-center gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => selectLang(l.code)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                lang === l.code
                  ? "border-foreground text-foreground"
                  : "border-hairline-2 text-ink-3 hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
          {!isLoggedIn ? (
            <Link
              href={`/login?redirect=${encodeURIComponent("/workshops")}`}
              className="ml-1 rounded-md border border-hairline-2 px-2 py-1 text-xs text-ink-3 transition-colors hover:text-foreground"
            >
              {c.loginLabel}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Hero */}
      <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        {c.badge}
      </span>
      {/* 정식 명칭은 대소문자 그대로 — uppercase 를 걸면 "deetz"가 "DEETZ"로 바뀐다. */}
      <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-ink-3">{WORKSHOP_FULL_NAME}</p>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-5xl">
        {c.title1}
        <br />
        {c.title2}
      </h1>
      <Lines text={c.sub} className="mt-4 text-[15px] leading-relaxed text-ink-2 md:mt-5 md:max-w-2xl md:text-base" />

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-hairline-2 bg-secondary/40 px-4 py-3 md:max-w-2xl">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <Lines text={c.heroNote} className="text-[13px] leading-relaxed text-ink-2" />
      </div>

      <div className="mt-7 flex flex-col gap-2 md:mt-8 md:flex-row">
        <a
          href="#nominate"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 md:px-10"
        >
          {c.ctaNominate}
          <ArrowRight className="size-4" />
        </a>
        <a
          href="#candidates"
          className="flex items-center justify-center gap-2 rounded-lg border border-hairline-2 px-5 py-4 text-sm font-bold text-foreground transition-colors hover:bg-secondary/50 md:px-10"
        >
          {c.ctaBrowse}
        </a>
      </div>

      {/* 열린 워크샵 (개설 행사) */}
      {openEvents.length > 0 ? (
        <>
          <SectionTitle>{c.eventsTitle}</SectionTitle>
          <Lines text={c.eventsSub} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
          <div className="flex flex-col gap-4">
            {openEvents.map((ev) => (
              <Link
                key={ev.slug}
                href={`/workshops/e/${ev.slug}${lang !== "ko" ? `?lang=en` : ""}`}
                className="group overflow-hidden rounded-xl border-2 border-foreground bg-card transition-colors hover:bg-secondary/30"
              >
                {ev.poster_url ? (
                  <div className="aspect-[16/7] overflow-hidden bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ev.poster_url} alt={ev.title} className="size-full object-cover" />
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 p-4 md:p-5">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold tracking-tight text-foreground">{ev.title}</p>
                    <p className="truncate text-[12.5px] text-ink-3">
                      {ev.starts_on === ev.ends_on ? ev.starts_on : `${ev.starts_on} – ${ev.ends_on}`}
                      {ev.venue_name ? ` · ${ev.venue_name}` : ""} · {c.eventsClasses(ev.session_count)}
                    </p>
                    {ev.subtitle ? <p className="mt-0.5 truncate text-[12px] text-ink-4">{ev.subtitle}</p> : null}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground">
                    {c.eventsView}
                    <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {/* 지금 모집 중 */}
      {recruiting.length > 0 ? (
        <>
          <SectionTitle>{c.recruitingTitle}</SectionTitle>
          <div className="flex flex-col gap-4">
            {recruiting.map((a) => (
              <RecruitingCard key={a.id} artist={a} lang={lang} />
            ))}
          </div>
        </>
      ) : null}

      {/* 후보 안무가 */}
      <div id="candidates" className="scroll-mt-20">
        <SectionTitle>{c.candidatesTitle}</SectionTitle>
      </div>
      <Lines text={c.candidatesSub} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      {candidates.length === 0 && recruiting.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline-2 p-8 text-center text-[13px] text-ink-3">
          {c.candidatesEmpty}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {candidates.map((a) => (
            <CandidateCard key={a.id} artist={a} isLoggedIn={isLoggedIn} lang={lang} />
          ))}
        </div>
      )}

      {/* 다른 댄서들이 희망한 안무가 */}
      {wishes.length > 0 ? (
        <>
          <SectionTitle>{c.wishesTitle}</SectionTitle>
          <Lines text={c.wishesSub} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
          <div className="flex flex-wrap gap-2">
            {wishes.map((w) => (
              <span
                key={w.instagram_handle}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline-2 bg-card px-3.5 py-2 text-[13px]"
              >
                <span className="font-semibold text-foreground">{w.name}</span>
                <a
                  href={instagramUrl(w.instagram_handle)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-3 transition-colors hover:text-foreground"
                >
                  @{w.instagram_handle}
                </a>
              </span>
            ))}
          </div>
          <Lines text={c.wishesMergeNote} className="mt-3 text-[12px] leading-relaxed text-ink-4" />
        </>
      ) : null}

      {/* 진행 방식 */}
      <SectionTitle>{c.howTitle}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {c.howSteps.map((s, i) => (
          <div key={s.title} className="rounded-xl border border-hairline-2 bg-card p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                  i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-2",
                )}
              >
                {i + 1}
              </span>
              <p className="text-sm font-bold text-foreground">{s.title}</p>
            </div>
            <Lines text={s.body} className="mt-2.5 text-[13px] leading-relaxed text-ink-2" />
          </div>
        ))}
      </div>

      {/* 안무가 제안 — 검색 먼저, 없으면 직접 입력 폴백 */}
      <div id="nominate" className="scroll-mt-20">
        <SectionTitle>{c.nominateTitle}</SectionTitle>
      </div>
      <Lines text={c.nominateSub} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      <ArtistSearch
        isLoggedIn={isLoggedIn}
        lang={lang}
        onManualRequest={(query) => setManualForm({ open: true, initialName: query })}
      />
      {manualForm.open ? (
        <div className="mt-4">
          <NominateForm
            key={manualForm.initialName}
            isLoggedIn={isLoggedIn}
            lang={lang}
            initialName={manualForm.initialName}
          />
        </div>
      ) : null}

      {/* 예약금·환불 규정 */}
      <SectionTitle>{c.policyTitle}</SectionTitle>
      <ul className="flex flex-col gap-2 rounded-xl border border-hairline-2 bg-card p-5">
        {c.policyRows.map((row) => (
          <li key={row} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
            {row}
          </li>
        ))}
      </ul>

      {/* FAQ */}
      <SectionTitle>{c.faqTitle}</SectionTitle>
      <div className="flex flex-col gap-2">
        {c.faqs.map((f) => (
          <details key={f.q} className="group rounded-xl border border-hairline-2 bg-card px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground">
              {f.q}
              <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <Lines text={f.a} className="mt-2.5 text-[13px] leading-relaxed text-ink-2" />
          </details>
        ))}
      </div>

      <Lines text={c.disclaimer} className="mt-10 text-[11px] leading-relaxed text-ink-4" />
    </div>
  );
}

// ── 카드 ────────────────────────────────────────────────────────────────────

function ArtistImage({ artist, className }: { artist: WorkshopArtistPublic; className?: string }) {
  if (artist.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={artist.image_url}
        alt={artist.name}
        className={cn("size-full object-cover", className)}
        loading="lazy"
      />
    );
  }
  return (
    <div className={cn("flex size-full items-center justify-center bg-secondary", className)}>
      <span className="text-3xl font-bold tracking-tight text-ink-4">
        {artist.name.trim().charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function dday(deadline: string | null, lang: Lang): string | null {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return T[lang].closedLabel;
  if (diff === 0) return T[lang].deadlineToday;
  return `D-${diff}`;
}

/** 모집 오픈 카드 — 게이지·예약금·기간, 상세로 이동. */
function RecruitingCard({ artist, lang }: { artist: WorkshopArtistPublic; lang: Lang }) {
  const c = T[lang];
  const min = artist.min_headcount ?? 0;
  const reserved = artist.reserved_count;
  const pct = min > 0 ? Math.min(100, Math.round((reserved / min) * 100)) : 0;
  const remainingToMin = Math.max(0, min - reserved);
  const d = dday(artist.recruit_deadline, lang);
  const href = artist.slug ? `/workshops/${artist.slug}` : "#";

  return (
    <Link
      href={href}
      className="group overflow-hidden rounded-xl border-2 border-primary/40 bg-card transition-colors hover:border-primary/70"
    >
      <div className="flex">
        <div className="relative aspect-square w-32 shrink-0 overflow-hidden md:w-40">
          <ArtistImage artist={artist} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-between p-4 md:p-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                <Flame className="size-3" /> {c.recruitingBadge}
              </span>
              {d ? <span className="text-[11px] font-semibold text-ink-3">{d}</span> : null}
            </div>
            <p className="mt-1.5 truncate text-lg font-bold tracking-tight text-foreground">{artist.name}</p>
            <p className="truncate text-[12px] text-ink-3">
              @{artist.instagram_handle}
              {artist.expected_period ? ` · ${artist.expected_period}` : ""}
            </p>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[12px]">
              <span className="font-semibold text-foreground">{c.reservedProgress(reserved, min)}</span>
              {artist.deposit_amount ? (
                <span className="font-bold text-foreground">{c.depositLabel(won(artist.deposit_amount))}</span>
              ) : null}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            {min > 0 ? (
              <p className="mt-1 text-[11px] text-ink-4">
                {remainingToMin > 0 ? c.remainingToMin(remainingToMin) : c.minReached}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}

/** 후보 카드 — 수요 수 + '나도 원해요'. */
function CandidateCard({
  artist,
  isLoggedIn,
  lang,
}: {
  artist: WorkshopArtistPublic;
  isLoggedIn: boolean;
  lang: Lang;
}) {
  const c = T[lang];
  const href = artist.slug ? `/workshops/${artist.slug}` : null;
  const confirmed = artist.status === "confirmed" || artist.status === "completed";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-hairline-2 bg-card">
      <div className="relative aspect-[4/3] overflow-hidden">
        {href ? (
          <Link href={href} className="absolute inset-0">
            <ArtistImage artist={artist} />
          </Link>
        ) : (
          <ArtistImage artist={artist} />
        )}
        {confirmed ? (
          <span className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
            {artist.status === "completed" ? c.completedBadge : c.confirmedBadge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            {href ? (
              <Link href={href} className="truncate text-base font-bold tracking-tight text-foreground hover:underline">
                {artist.name}
              </Link>
            ) : (
              <p className="truncate text-base font-bold tracking-tight text-foreground">{artist.name}</p>
            )}
            {artist.country ? <span className="shrink-0 text-[11px] text-ink-4">{artist.country}</span> : null}
          </div>
          <a
            href={instagramUrl(artist.instagram_handle)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-ink-3 transition-colors hover:text-foreground"
          >
            <InstagramGlyph className="size-3" />@{artist.instagram_handle}
          </a>
        </div>
        {artist.genres.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {artist.genres.slice(0, 4).map((g) => (
              <span key={g} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-ink-2">
                {g}
              </span>
            ))}
          </div>
        ) : null}
        {artist.headline ? <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-3">{artist.headline}</p> : null}
        <div className="mt-auto flex flex-col gap-2 pt-1">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
            <Users className="size-3.5 text-ink-3" />
            {c.demandBand[artist.demand_band]}
          </p>
          {!confirmed ? <VoteBox artistId={artist.id} isLoggedIn={isLoggedIn} lang={lang} /> : null}
        </div>
      </div>
    </div>
  );
}

// ── 공용 조각 ───────────────────────────────────────────────────────────────

/** 한 문장 = 한 줄 (대표 지시 — 전 BU 공통 규칙). */
function Lines({ text, className }: { text: string; className?: string }) {
  const sentences = splitSentences(text);
  return (
    <p className={className}>
      {sentences.map((s, i) => (
        <span key={i} className="block">
          {s}
        </span>
      ))}
    </p>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3.5 mt-11 text-lg font-bold tracking-tight md:mb-4 md:mt-14 md:text-2xl">{children}</h2>;
}
