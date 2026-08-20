"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Lang = "en" | "ja" | "ko";

const LANGS: Lang[] = ["en", "ja", "ko"];

// 본문은 문장 단위 배열로 둔다 — 한 문장이 한 줄로 떨어져야 읽기 쉽다.
type Copy = {
  eyebrow: string;
  title: string;
  intro: string[];
  stepsTitle: string;
  steps: { title: string; body: string[]; note?: string[] }[];
  meanwhileTitle: string;
  meanwhile: string[];
  ownEffortTitle: string;
  ownEffort: string[];
  costTitle: string;
  cost: string[];
  contactTitle: string;
  contact: string[];
  privateNote: string[];
};

const T: Record<Lang, Copy> = {
  en: {
    eyebrow: "deetz visa program",
    title: "What happens next",
    intro: [
      "You passed the level test, so your place in the program is confirmed.",
      "Here is what happens from here.",
    ],
    stepsTitle: "The process",
    steps: [
      {
        title: "Contract and documents",
        body: [
          "GRIGO ENTERTAINMENT signs the employment contract and acts as your Korean sponsor for the visa process.",
          "A licensed Korean administrative agent prepares and files the paperwork.",
          "We will tell you which documents we need from you as each one comes up.",
        ],
      },
      {
        title: "Certificate for Confirmation of Visa Issuance",
        body: [
          "Korean immigration authorities review the application.",
          "This usually takes about two to three months.",
        ],
        note: [
          "The timeline depends on the authorities and can change.",
          "The immigration authorities make the final decision, so deetz cannot guarantee that a visa will be issued.",
        ],
      },
      {
        title: "Visa number and entry",
        body: [
          "Once the certificate is issued, you receive a visa issuance confirmation number.",
          "You submit that number to the Korean embassy or consulate that covers your area, receive your visa, and enter Korea.",
        ],
      },
      {
        title: "Starting work",
        body: [
          "Once you are in Korea, we offer you work when suitable projects come up, such as choreography video productions and dancer appearances.",
        ],
        note: [
          "The amount of work is not fixed or guaranteed.",
          "It depends on the project, your skill level, and your attitude.",
        ],
      },
    ],
    meanwhileTitle: "While you wait",
    meanwhile: [
      "Your level when you arrive affects your first jobs, so keep training.",
      "Keep filming new footage, because that is what we show to clients.",
      "Whatever Korean you pick up now will make your first months much easier.",
      "Check that your passport and documents stay valid.",
    ],
    ownEffortTitle: "One thing to be clear about",
    ownEffort: [
      "How much work you get, and how your career develops, depends on your own skill and attitude.",
      "deetz handles the process and connects you with work when it is available.",
      "Raising your level and earning trust on set is your part.",
    ],
    costTitle: "Cost and payment",
    cost: ["Your coordinator will go through the cost and the payment method with you directly."],
    contactTitle: "Questions",
    contact: ["Reply to any email from us, or write to contact@deetz.kr."],
    privateNote: ["This page is private.", "Please do not share the link."],
  },
  ja: {
    eyebrow: "deetz ビザプログラム",
    title: "これからの流れ",
    intro: [
      "レベルテストに合格され、プログラムへの参加が確定しました。",
      "ここから先の流れをご案内いたします。",
    ],
    stepsTitle: "手続きの流れ",
    steps: [
      {
        title: "契約と書類の準備",
        body: [
          "雇用契約と韓国での身元保証は、GRIGO ENTERTAINMENTが行います。",
          "書類の作成と申請は、提携している韓国の行政書士が担当します。",
          "ご用意いただく書類は、必要になった時点で個別にご案内いたします。",
        ],
      },
      {
        title: "査証発給認定書の審査",
        body: [
          "韓国の出入国当局による審査が行われます。",
          "通常はおよそ2〜3か月かかります。",
        ],
        note: [
          "審査の状況により、期間が変わることがあります。",
          "発給の可否は出入国当局が最終的に判断するため、deetzが発給を保証することはできません。",
        ],
      },
      {
        title: "査証番号の受領と入国",
        body: [
          "認定書が発給されると、査証発給認定番号を受け取ります。",
          "その番号を管轄の韓国大使館・領事館に提示し、ビザの発給を受けて入国となります。",
        ],
      },
      {
        title: "活動の開始",
        body: [
          "入国後は、条件が合う案件があれば、振付映像制作やダンサー出演などのお仕事をご案内します。",
        ],
        note: [
          "お仕事の量が決まっているわけではなく、保証されるものでもありません。",
          "プロジェクトの状況、ご本人の実力、姿勢、準備状況によって変わります。",
        ],
      },
    ],
    meanwhileTitle: "待っている間に",
    meanwhile: [
      "入国時点の実力が最初のお仕事を左右しますので、練習は続けてください。",
      "クライアントにお見せする材料になりますので、新しい映像も撮り続けてください。",
      "今のうちに覚えた韓国語は、最初の数か月で大きく役に立ちます。",
      "パスポートや書類の有効期限をご確認ください。",
    ],
    ownEffortTitle: "お伝えしておきたいこと",
    ownEffort: [
      "お仕事の量やキャリアの伸びは、ご本人の実力と姿勢によって決まります。",
      "deetzは手続きを進め、お仕事の機会をご案内します。",
      "実力を上げ、現場で信頼を積み重ねていくのはご本人の役割です。",
    ],
    costTitle: "費用とお支払い",
    cost: ["費用とお支払い方法は、担当者より個別にご案内いたします。"],
    contactTitle: "お問い合わせ",
    contact: ["弊社からのメールにご返信いただくか、contact@deetz.kr までご連絡ください。"],
    privateNote: ["このページは非公開です。", "リンクの共有はお控えください。"],
  },
  ko: {
    eyebrow: "deetz 비자 프로그램",
    title: "이후 절차 안내",
    intro: [
      "레벨테스트를 통과하셔서 프로그램 진행이 확정되었습니다.",
      "이후 절차를 안내드립니다.",
    ],
    stepsTitle: "진행 절차",
    steps: [
      {
        title: "계약과 서류 준비",
        body: [
          "고용계약과 국내 신원보증은 GRIGO ENTERTAINMENT가 맡습니다.",
          "서류 작성과 제출은 제휴 행정사가 담당합니다.",
          "준비하실 서류는 필요한 시점에 개별로 안내드립니다.",
        ],
      },
      {
        title: "사증발급인정서 심사",
        body: ["출입국 당국의 심사가 진행됩니다.", "보통 2~3개월 정도 걸립니다."],
        note: [
          "심사 상황에 따라 기간은 달라질 수 있습니다.",
          "비자 발급 여부는 출입국 당국이 최종 결정하므로 deetz가 발급을 보장하지 않습니다.",
        ],
      },
      {
        title: "사증 번호 수령과 입국",
        body: [
          "인정서가 나오면 사증발급인정번호를 받습니다.",
          "그 번호를 가지고 거주 국가의 한국 대사관 또는 영사관에서 비자를 발급받아 입국합니다.",
        ],
      },
      {
        title: "활동 개시",
        body: ["입국 후 조건이 맞는 프로젝트가 있을 때 안무 제작 영상, 댄서 출연 등의 일을 안내드립니다."],
        note: [
          "일의 양이 정해져 있거나 보장되지는 않습니다.",
          "프로젝트 상황과 본인의 실력과 태도 등 준비 정도에 따라 달라집니다.",
        ],
      },
    ],
    meanwhileTitle: "기다리는 동안",
    meanwhile: [
      "입국 시점의 실력이 첫 일을 좌우하니 연습을 쉬지 마세요.",
      "클라이언트에게 보여드릴 자료가 되니 새 영상도 계속 찍어 두세요.",
      "지금 익혀 둔 한국어가 초반 몇 달을 훨씬 수월하게 만듭니다.",
      "여권과 서류의 유효기간을 확인해 주세요.",
    ],
    ownEffortTitle: "한 가지는 분명히 말씀드립니다",
    ownEffort: [
      "일의 양과 커리어는 본인의 실력과 태도에 달려 있습니다.",
      "deetz는 절차를 진행하고, 일이 있을 때 기회를 연결합니다.",
      "실력을 올리고 현장에서 신뢰를 쌓는 것은 본인이 해야 하는 일입니다.",
    ],
    costTitle: "비용과 결제",
    cost: ["비용과 결제 방법은 담당자가 개별적으로 안내드립니다."],
    contactTitle: "문의",
    contact: ["받으신 메일에 회신하시거나 contact@deetz.kr 로 연락 주세요."],
    privateNote: ["이 페이지는 비공개 페이지입니다.", "링크를 공유하지 말아 주세요."],
  },
};

function Lines({ items, className }: { items: string[]; className?: string }) {
  return (
    <>
      {items.map((line, index) => (
        <p key={line} className={cn(index > 0 && "mt-1", className)}>
          {line}
        </p>
      ))}
    </>
  );
}

export function VisaNextSteps({ preferredLang }: { preferredLang: string | null }) {
  const initial: Lang = preferredLang === "ja" || preferredLang === "ko" ? preferredLang : "en";
  const [lang, setLang] = useState<Lang>(initial);
  const t = T[lang];
  // 한국어만 keep-all — 일본어는 단어 사이에 공백이 없어 keep-all 을 주면 줄이 안 끊긴다.
  const wrap = lang === "ko" ? "break-keep" : undefined;

  return (
    <main className={cn("mx-auto w-full max-w-[640px] px-5 py-10", wrap)}>
      <div className="flex justify-end gap-1.5">
        {LANGS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setLang(value)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              value === lang ? "border-foreground text-foreground" : "border-hairline-2 text-ink-3",
            )}
          >
            {value === "ja" ? "日本語" : value === "ko" ? "한국어" : "EN"}
          </button>
        ))}
      </div>

      <header className="mt-6">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-3">{t.eyebrow}</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight">{t.title}</h1>
        <div className="mt-4 text-sm leading-relaxed text-ink-2">
          <Lines items={t.intro} />
        </div>
      </header>

      <section className="mt-9">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.stepsTitle}</h2>
        <ol className="mt-4 flex flex-col gap-6">
          {t.steps.map((step, index) => (
            <li key={step.title} className="flex gap-3.5">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-hairline-2 text-[11px] font-semibold text-ink-2">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold">{step.title}</h3>
                <div className="mt-1.5 text-sm leading-relaxed text-ink-2">
                  <Lines items={step.body} />
                </div>
                {step.note ? (
                  <div className="mt-2 text-[12px] leading-relaxed text-ink-3">
                    <Lines items={step.note} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-9 rounded-2xl border border-hairline-2 bg-card p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.meanwhileTitle}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {t.meanwhile.map((line) => (
            <li key={line} className="flex gap-2 text-sm leading-relaxed text-ink-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-4" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.ownEffortTitle}</h2>
        <div className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
          <Lines items={t.ownEffort} />
        </div>
      </section>

      {/* 결제는 아직 붙이지 않는다 (대표 결정 2026-08-18). 붙일 때는 이 자리에
          금액·결제 버튼을 넣는다 — 개인별 금액이 필요하면 토큰 링크로 올린다. */}
      <section className="mt-8 border-t border-hairline-2 pt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.costTitle}</h2>
        <div className="mt-2 text-sm leading-relaxed text-ink-2">
          <Lines items={t.cost} />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.contactTitle}</h2>
        <div className="mt-2 text-sm leading-relaxed text-ink-2">
          <Lines items={t.contact} />
        </div>
      </section>

      <div className="mt-10 text-[11px] leading-relaxed text-ink-4">
        <Lines items={t.privateNote} />
      </div>
    </main>
  );
}
