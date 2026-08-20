"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Lang = "en" | "ja" | "ko";

const LANGS: Lang[] = ["en", "ja", "ko"];

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  stepsTitle: string;
  steps: { title: string; body: string; note?: string }[];
  meanwhileTitle: string;
  meanwhile: string[];
  ownEffortTitle: string;
  ownEffort: string;
  costTitle: string;
  cost: string;
  contactTitle: string;
  contact: string;
  privateNote: string;
};

const T: Record<Lang, Copy> = {
  en: {
    eyebrow: "deetz visa program",
    title: "What happens next",
    intro:
      "You passed the level test, so your place in the program is confirmed. This page explains the steps from here.",
    stepsTitle: "The process",
    steps: [
      {
        title: "Contract and documents",
        body:
          "GRIGO ENTERTAINMENT signs the employment contract and acts as your sponsor in Korea. A licensed administrative agent prepares and files the paperwork. We will tell you exactly which documents we need from you, one at a time.",
      },
      {
        title: "Certificate of visa eligibility — under review",
        body:
          "Korea Immigration reviews the application. This usually takes about 2 to 3 months.",
        note:
          "The timeline depends on the authorities and can change. deetz cannot guarantee that a visa will be issued — that decision belongs to Korea Immigration.",
      },
      {
        title: "Visa number and entry",
        body:
          "Once the certificate is issued you receive a visa issuance number. You take it to the Korean embassy or consulate in your country, receive your visa, and enter Korea.",
      },
      {
        title: "Starting your activity",
        body:
          "After you arrive we begin sending you work — choreography video productions and dancer appearance requests among them.",
        note:
          "The amount of work is not fixed or guaranteed. It depends on each project and on you.",
      },
    ],
    meanwhileTitle: "While you wait",
    meanwhile: [
      "Keep training — your level when you arrive is what decides your first jobs.",
      "Keep filming. New footage is what we can show to clients.",
      "Any Korean you learn now makes your first months much easier.",
      "Keep your passport and documents valid and ready.",
    ],
    ownEffortTitle: "One thing to be clear about",
    ownEffort:
      "How much work you get and how far your career goes comes down to your own skill and attitude. We open the door and handle the process — raising your level, getting along with the people around you, and building a career you are proud of is your part.",
    costTitle: "Cost and payment",
    cost: "Your coordinator will walk you through the cost and payment method personally.",
    contactTitle: "Questions",
    contact: "Reply to any email from us, or write to contact@deetz.kr.",
    privateNote: "This is a private link prepared for you. Please do not share it.",
  },
  ja: {
    eyebrow: "deetz ビザプログラム",
    title: "これからの流れ",
    intro:
      "レベルテストに合格され、プログラムの進行が確定しました。ここから先の流れをご案内いたします。",
    stepsTitle: "手続きの流れ",
    steps: [
      {
        title: "契約と書類の準備",
        body:
          "雇用契約と韓国での身元保証はGRIGO ENTERTAINMENTが行い、書類の作成・申請は提携の行政書士が担当します。ご用意いただく書類は、その都度個別にご案内いたします。",
      },
      {
        title: "査証発給認定書の審査",
        body: "韓国の出入国当局による審査があり、通常およそ2〜3か月かかります。",
        note:
          "期間は関係機関の審査状況により変わることがあります。ビザの発給可否は出入国当局が最終的に判断するため、deetzが発給を保証することはできません。",
      },
      {
        title: "査証番号の受領と入国",
        body:
          "認定書が発給されると査証発給認定番号を受け取ります。お住まいの国の韓国大使館・領事館でビザの発給を受け、入国となります。",
      },
      {
        title: "活動の開始",
        body: "入国後、振付制作映像やダンサー出演などのご依頼をお願いしていきます。",
        note:
          "お仕事の量が決まっているわけではなく、保証されるものでもありません。プロジェクトの状況とご本人次第です。",
      },
    ],
    meanwhileTitle: "待っている間に",
    meanwhile: [
      "練習を続けてください。入国時点の実力が最初の仕事を決めます。",
      "撮影を続けてください。新しい映像がクライアントにお見せできる材料になります。",
      "今のうちに覚えた韓国語が、最初の数か月を大きく楽にします。",
      "パスポートや書類の有効期限をご確認ください。",
    ],
    ownEffortTitle: "ひとつだけ、正直にお伝えします",
    ownEffort:
      "お仕事の量やキャリアの伸びは、最終的にはご本人の実力と姿勢によって決まります。私たちは入口を開き、手続きをお手伝いしますが、実力を上げること、現場の方々と良い関係を築くこと、そこからキャリアを積み上げることはご本人の役割です。",
    costTitle: "費用とお支払い",
    cost: "費用とお支払い方法は、担当者より個別にご案内いたします。",
    contactTitle: "お問い合わせ",
    contact: "弊社からのメールにそのままご返信いただくか、contact@deetz.kr までご連絡ください。",
    privateNote: "このページはご本人専用の非公開リンクです。共有はお控えください。",
  },
  ko: {
    eyebrow: "deetz 비자 프로그램",
    title: "이후 절차 안내",
    intro:
      "레벨테스트를 통과하셔서 프로그램 진행이 확정되었습니다. 여기서부터의 절차를 안내드립니다.",
    stepsTitle: "진행 절차",
    steps: [
      {
        title: "계약과 서류 준비",
        body:
          "고용계약과 국내 신원보증은 GRIGO ENTERTAINMENT가 맡고, 서류 작성과 제출은 제휴 행정사가 담당합니다. 준비해 주셔야 할 서류는 그때그때 개별로 안내드립니다.",
      },
      {
        title: "사증발급인정서 심사",
        body: "출입국 당국의 심사가 진행되며 보통 2~3개월 정도 걸립니다.",
        note:
          "기간은 관계기관 심사 상황에 따라 달라질 수 있습니다. 비자 발급 여부는 출입국 당국이 최종 결정하므로 deetz가 발급을 보장하지는 않습니다.",
      },
      {
        title: "사증 번호 수령과 입국",
        body:
          "인정서가 나오면 사증발급인정번호를 받게 됩니다. 거주 국가의 한국 대사관·영사관에서 비자를 발급받고 입국하시게 됩니다.",
      },
      {
        title: "활동 개시",
        body: "입국 이후 안무 제작 영상, 댄서 출연 등의 의뢰를 진행합니다.",
        note:
          "일의 양이 정해져 있거나 보장되는 것은 아닙니다. 프로젝트 상황과 본인에 따라 달라집니다.",
      },
    ],
    meanwhileTitle: "기다리는 동안",
    meanwhile: [
      "연습을 이어가 주세요. 입국 시점의 실력이 첫 일을 결정합니다.",
      "촬영을 이어가 주세요. 새 영상이 클라이언트에게 보여드릴 자료가 됩니다.",
      "지금 익혀두는 한국어가 초반 몇 달을 훨씬 수월하게 만듭니다.",
      "여권과 서류의 유효기간을 확인해 주세요.",
    ],
    ownEffortTitle: "한 가지는 분명히 말씀드립니다",
    ownEffort:
      "일의 양과 커리어가 어디까지 갈지는 결국 본인의 실력과 태도에 달려 있습니다. 저희는 입구를 열고 절차를 돕지만, 실력을 끌어올리고 현장 사람들과 좋은 관계를 쌓아 커리어를 만들어가는 일은 본인의 몫입니다.",
    costTitle: "비용과 결제",
    cost: "비용과 결제 방법은 담당자가 개별적으로 안내드립니다.",
    contactTitle: "문의",
    contact: "받으신 메일에 그대로 회신하시거나 contact@deetz.kr 로 연락 주세요.",
    privateNote: "이 페이지는 본인에게만 발급된 비공개 링크입니다. 공유하지 말아 주세요.",
  },
};

export function VisaNextSteps({ preferredLang }: { preferredLang: string | null }) {
  const initial: Lang = preferredLang === "ja" || preferredLang === "ko" ? preferredLang : "en";
  const [lang, setLang] = useState<Lang>(initial);
  const t = T[lang];

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 py-10">
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
        <p className="mt-4 text-sm leading-relaxed text-ink-2">{t.intro}</p>
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
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
                {step.note ? (
                  <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{step.note}</p>
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
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{t.ownEffort}</p>
      </section>

      {/* 결제는 아직 붙이지 않는다 (대표 결정 2026-08-18). 붙일 때는 이 자리에
          케이스 결제와 같은 방식으로 금액·결제 버튼을 넣는다 — 토큰으로 지원자가
          이미 식별되므로 개인 결제 링크를 그대로 쓸 수 있다. */}
      <section className="mt-8 border-t border-hairline-2 pt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.costTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.cost}</p>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-3">{t.contactTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.contact}</p>
      </section>

      <p className="mt-10 text-[11px] leading-relaxed text-ink-4">{t.privateNote}</p>
    </main>
  );
}
