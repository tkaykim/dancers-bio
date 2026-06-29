"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileCheck, GraduationCap, Stamp } from "lucide-react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { cn } from "@/lib/utils";

type Lang = "en" | "ja" | "ko";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

type Copy = {
  title1: string;
  title2: string;
  body: string;
  e6: string;
  steps: { title: string; body: string }[];
  cta: string;
  disclaimer: string;
};

const T: Record<Lang, Copy> = {
  en: {
    title1: "Dance in Korea,",
    title2: "the right way.",
    body: "To work as a professional dancer in Korea, you need an %s visa. deetz helps you prepare — from assessing your case to guiding documents and supporting your application.",
    e6: "E-6-1 (Arts & Entertainment)",
    steps: [
      { title: "Tell us about you", body: "A short questionnaire — your nationality, visa status, dance experience, and timing." },
      { title: "Get a clear plan", body: "We review your case and guide the training, documents, and steps you'll need." },
      { title: "Apply with support", body: "deetz helps you prepare and submit your E-6-1 visa application." },
    ],
    cta: "Check your visa options — free",
    disclaimer: "This is preparation and application support, not legal advice. Visa approval is decided by Korea Immigration.",
  },
  ja: {
    title1: "韓国で、",
    title2: "正しく踊るために。",
    body: "韓国でプロのダンサーとして活動するには、%s ビザが必要です。deetzが、状況の確認から書類の案内、申請のサポートまでお手伝いします。",
    e6: "E-6-1（芸術興行）",
    steps: [
      { title: "あなたについて教えてください", body: "国籍・ビザ状況・ダンス経験・時期などの簡単なアンケート。" },
      { title: "明確なプランを", body: "状況を確認し、必要なトレーニング・書類・手続きをご案内します。" },
      { title: "サポート付きで申請", body: "deetzがE-6-1ビザ申請の準備と提出をサポートします。" },
    ],
    cta: "ビザの可能性を無料でチェック",
    disclaimer: "これは準備・申請のサポートであり、法的助言ではありません。ビザの可否は韓国出入国当局が判断します。",
  },
  ko: {
    title1: "한국에서 제대로",
    title2: "춤추기 위해.",
    body: "한국에서 프로 댄서로 활동하려면 %s 비자가 필요해요. deetz가 상황 진단부터 서류 안내, 신청까지 함께 준비합니다.",
    e6: "E-6-1(예술흥행)",
    steps: [
      { title: "당신에 대해 알려주세요", body: "국적·비자 상태·댄스 경험·시기 등 짧은 설문." },
      { title: "명확한 로드맵 받기", body: "상황을 검토해 필요한 교육·서류·절차를 안내해 드려요." },
      { title: "지원받으며 신청", body: "deetz가 E-6-1 비자 신청 준비와 제출을 도와드려요." },
    ],
    cta: "내 비자 가능성 무료로 확인",
    disclaimer: "법률 자문이 아닌 준비·신청 지원 서비스입니다. 비자 발급 여부는 한국 출입국 당국이 결정합니다.",
  },
};

const ICONS = [FileCheck, GraduationCap, Stamp];

export function VisaLanding({ initialLang = "en" }: { initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  // 첫 방문 시 브라우저 언어로 자동 선택(ja/ko, 그 외 en).
  useEffect(() => {
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("ja")) setLang("ja");
    else if (nav.startsWith("ko")) setLang("ko");
  }, []);

  const c = T[lang];
  const [bodyA, bodyB] = c.body.split("%s");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-16 pt-6">
      <div className="mb-10 flex items-center justify-between">
        <DeetzLogo className="h-7 w-auto" priority />
        <div className="flex gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
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

      <h1 className="text-3xl font-bold leading-tight tracking-tight">
        {c.title1}
        <br />
        {c.title2}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
        {bodyA}
        <span className="font-medium text-foreground">{c.e6}</span>
        {bodyB}
      </p>

      <div className="mt-9 flex flex-col gap-3">
        {c.steps.map((s, i) => {
          const Icon = ICONS[i];
          return (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Icon className="size-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <Link
        href={`/visa/apply?lang=${lang}`}
        className="mt-9 flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {c.cta}
        <ArrowRight className="size-4" />
      </Link>

      <p className="mt-5 text-center text-xs leading-relaxed text-ink-4">{c.disclaimer}</p>
    </div>
  );
}
