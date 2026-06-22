import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGuide, guides } from "@/lib/guides";

const SITE = "https://deetz.kr";

export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) return { title: { absolute: "가이드 | deetz(디츠)" } };
  return {
    title: { absolute: g.metaTitle },
    description: g.description,
    keywords: g.keywords,
    alternates: { canonical: `${SITE}/guide/${g.slug}` },
    openGraph: {
      title: g.metaTitle,
      description: g.description,
      url: `${SITE}/guide/${g.slug}`,
      siteName: "deetz",
      type: "article",
    },
  };
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = getGuide(slug);
  if (!g) notFound();

  const others = guides.filter((x) => x.slug !== g.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${SITE}/guide/${g.slug}#article`,
        headline: g.title,
        description: g.description,
        inLanguage: "ko-KR",
        mainEntityOfPage: `${SITE}/guide/${g.slug}`,
        author: { "@id": `${SITE}/#organization` },
        publisher: { "@id": `${SITE}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE}/guide/${g.slug}#faq`,
        mainEntity: g.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${SITE}/guide/${g.slug}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "deetz", item: SITE },
          {
            "@type": "ListItem",
            position: 2,
            name: "가이드",
            item: `${SITE}/guide`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: g.title,
            item: `${SITE}/guide/${g.slug}`,
          },
        ],
      },
    ],
  };

  return (
    <main className="bg-[#f7f5ef] text-[#171611]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
        <nav className="text-xs text-[#81796a]" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-foreground">
            deetz
          </Link>
          <span className="px-1.5">›</span>
          <Link href="/guide" className="hover:text-foreground">
            가이드
          </Link>
        </nav>

        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight [word-break:keep-all] lg:text-4xl">
          {g.title}
        </h1>
        <p className="mt-5 text-base leading-7 text-[#4f4a40] [word-break:keep-all]">
          {g.intro}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/feed">
            <Button className="h-11 rounded-full px-5 text-sm font-semibold">
              섭외 공고 보기
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          </Link>
          <Link href="/dancers">
            <Button
              variant="outline"
              className="h-11 rounded-full border-[#cfc8b8] bg-white/70 px-5 text-sm font-semibold"
            >
              댄서·팀 포트폴리오 보기
            </Button>
          </Link>
        </div>

        <div className="mt-12 flex flex-col gap-10">
          {g.sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-xl font-bold tracking-tight [word-break:keep-all] lg:text-2xl">
                {s.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {s.body.map((p, i) => (
                  <p
                    key={i}
                    className="text-[15px] leading-7 text-[#3f3a30] [word-break:keep-all]"
                  >
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-14">
          <h2 className="text-xl font-bold tracking-tight lg:text-2xl">
            자주 묻는 질문
          </h2>
          <div className="mt-4 flex flex-col gap-3">
            {g.faqs.map((f) => (
              <details
                key={f.q}
                className="rounded-md border border-[#ddd6c7] bg-white p-4"
              >
                <summary className="cursor-pointer text-sm font-bold [word-break:keep-all]">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-6 text-[#4f4a40] [word-break:keep-all]">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-14 rounded-lg border border-[#ddd6c7] bg-white p-6">
          <h2 className="text-lg font-bold">deetz에서 바로 시작하기</h2>
          <p className="mt-2 text-sm leading-6 text-[#4f4a40] [word-break:keep-all]">
            deetz(디츠)는 검증된 댄서·댄스팀·안무가의 경력과 영상 포트폴리오를 기반으로 섭외와 캐스팅을 연결하는 플랫폼입니다.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link href="/feed">
              <Button className="h-11 rounded-full px-5 text-sm font-semibold">
                섭외 공고 보기
              </Button>
            </Link>
            <Link href="/dancers">
              <Button
                variant="outline"
                className="h-11 rounded-full border-[#cfc8b8] px-5 text-sm font-semibold"
              >
                포트폴리오 둘러보기
              </Button>
            </Link>
          </div>
        </section>

        {others.length > 0 ? (
          <section className="mt-14">
            <h2 className="text-base font-bold text-[#81796a]">다른 가이드</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {others.map((o) => (
                <li key={o.slug}>
                  <Link
                    href={`/guide/${o.slug}`}
                    className="text-[15px] font-semibold text-[#171611] underline-offset-4 hover:underline"
                  >
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}
