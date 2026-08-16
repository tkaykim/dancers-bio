"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Building2,
  ChevronDown,
  Image as ImageIcon,
  MapPin,
  Shirt,
  Sparkles,
  Sprout,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";

import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { cn } from "@/lib/utils";
import { VillagePhotoViewer, type ViewerPhoto } from "./VillagePhotoViewer";
import { VillageWaitlistForm } from "./VillageWaitlistForm";
import {
  LANG_STORAGE_KEY,
  LANGS,
  MARKET,
  PLANS,
  T,
  VILLAGE_FULL_NAME,
  splitSentences,
  type Lang,
  type PlanKey,
} from "./copy";

/** 옵션별 실제 사진 — `/village/upload` 에서 올린다. 비어 있으면 placeholder 타일. */
export type VillagePhoto = { id: string; optionKey: "a" | "b" | "common"; url: string; caption: string | null };

const PHOTO_GROUPS = ["a", "b", "common"] as const;

const FEATURE_ICONS = [Sparkles, BedDouble, UtensilsCrossed, Shirt, Sprout, UsersRound];

/** 금액 표기 — ko/ja는 만원 단위, en은 전체 자릿수. */
function won(amount: number, lang: Lang): string {
  if (lang === "en") return `${amount.toLocaleString("en-US")} KRW`;
  const man = amount / 10_000;
  const label = man.toLocaleString("en-US");
  return lang === "ja" ? `${label}万ウォン` : `${label}만원`;
}

function wonRange(min: number, max: number, lang: Lang): string {
  if (lang === "en") return `${min.toLocaleString("en-US")} – ${max.toLocaleString("en-US")} KRW`;
  const a = (min / 10_000).toLocaleString("en-US");
  const b = (max / 10_000).toLocaleString("en-US");
  return lang === "ja" ? `${a}万〜${b}万ウォン` : `${a}만~${b}만원`;
}

export function VillageLanding({
  initialLang = "en",
  lockLang = false,
  photos = [],
}: {
  initialLang?: Lang;
  lockLang?: boolean;
  photos?: VillagePhoto[];
}) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

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

  // ?lang= 로 명시하고 들어왔으면 그대로 두고, 아니면 저장값 → 브라우저 언어 순으로 정한다.
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
    const next: Lang = saved === "en" || saved === "ja" || saved === "ko" ? saved : detected;
    if (next !== "en") {
      // 클라이언트 전용 신호(localStorage·navigator)라 SSR에서 알 수 없어 마운트 후 동기화가 불가피.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLang(next);
    }
  }, [lockLang]);

  const c = T[lang];

  // 뷰어는 옵션 경계를 넘어 이어서 넘길 수 있게 평평한 목록으로 만든다.
  const viewerPhotos: ViewerPhoto[] = PHOTO_GROUPS.flatMap((group) =>
    photos
      .filter((p) => p.optionKey === group)
      .map((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption,
        groupLabel:
          group === "common" ? c.photoCommonLabel : `${c.planNames[group]} · ${c.planDescs[group]}`,
      })),
  );
  const viewerIndexOf = (id: string) => viewerPhotos.findIndex((p) => p.id === id);

  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-16 pt-6 md:max-w-3xl md:px-10 md:pb-24 md:pt-10",
        lang === "ko" && "break-keep",
      )}
    >
      <div className="mb-9 flex items-center justify-between md:mb-12">
        <DeetzLogo className="h-7 w-auto" priority />
        <div className="flex gap-1.5">
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
        </div>
      </div>

      {/* Hero */}
      <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        {c.badge}
      </span>
      {/* 정식 명칭은 대소문자 그대로 — uppercase 를 걸면 "deetz"가 "DEETZ"로 바뀐다. */}
      <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-ink-3">{VILLAGE_FULL_NAME}</p>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-5xl">
        {c.title1}
        <br />
        {c.title2}
      </h1>
      <Lines
        text={c.sub}
        className="mt-4 text-[15px] leading-relaxed text-ink-2 md:mt-5 md:max-w-2xl md:text-base"
      />

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-hairline-2 bg-secondary/40 px-4 py-3 md:max-w-2xl">
        <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <Lines text={c.heroNote} className="text-[13px] leading-relaxed text-ink-2" />
      </div>

      <CtaButton label={c.cta} className="mt-7 md:mt-8 md:self-start md:px-12" />
      <Lines text={c.ctaSub} className="mt-2 text-center text-xs text-ink-4 md:text-left" />

      {/* 문제 — 보증금 비교 */}
      <SectionTitle>{c.problemTitle}</SectionTitle>
      <Lines text={c.problemBody} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-hairline-2 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">{c.marketLabel}</p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-3">{c.marketDeposit}</span>
            <span className="text-right text-lg font-bold text-foreground">
              {wonRange(MARKET.depositMin, MARKET.depositMax, lang)}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-3">{c.marketRent}</span>
            <span className="text-right text-sm font-semibold text-ink-2">
              {wonRange(MARKET.rentMin, MARKET.rentMax, lang)}
            </span>
          </div>
          <Lines
            text={c.marketNote}
            className="mt-3 border-t border-hairline-2 pt-3 text-xs leading-relaxed text-ink-4"
          />
        </div>

        <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{c.villageLabel}</p>
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-3">{c.villageDeposit}</span>
            <span className="text-right text-lg font-bold text-foreground">{c.villageDepositValue}</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-3">{c.villageRent}</span>
            <span className="text-right text-sm font-semibold text-ink-2">
              {won(PLANS[0].monthly, lang)} ~ {won(PLANS[1].monthly, lang)}
            </span>
          </div>
          <Lines
            text={c.villageNote}
            className="mt-3 border-t border-primary/20 pt-3 text-xs leading-relaxed text-ink-3"
          />
        </div>
      </div>

      {/* 공간 구성 */}
      <SectionTitle>{c.spaceTitle}</SectionTitle>
      <Lines text={c.spaceBody} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
        {c.features.map((f, i) => {
          const Icon = FEATURE_ICONS[i] ?? Sparkles;
          return (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Icon className="size-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{f.title}</p>
                <Lines text={f.body} className="mt-0.5 text-[13px] leading-relaxed text-ink-2" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 방 구성 */}
      <SectionTitle>{c.roomsTitle}</SectionTitle>
      <Lines text={c.roomsBody} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
        {c.rooms.map((r, i) => (
          <div key={i} className="rounded-xl border border-hairline-2 bg-card p-4">
            <BedDouble className="size-5 text-ink-3" />
            <p className="mt-2.5 text-sm font-bold text-foreground">{r.title}</p>
            <Lines text={r.body} className="mt-0.5 text-[12px] leading-relaxed text-ink-3" />
          </div>
        ))}
      </div>

      {/* 사진 (placeholder) */}
      <SectionTitle>{c.photosTitle}</SectionTitle>
      <Lines text={c.photosBody} className="mb-1 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      {viewerPhotos.length > 0 ? (
        <p className="mb-4 text-[12px] text-ink-4">{c.photoOpen}</p>
      ) : (
        <div className="mb-4" />
      )}
      {PHOTO_GROUPS.map((group) => {
        const shots = photos.filter((p) => p.optionKey === group);
        // 공용 사진은 올라온 게 있을 때만 섹션을 만든다.
        if (group === "common" && shots.length === 0) return null;
        const label =
          group === "common" ? c.photoCommonLabel : `${c.planNames[group]} · ${c.planDescs[group]}`;
        return (
          <div key={group} className="mb-5 last:mb-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-4">{label}</p>
            {shots.length > 0 ? (
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
                {shots.map((p) => (
                  <figure key={p.id} className="overflow-hidden rounded-xl border border-hairline-2 bg-card">
                    <button
                      type="button"
                      onClick={() => setViewerIndex(viewerIndexOf(p.id))}
                      aria-label={c.photoOpen}
                      className="block w-full cursor-zoom-in transition-opacity hover:opacity-90"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.caption ?? label}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </button>
                    {p.caption ? (
                      <figcaption className="px-3 py-2.5 text-[12px] text-ink-3">{p.caption}</figcaption>
                    ) : null}
                  </figure>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-hairline-2 bg-secondary/40"
                  >
                    <ImageIcon className="size-6 text-ink-4" />
                    <span className="px-3 text-center text-[11px] leading-snug text-ink-4">
                      {c.photoPlaceholder}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 요금 */}
      <SectionTitle>{c.priceTitle}</SectionTitle>
      <Lines text={c.priceBody} className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl" />
      <div className="grid gap-3 md:grid-cols-2">
        {PLANS.map((plan) => (
          <PlanCard key={plan.key} planKey={plan.key} lang={lang} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-hairline-2 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">{c.planIncluded}</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {c.included.map((it, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ink-2">
                · {it}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-hairline-2 bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-4">{c.optionalLabel}</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {c.optional.map((it, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-ink-2">
                · {it}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Lines text={c.priceCaution} className="mt-3 text-xs leading-relaxed text-ink-4 md:max-w-2xl" />

      {/* 진행 단계 */}
      <SectionTitle>{c.stepsTitle}</SectionTitle>
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
        {c.steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                i === 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-ink-3",
              )}
            >
              {i + 1}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
              <Lines text={s.body} className="mt-0.5 text-[13px] leading-relaxed text-ink-2" />
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <SectionTitle>{c.faqTitle}</SectionTitle>
      <div className="flex flex-col">
        {c.faqs.map((f, i) => (
          <details key={i} className="group border-b border-hairline-2 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
              {f.q}
              <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <Lines text={f.a} className="mt-2.5 text-[13px] leading-relaxed text-ink-2" />
          </details>
        ))}
      </div>

      {/* 수요조사 폼 */}
      <div className="mt-11 md:mt-14">
        <VillageWaitlistForm lang={lang} />
      </div>

      <VillagePhotoViewer
        photos={viewerPhotos}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onIndexChange={setViewerIndex}
        closeLabel={c.photoClose}
        prevLabel={c.photoPrev}
        nextLabel={c.photoNext}
      />

      <Lines
        text={c.disclaimer}
        className="mt-6 text-center text-xs leading-relaxed text-ink-4 md:max-w-2xl md:text-left"
      />
    </div>
  );
}

function PlanCard({ planKey, lang }: { planKey: PlanKey; lang: Lang }) {
  const c = T[lang];
  const plan = PLANS.find((p) => p.key === planKey)!;
  const sixMonthTotal = plan.firstMonth + plan.monthly * 5;

  return (
    <div className="flex flex-col rounded-xl border border-hairline-2 bg-card p-5">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 text-ink-3" />
        <p className="text-sm font-bold text-foreground">{c.planNames[planKey]}</p>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">{c.planDescs[planKey]}</p>

      <div className="mt-4 rounded-lg bg-secondary/50 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-4">{c.planFirstMonth}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
          {won(plan.firstMonth, lang)}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-ink-4">
          {c.planFirstMonthNote} · {won(plan.upfront, lang)} + {won(plan.monthly, lang)}
        </p>
      </div>

      <dl className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[13px] text-ink-3">{c.planMonthly}</dt>
          <dd className="text-sm font-bold text-foreground">{won(plan.monthly, lang)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[13px] text-ink-3">{c.planUpfront}</dt>
          <dd className="text-sm font-semibold text-ink-2">{won(plan.upfront, lang)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-hairline-2 pt-1.5">
          <dt className="text-[13px] text-ink-3">{c.sixMonthLabel}</dt>
          <dd className="text-sm font-semibold text-ink-2">{won(sixMonthTotal, lang)}</dd>
        </div>
      </dl>
      <Lines text={c.sixMonthNote} className="mt-2 text-[11px] leading-snug text-ink-4" />
    </div>
  );
}

/**
 * 한 문장 = 한 줄.
 * 마침표에서 끊어 각 문장을 별도 줄로 렌더한다 (대표 지시 — 문장이 이어 붙으면 줄바꿈이 이상해 보인다).
 */
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

function CtaButton({ label, className }: { label: string; className?: string }) {
  return (
    <Link
      href="#waitlist"
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90",
        className,
      )}
    >
      {label}
      <ArrowRight className="size-4" />
    </Link>
  );
}
