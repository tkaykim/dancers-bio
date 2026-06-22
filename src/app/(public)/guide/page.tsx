import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { guides } from "@/lib/guides";

const SITE = "https://deetz.kr";

export const metadata: Metadata = {
  title: { absolute: "댄서 섭외·안무 제작 가이드 | deetz(디츠)" },
  description:
    "댄서 섭외, 안무 제작, 댄스팀 섭외 방법과 비용, 절차를 정리한 deetz(디츠) 가이드 모음입니다.",
  keywords: [
    "댄서 섭외 가이드",
    "안무 제작 가이드",
    "댄스팀 섭외",
    "댄서 섭외 방법",
    "댄서 섭외 비용",
    "디츠",
    "deetz",
  ],
  alternates: { canonical: `${SITE}/guide` },
  openGraph: {
    title: "댄서 섭외·안무 제작 가이드 | deetz(디츠)",
    description:
      "댄서 섭외, 안무 제작, 댄스팀 섭외 방법과 비용, 절차를 정리한 가이드 모음.",
    url: `${SITE}/guide`,
    siteName: "deetz",
    type: "website",
  },
};

export default function GuideIndexPage() {
  return (
    <main className="bg-[#f7f5ef] text-[#171611]">
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#81796a]">
          deetz 가이드
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight [word-break:keep-all] lg:text-4xl">
          댄서 섭외·안무 제작 가이드
        </h1>
        <p className="mt-4 text-base leading-7 text-[#4f4a40] [word-break:keep-all]">
          댄서 섭외, 안무 제작, 댄스팀 섭외의 방법과 비용 기준, 절차를 정리했습니다. 처음 섭외를 준비한다면 아래 가이드부터 확인해 보세요.
        </p>

        <ul className="mt-10 flex flex-col gap-4">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guide/${g.slug}`}
                className="group flex items-start justify-between gap-4 rounded-lg border border-[#ddd6c7] bg-white p-5 transition-colors hover:border-[#cfc8b8]"
              >
                <span>
                  <span className="block text-lg font-bold tracking-tight [word-break:keep-all]">
                    {g.title}
                  </span>
                  <span className="mt-1.5 block text-sm leading-6 text-[#4f4a40] [word-break:keep-all]">
                    {g.description}
                  </span>
                </span>
                <ArrowRight
                  className="mt-1 h-5 w-5 shrink-0 text-[#81796a] transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
