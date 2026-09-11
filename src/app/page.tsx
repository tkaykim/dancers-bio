import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CircleCheck, MessageCircle, Search, Sparkles, UserRoundCheck } from "lucide-react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { Button } from "@/components/ui/button";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { getLocale, serverT } from "@/lib/i18n/server";
import { formatNumber, translator, type Translator } from "@/lib/i18n/t";
import type { Locale } from "@/lib/i18n/locale";
import landing from "@/lib/i18n/messages/landing";
import meta from "@/lib/i18n/messages/meta";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = translator(meta, locale);
  const t = translator(landing, locale);
  return {
    title: {
      absolute: tMeta("home.title"),
    },
    description: tMeta("home.description"),
    keywords: t("meta.keywords")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean),
    alternates: {
      canonical: "https://deetz.kr",
    },
    openGraph: {
      title: tMeta("home.title"),
      description: t("meta.og_description"),
      url: "https://deetz.kr",
      siteName: "deetz",
      type: "website",
    },
  };
}

type Stats = {
  dancers: number | null;
  teams: number | null;
  openProjects: number | null;
};

// 조회 실패를 600초 동안 캐시에 남기지 않으려면 캐시 안에서 throw 해야 한다
// (docs/design-i18n-ui.md §3.3). 화면용 null 폴백은 캐시 바깥에서 처리한다.
// 요청 단위 값(headers()·getLocale())은 여기서 읽지 않는다.
async function loadStatsStrict(): Promise<Stats> {
  const admin = createAdminClient();
  const [dancers, teams, projects] = await Promise.all([
    // 첫 화면 규모 어필용 카운트: 승인 대기(pending) 포함 전체를 노출하되,
    // 명시적으로 거절된(rejected) 건만 제외한다.
    admin
      .from("dancers")
      .select("id", { count: "exact", head: true })
      .neq("approval_status", "rejected"),
    admin
      .from("teams")
      .select("id", { count: "exact", head: true })
      .neq("approval_status", "rejected")
      .eq("is_active", true),
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public")
      .eq("status", "open")
      .is("deleted_at", null),
  ]);
  if (dancers.error) throw dancers.error;
  if (teams.error) throw teams.error;
  if (projects.error) throw projects.error;
  return {
    dancers: dancers.count,
    teams: teams.count,
    openProjects: projects.count,
  };
}

const cachedStats = unstable_cache(loadStatsStrict, ["landing-stats"], {
  tags: ["landing-stats"],
  revalidate: 600,
});

async function loadStats(): Promise<Stats> {
  try {
    return await cachedStats();
  } catch {
    return { dancers: null, teams: null, openProjects: null };
  }
}

function listUseCases(t: Translator<typeof landing>): string[] {
  return [
    t("usecase.mv"),
    t("usecase.ad"),
    t("usecase.stage"),
    t("usecase.choreography"),
    t("usecase.team"),
    t("usecase.portfolio"),
  ];
}

function faqList(t: Translator<typeof landing>): { question: string; answer: string }[] {
  return [
    { question: t("faq.q_service"), answer: t("faq.a_service") },
    { question: t("faq.q_booking"), answer: t("faq.a_booking") },
    { question: t("faq.q_price"), answer: t("faq.a_price") },
    { question: t("faq.q_choreography"), answer: t("faq.a_choreography") },
    { question: t("faq.q_team"), answer: t("faq.a_team") },
    { question: t("faq.q_dancer"), answer: t("faq.a_dancer") },
  ];
}

function statLabel(value: number | null, fallback: string, locale: Locale): string {
  return value === null ? fallback : `${formatNumber(value, locale)}+`;
}

/** 문장 안에 링크를 넣는 자리표시자. 언어마다 링크 위치가 달라 이어 붙이지 않는다. */
const LINK_SLOT = "\u0000";

export default async function HomePage() {
  const locale = await getLocale();
  const t = await serverT(landing);
  const stats = await loadStats();
  const useCases = listUseCases(t);
  const faqs = faqList(t);
  const [faqMoreBefore, faqMoreAfter = ""] = t("faq.more", { link: LINK_SLOT }).split(LINK_SLOT);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": "https://deetz.kr/#service",
        name: t("jsonld.service_name"),
        serviceType: "Dancer booking, choreographer booking, dance team booking, and choreography production",
        provider: { "@id": "https://deetz.kr/#organization" },
        areaServed: "KR",
        url: "https://deetz.kr",
        description: t("jsonld.service_description"),
      },
      {
        "@type": "FAQPage",
        "@id": "https://deetz.kr/#faq",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return (
    <main className="min-h-svh bg-[#f7f5ef] text-[#171611]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="mx-auto grid min-h-svh max-w-6xl grid-cols-1 gap-10 px-5 pb-10 pt-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
        <div className="flex flex-col justify-between gap-12">
          <nav className="flex items-center justify-between gap-4">
            <Link href="/" className="inline-flex items-center">
              <DeetzLogo className="h-8 w-auto" priority />
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher className="mr-1" />
              <Link href="/dancers">
                <Button variant="ghost" size="sm" className="rounded-full">
                  {t("nav.dancers")}
                </Button>
              </Link>
              <Link href="/feed">
                <Button size="sm" className="rounded-full">
                  {t("nav.feed")}
                </Button>
              </Link>
            </div>
          </nav>

          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#d8d2c3] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6a5d]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {t("hero.badge")}
            </p>
            <h1 className="mt-7 max-w-4xl whitespace-pre-line text-5xl font-extrabold leading-[0.96] tracking-normal text-[#171611] [word-break:keep-all] sm:text-6xl lg:text-7xl">
              {t("hero.title")}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f4a40] [word-break:keep-all]">
              {t("hero.lede")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/feed">
                <Button className="h-12 rounded-full px-6 text-base font-semibold">
                  {t("hero.cta_feed")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/dancers">
                <Button variant="outline" className="h-12 rounded-full border-[#cfc8b8] bg-white/70 px-6 text-base font-semibold">
                  {t("hero.cta_portfolio")}
                </Button>
              </Link>
            </div>
          </div>

          <dl className="grid max-w-3xl grid-cols-3 gap-px overflow-hidden rounded-md border border-[#d8d2c3] bg-[#d8d2c3]">
            <div className="bg-white/75 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[#777164]">
                Dancers
              </dt>
              <dd className="mt-3 text-3xl font-extrabold">
                {statLabel(stats.dancers, "70+", locale)}
              </dd>
            </div>
            <div className="bg-white/75 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[#777164]">
                Teams
              </dt>
              <dd className="mt-3 text-3xl font-extrabold">
                {statLabel(stats.teams, "6+", locale)}
              </dd>
            </div>
            <div className="bg-white/75 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[#777164]">
                Calls
              </dt>
              <dd className="mt-3 text-3xl font-extrabold">
                {statLabel(stats.openProjects, t("stats.calls_fallback"), locale)}
              </dd>
            </div>
          </dl>
        </div>

        <aside className="grid gap-3 lg:pt-16">
          <div className="relative min-h-[360px] overflow-hidden rounded-md bg-[#15130f]">
            <Image
              src="https://img.youtube.com/vi/F9_NEqTZfaw/maxresdefault.jpg"
              alt={t("hero.image_alt")}
              fill
              priority
              sizes="(min-width: 1024px) 420px, 100vw"
              className="object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 text-white">
              <p className="text-xs font-semibold tracking-[0.2em] text-white/62">
                deetz magazine
              </p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-normal">
                {t("magazine.title")}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dancers" className="rounded-md bg-[#1f1d18] p-5 text-white">
              <UserRoundCheck className="h-5 w-5" aria-hidden />
              <p className="mt-8 text-sm font-semibold leading-6 [word-break:keep-all]">
                {t("card.dancers")}
              </p>
            </Link>
            <Link href="/feed" className="rounded-md bg-[#e95f37] p-5 text-[#1f140e]">
              <BriefcaseBusiness className="h-5 w-5" aria-hidden />
              <p className="mt-8 text-sm font-bold leading-6 [word-break:keep-all]">
                {t("card.projects")}
              </p>
            </Link>
          </div>
        </aside>
      </section>

      <section className="border-t border-[#ddd6c7] bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[#81796a]">
              what deetz solves
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-normal [word-break:keep-all]">
              {t("solve.title")}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {useCases.map((item) => (
              <div key={item} className="flex gap-3 rounded-md border border-[#e4ded0] p-4">
                <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#e95f37]" aria-hidden />
                <p className="text-sm font-semibold leading-6 text-[#343026] [word-break:keep-all]">
                  {item}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#ddd6c7] bg-[#f7f5ef]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#81796a]">
              <Search className="h-4 w-4" aria-hidden />
              FAQ
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-normal [word-break:keep-all]">
              {t("faq.title")}
            </h2>
          </div>
          <div className="grid gap-3">
            {faqs.map((faq) => (
              <details key={faq.question} className="rounded-md border border-[#ddd6c7] bg-white p-4">
                <summary className="cursor-pointer text-sm font-bold">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#4f4a40]">
                  {faq.answer}
                </p>
              </details>
            ))}
            <p className="mt-2 text-sm text-[#4f4a40]">
              {faqMoreBefore}
              <Link
                href="/guide"
                className="font-semibold text-[#171611] underline underline-offset-4"
              >
                {t("faq.more_link")}
              </Link>
              {faqMoreAfter}
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-[#ddd6c7] bg-white">
        <div className="mx-auto max-w-6xl px-5 pb-28 pt-16 lg:px-8 lg:pb-16">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#81796a]">
            <MessageCircle className="h-4 w-4" aria-hidden />
            Contact
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-normal [word-break:keep-all]">
            {t("contact.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#4f4a40] [word-break:keep-all]">
            {t("contact.body")}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="https://pf.kakao.com/_mbpXX/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#FEE500] px-6 text-base font-bold text-[#191600] transition hover:brightness-95"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              {t("contact.kakao")}
            </a>
            <a
              href="https://ig.me/m/deetz.kr"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#cfc8b8] bg-white px-6 text-base font-semibold text-[#171611] transition hover:bg-[#f3f0e8]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              {t("contact.instagram")}
            </a>
          </div>
        </div>
      </section>

      <BottomTabBar />
    </main>
  );
}
