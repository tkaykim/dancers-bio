import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CircleCheck, MessageCircle, Search, Sparkles, UserRoundCheck } from "lucide-react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { Button } from "@/components/ui/button";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: {
    absolute: "deetz(디츠) | 댄서 섭외·캐스팅·안무 제작 플랫폼",
  },
  description:
    "디츠(deetz)는 MV·광고·무대·방송 댄서 섭외와 안무 제작·안무가·댄스팀 섭외를 연결하는 댄서 캐스팅 플랫폼.",
  keywords: [
    "디츠",
    "deetz",
    "댄서 플랫폼",
    "댄서 캐스팅",
    "댄서 캐스팅 플랫폼",
    "댄서 섭외",
    "댄서 섭외 플랫폼",
    "댄서 구인",
    "백댄서 섭외",
    "안무 제작",
    "안무제작",
    "K-POP 댄서",
    "안무가 섭외",
    "댄스팀 섭외",
    "댄스 공연 섭외",
    "MV 댄서",
    "광고 댄서",
  ],
  alternates: {
    canonical: "https://deetz.kr",
  },
  openGraph: {
    title: "deetz(디츠) | 댄서 섭외·캐스팅·안무 제작 플랫폼",
    description:
      "MV·광고·무대·방송 댄서 섭외와 안무 제작을 포트폴리오로 연결하는 댄서 캐스팅 플랫폼, 디츠(deetz).",
    url: "https://deetz.kr",
    siteName: "deetz",
    type: "website",
  },
};

type Stats = {
  dancers: number | null;
  teams: number | null;
  openProjects: number | null;
};

async function loadStats(): Promise<Stats> {
  try {
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
    return {
      dancers: dancers.count,
      teams: teams.count,
      openProjects: projects.count,
    };
  } catch {
    return { dancers: null, teams: null, openProjects: null };
  }
}

const useCases = [
  "뮤직비디오와 퍼포먼스 영상 백업댄서 섭외",
  "광고, 브랜드 캠페인, 숏폼 콘텐츠 출연 댄서 캐스팅",
  "방송, 행사, 쇼케이스, 팬미팅 무대 댄서 모집",
  "안무 제작, 안무가 섭외, 퍼포먼스 디렉터 연결",
  "댄스 공연 섭외와 댄스팀 포트폴리오 확인",
  "안무가, 디렉터, 인스트럭터, 댄스팀 포트폴리오 확인",
];

const faqs = [
  {
    question: "deetz는 어떤 서비스인가요?",
    answer:
      "deetz(디츠)는 MV, 광고, 무대, 방송, 행사에 필요한 댄서와 안무가를 연결하는 댄서 캐스팅 플랫폼입니다. 검증된 댄서·댄스팀의 경력과 영상 포트폴리오를 직접 보고 섭외할 수 있습니다.",
  },
  {
    question: "댄서나 안무가를 어떻게 섭외하나요?",
    answer:
      "프로젝트 유형, 일정, 지역, 예산, 필요한 장르를 정리해 섭외 공고를 올리면 댄서와 안무가의 지원을 받을 수 있습니다. 마음에 드는 프로필에는 직접 캐스팅 제안을 보낼 수도 있습니다.",
  },
  {
    question: "댄서 섭외 비용은 어떻게 정해지나요?",
    answer:
      "비용은 프로젝트 유형, 촬영·공연 일정, 회차, 지역, 요구 경력에 따라 달라집니다. 공고에 출연료 조건을 적거나 댄서·안무가와 직접 협의해 정하며, 포트폴리오와 경력을 확인한 뒤 합리적으로 결정할 수 있습니다.",
  },
  {
    question: "안무 제작이나 안무가 섭외도 가능한가요?",
    answer:
      "네. 댄서 섭외뿐 아니라 안무 제작, 안무가 섭외, 퍼포먼스 디렉터 연결까지 가능합니다. 안무가·디렉터의 작업 영상과 경력을 보고 프로젝트에 맞는 사람을 섭외할 수 있습니다.",
  },
  {
    question: "공연이나 행사 댄스팀 섭외도 되나요?",
    answer:
      "무대, 행사, 쇼케이스, 팬미팅 같은 공연 댄스팀 섭외도 가능합니다. 공고를 올려 지원을 받거나, 디렉토리에서 댄스팀 포트폴리오를 보고 직접 섭외 제안을 보낼 수 있습니다.",
  },
  {
    question: "댄서로 활동하고 싶은데 어떻게 시작하나요?",
    answer:
      "프로필을 만들고 경력과 영상 포트폴리오를 등록하면 공개된 섭외 공고에 지원하거나 캐스팅 제안을 받을 수 있습니다. 인스타그램 프로필에는 dancers.bio 링크로 본인 페이지를 공유할 수 있습니다.",
  },
];

function statLabel(value: number | null, fallback: string): string {
  return value === null ? fallback : `${value.toLocaleString("ko-KR")}+`;
}

export default async function HomePage() {
  const stats = await loadStats();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": "https://deetz.kr/#service",
        name: "deetz 댄서 섭외 및 안무 제작",
        serviceType: "Dancer booking, choreographer booking, dance team booking, and choreography production",
        provider: { "@id": "https://deetz.kr/#organization" },
        areaServed: "KR",
        url: "https://deetz.kr",
        description:
          "MV, 광고, 무대, 방송, 행사에 필요한 댄서 섭외, 안무 제작, 안무가 섭외, 댄스팀 섭외, 댄스 공연 섭외를 포트폴리오 기반으로 연결하는 플랫폼.",
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
              <Link href="/dancers">
                <Button variant="ghost" size="sm" className="rounded-full">
                  댄서 보기
                </Button>
              </Link>
              <Link href="/feed">
                <Button size="sm" className="rounded-full">
                  공고 보기
                </Button>
              </Link>
            </div>
          </nav>

          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#d8d2c3] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6a5d]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Dancer casting &amp; Curation · 캐스팅, 큐레이션
            </p>
            <h1 className="mt-7 max-w-4xl text-5xl font-extrabold leading-[0.96] tracking-normal text-[#171611] [word-break:keep-all] sm:text-6xl lg:text-7xl">
              댄서 섭외와
              <br />
              안무 제작을
              <br />
              한 곳에서.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f4a40] [word-break:keep-all]">
              디츠(deetz)는 댄서, 안무가, 댄스팀의 포트폴리오와 경력을 기반으로 MV, 광고, 방송, 댄스 공연 섭외를 연결하는 댄서 섭외·캐스팅 플랫폼입니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/feed">
                <Button className="h-12 rounded-full px-6 text-base font-semibold">
                  섭외 공고 보기
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link href="/dancers">
                <Button variant="outline" className="h-12 rounded-full border-[#cfc8b8] bg-white/70 px-6 text-base font-semibold">
                  포트폴리오 둘러보기
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
                {statLabel(stats.dancers, "70+")}
              </dd>
            </div>
            <div className="bg-white/75 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[#777164]">
                Teams
              </dt>
              <dd className="mt-3 text-3xl font-extrabold">
                {statLabel(stats.teams, "6+")}
              </dd>
            </div>
            <div className="bg-white/75 p-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[#777164]">
                Calls
              </dt>
              <dd className="mt-3 text-3xl font-extrabold">
                {statLabel(stats.openProjects, "공개")}
              </dd>
            </div>
          </dl>
        </div>

        <aside className="grid gap-3 lg:pt-16">
          <div className="relative min-h-[360px] overflow-hidden rounded-md bg-[#15130f]">
            <Image
              src="https://img.youtube.com/vi/F9_NEqTZfaw/maxresdefault.jpg"
              alt="deetz 댄서 캐스팅 레퍼런스 영상"
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
                댄서의 경력과 영상으로 판단하는 캐스팅.
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/dancers" className="rounded-md bg-[#1f1d18] p-5 text-white">
              <UserRoundCheck className="h-5 w-5" aria-hidden />
              <p className="mt-8 text-sm font-semibold leading-6 [word-break:keep-all]">
                검증된 댄서·팀 포트폴리오를 확인하세요.
              </p>
            </Link>
            <Link href="/feed" className="rounded-md bg-[#e95f37] p-5 text-[#1f140e]">
              <BriefcaseBusiness className="h-5 w-5" aria-hidden />
              <p className="mt-8 text-sm font-bold leading-6 [word-break:keep-all]">
                프로젝트 공고를 열고 지원자를 비교하세요.
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
              댄서 섭외를 검색, 비교, 지원 흐름으로 바꿉니다.
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
              댄서 캐스팅을 찾는 사람이 바로 이해할 수 있게 정리했습니다.
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
              더 자세한 내용은{" "}
              <Link
                href="/guide"
                className="font-semibold text-[#171611] underline underline-offset-4"
              >
                댄서 섭외·안무 제작 가이드
              </Link>
              에서 확인하세요.
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
            섭외·캐스팅 문의는 편한 채널로 보내주세요.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#4f4a40] [word-break:keep-all]">
            프로젝트 유형, 일정, 예산, 필요한 장르를 함께 적어주시면 더 빠르게 도와드릴 수 있습니다.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="https://pf.kakao.com/_mbpXX/chat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#FEE500] px-6 text-base font-bold text-[#191600] transition hover:brightness-95"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              카카오톡 채널 문의
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
              인스타그램 DM (@deetz.kr)
            </a>
          </div>
        </div>
      </section>

      <BottomTabBar />
    </main>
  );
}
