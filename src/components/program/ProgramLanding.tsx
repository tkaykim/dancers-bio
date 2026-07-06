"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Briefcase,
  ChevronDown,
  HelpCircle,
  Home,
  Languages,
  Music4,
  ShieldCheck,
  Stamp,
  Users,
} from "lucide-react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { cn } from "@/lib/utils";

type Lang = "en" | "ja" | "ko";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

type QA = { q: string; a: string };
type Step = { title: string; body: string };
type Pillar = { title: string; body: string };
type Copy = {
  eyebrow: string;
  title1: string;
  title2: string;
  sub: string;
  painTitle: string;
  pains: string[];
  painClose: string;
  pillarsTitle: string;
  pillars: Pillar[];
  howTitle: string;
  steps: Step[];
  rosterTitle: string;
  rosterNote: string;
  protectTitle: string;
  protectBody: string;
  protectPoints: string[];
  whoTitle: string;
  whoBody: string;
  faqTitle: string;
  faqs: QA[];
  cta: string;
  ctaSub: string;
  visaOnly: string;
  disclaimer: string;
};

// GRIGO 소속 댄서 로스터 — deetz DB 실데이터 (프로필 사진=deetz 공개 스토리지, 링크=deetz 프로필)
const ROSTER: { slug: string; name: string; img: string; credits: string[] }[] = [
  {
    slug: "renan",
    name: "Renan",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/e684ae74-57dd-4785-8a7d-4e4f8a79757f/profile_1773134365759.webp",
    credits: ["G-DRAGON 'TOO BAD'", "aespa 'Armageddon' · 'Whiplash'"],
  },
  {
    slug: "yumeki",
    name: "YUMEKI",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/4cc8a178-1654-42a5-a217-ccb0f982cde3/profile_1773192321867.webp",
    credits: ["TXT 'Love Language'", "ILLIT 'Jellyous' · Street Man Fighter"],
  },
  {
    slug: "emily",
    name: "Emily",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/2f9467ee-497e-4010-9f15-08d82b8c81ae/profile_1773655437634.jpg",
    credits: ["NCT TEN World Tour Direction", "Red Velvet IRENE 'Like A Flower'"],
  },
  {
    slug: "hiyori",
    name: "HIYORI",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/6c4e146c-5dd7-408f-8165-4c8fcd6cc907/profile_1773813569999.png",
    credits: ["NCT WISH 'WISH'", "WayV 'FREQUENCY' Music Bank"],
  },
  {
    slug: "maria",
    name: "MARIA",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/7ba298b7-afbb-4fdf-8a28-7a3a7bd975f4/profile_1773815493545.png",
    credits: ["MAMA AWARDS stages", "NewJeans Bunnies Camp, Tokyo Dome"],
  },
];

const T: Record<Lang, Copy> = {
  en: {
    eyebrow: "K-DEBUT · by deetz × GRIGO Entertainment",
    title1: "Build your dance career",
    title2: "in Korea — all the way.",
    sub: "One program from training to your first paid job in Korea: dance training, Korean language, industry know-how, E-6-1 visa support, and real work through our agency pool.",
    painTitle: "Does this sound like you?",
    pains: [
      "You want to work in the K-pop scene as a dancer, choreographer, or director — but don't know where to start.",
      "Visa problems keep you from working legally, or make your stay in Korea uncertain.",
      "Housing and settling in Seoul feel impossible to figure out from abroad.",
      "You have the skills, but no casting network in Korea.",
    ],
    painClose: "One consultation covers all of it — career path, visa, housing, and your first casting.",
    pillarsTitle: "What's in the program",
    pillars: [
      { title: "Dance training", body: "A training system connected to professional dance academies and working K-pop choreographers in Seoul — matched to your level." },
      { title: "Korean language", body: "Practical Korean for daily life, rehearsals, and sets — enough to work, not just to travel." },
      { title: "Industry education", body: "How the Korean entertainment industry actually works: castings, contracts, fees, and set etiquette." },
      { title: "E-6-1 visa support", body: "We help you prepare and submit the E-6-1 (Arts & Entertainment) visa application — the visa that lets you perform and get paid legally." },
      { title: "Real work via deetz", body: "Music videos, shows, and performances through the deetz casting pool and GRIGO's network — the goal is your first paid credit, not just classes." },
    ],
    howTitle: "How it works",
    steps: [
      { title: "Apply — free", body: "A short application: your background, level, visa status, and timing." },
      { title: "Consultation", body: "We review your case and design your track — training, language, visa, housing, schedule." },
      { title: "Train & prepare", body: "Dance + Korean + industry classes while your visa documents are prepared." },
      { title: "Work", body: "Get cast through deetz — MVs, stages, and shows, with contracts done right." },
    ],
    rosterTitle: "Dancers already working with GRIGO",
    rosterNote: "GRIGO Entertainment is a dancer-first management & agency. These are real stages our dancers are on right now — tap a card to see their full profile on deetz.",
    protectTitle: "We protect dancers",
    protectBody: "This industry has a fair-pay problem. We built deetz to fix it — and the program runs on the same rules:",
    protectPoints: [
      "Written contracts for every job — pay, schedule, and NDA terms stated clearly, under GRIGO Entertainment.",
      "Transparent fees — you know what you pay for before you decide anything.",
      "We take unpaid-fee cases seriously — if a client doesn't pay a dancer, we fight for it.",
    ],
    whoTitle: "Who's behind this",
    whoBody: "GRIGO Entertainment is a management & agency built specifically for dancers — music videos, broadcast, and live stages with K-pop artists. deetz is its casting platform where Korean dancers and clients already work every day. You train inside a working agency, not a classroom.",
    faqTitle: "Questions",
    faqs: [
      { q: "How much does it cost?", a: "The application and consultation are free. Program pricing depends on your track (length, housing, visa route) — we explain everything clearly in the consultation before you commit." },
      { q: "How good do I need to be?", a: "We review every application — level, potential, and goals. You don't need to be a finished pro; you need to be serious." },
      { q: "I only need the visa, not the training.", a: "That's fine — we have a visa-only support track. Apply and tell us, or see the visa page." },
      { q: "I'm not in Korea yet — can I apply?", a: "Yes. Tell us when you can enter Korea and we'll plan your track around it." },
      { q: "Is work guaranteed?", a: "No honest agency can guarantee castings. What we do promise: real submissions to real jobs through deetz and GRIGO's network, and transparent feedback." },
    ],
    cta: "Apply now — free",
    ctaSub: "Takes about 3 minutes. We reply with a consultation slot.",
    visaOnly: "Only need visa support? → E-6-1 visa page",
    disclaimer: "Visa approval is decided by Korea Immigration; this is preparation and application support, not legal advice. Program details are confirmed individually in the consultation.",
  },
  ja: {
    eyebrow: "K-DEBUT · deetz × GRIGO Entertainment",
    title1: "韓国でダンスを、",
    title2: "仕事にする。",
    sub: "ダンストレーニング、韓国語、業界教育、E-6-1ビザサポート、そしてdeetzのキャスティングプールを通じた初めてのお仕事まで。すべてをひとつのプログラムで。",
    painTitle: "こんな状況ではありませんか？",
    pains: [
      "K-POPシーンでダンサー・コレオグラファー・ディレクターとして活動したいのに、何から始めればいいか分からない。",
      "ビザの問題で合法的に働けない。滞在がいつも不安。",
      "ソウルでの住まいや生活のセットアップが、海外からでは調べようがない。",
      "実力はあるのに、韓国のキャスティングネットワークがない。",
    ],
    painClose: "キャリア・ビザ・住まい・最初のキャスティングまで、一度のカウンセリングでまとめて答えます。",
    pillarsTitle: "プログラム内容",
    pillars: [
      { title: "ダンストレーニング", body: "ソウルの専門ダンスアカデミーと現役K-POPコレオグラファーが連携したトレーニングシステム。レベルに合わせて進めます。" },
      { title: "韓国語教育", body: "生活・リハーサル・現場で使える実践韓国語。旅行会話ではなく、仕事のための言葉。" },
      { title: "業界教育", body: "韓国エンタメ業界のリアル：キャスティングの流れ、契約、ギャラ、現場マナー。" },
      { title: "E-6-1ビザサポート", body: "合法的に公演し報酬を得られるE-6-1（芸術興行）ビザの準備・申請をサポート。" },
      { title: "deetz経由で実際のお仕事へ", body: "deetzのキャスティングプールとGRIGOのネットワークで、MV・ステージ・公演へ。レッスンで終わらせず、初めてのクレジットまで。" },
    ],
    howTitle: "進め方",
    steps: [
      { title: "無料で応募", body: "経歴・レベル・ビザ状況・時期を伝える簡単な応募フォーム。" },
      { title: "カウンセリング", body: "状況を確認し、トレーニング・語学・ビザ・住まい・スケジュールのトラックを設計。" },
      { title: "トレーニング＆準備", body: "ダンス＋韓国語＋業界教育。並行してビザ書類を準備。" },
      { title: "お仕事へ", body: "deetz経由でキャスティング。契約はきちんと書面で交わします。" },
    ],
    rosterTitle: "GRIGOで活動中のダンサーたち",
    rosterNote: "GRIGO Entertainmentはダンサー専門のマネジメント＆エージェンシー。所属ダンサーが今立っている実際のステージです。カードをタップするとdeetzのプロフィールが見られます。",
    protectTitle: "ダンサーを守ります",
    protectBody: "この業界には未払いの問題があります。deetzはそれを変えるために作られ、プログラムも同じルールで動きます：",
    protectPoints: [
      "すべての案件で書面契約。ギャラ・スケジュール・NDA条件を明記します（契約主体はGRIGO Entertainment）。",
      "費用は透明に。決める前に、何にいくらかかるかを明確に説明します。",
      "未払いには本気で対応。クライアントがダンサーに支払わない場合、私たちが闘います。",
    ],
    whoTitle: "運営について",
    whoBody: "GRIGO Entertainmentはダンサー専門のマネジメント＆エージェンシー。K-POPアーティストのMV・放送・ステージを手がけています。deetzはそのキャスティングプラットフォームで、韓国のダンサーとクライアントが日々使っています。教室ではなく、現役エージェンシーの中でトレーニングします。",
    faqTitle: "よくある質問",
    faqs: [
      { q: "費用はいくらですか？", a: "応募とカウンセリングは無料です。プログラム費用はトラック（期間・住居・ビザルート）により異なり、決定前のカウンセリングですべて明確にご説明します。" },
      { q: "どのくらいのレベルが必要ですか？", a: "レベル・伸びしろ・目標を見て、すべての応募を審査します。完成したプロである必要はありません。本気であることが条件です。" },
      { q: "ビザだけ必要です。トレーニングは不要です。", a: "問題ありません。ビザサポートのみのトラックもあります。応募時にお知らせいただくか、ビザページをご覧ください。" },
      { q: "まだ韓国にいませんが応募できますか？", a: "はい。入国できる時期を教えていただければ、それに合わせて設計します。" },
      { q: "お仕事は保証されますか？", a: "誠実なエージェンシーはキャスティングを保証できません。約束できるのは：deetzとGRIGOのネットワークを通じた本物の案件への推薦と、透明なフィードバックです。" },
    ],
    cta: "無料で応募する",
    ctaSub: "約3分。カウンセリング日程をご連絡します。",
    visaOnly: "ビザサポートだけ必要な方は → E-6-1ビザページ",
    disclaimer: "ビザの可否は韓国出入国当局が判断します。これは準備・申請のサポートであり、法的助言ではありません。プログラムの詳細はカウンセリングで個別に確定します。",
  },
  ko: {
    eyebrow: "K-DEBUT · deetz × 그리고엔터테인먼트",
    title1: "한국에서 댄스 커리어를,",
    title2: "처음부터 끝까지.",
    sub: "댄스 트레이닝, 한국어, 업계 교육, E-6-1 비자 지원부터 deetz 캐스팅 풀을 통한 첫 일감까지, 하나의 프로그램으로 준비합니다.",
    painTitle: "혹시 지금 이런 상황인가요?",
    pains: [
      "한국 K-pop 씬에서 댄서, 안무가, 디렉터로 활동하고 싶은데 어디서부터 시작해야 할지 막막하다.",
      "비자 문제로 합법적으로 일할 수 없거나, 체류가 늘 불안하다.",
      "서울에서 살 집, 정착 준비를 해외에서는 알아볼 방법이 없다.",
      "실력은 있는데 한국 캐스팅 네트워크가 없다.",
    ],
    painClose: "커리어, 비자, 주거, 첫 캐스팅까지. 한 번의 상담에서 종합적으로 답해드립니다.",
    pillarsTitle: "프로그램 구성",
    pillars: [
      { title: "댄스 트레이닝", body: "서울의 전문 댄스 학원, 현역 K-pop 안무가와 연계된 트레이닝 시스템입니다. 레벨에 맞춰 진행해요." },
      { title: "한국어 교육", body: "생활, 연습실, 현장에서 바로 쓰는 실전 한국어를 배웁니다. 여행 회화가 아니라 일하기 위한 언어예요." },
      { title: "업계 교육", body: "캐스팅 절차, 계약, 페이, 현장 매너까지. 한국 엔터 업계가 실제로 돌아가는 방식을 배웁니다." },
      { title: "E-6-1 비자 지원", body: "E-6-1(예술흥행) 비자 준비와 신청을 지원합니다. 합법적으로 공연하고 보수를 받을 수 있는 비자예요." },
      { title: "deetz 실무 투입", body: "deetz 캐스팅 풀과 GRIGO 네트워크로 뮤직비디오, 무대, 공연에 연결합니다. 수업으로 끝나지 않고 첫 크레딧까지 함께 가요." },
    ],
    howTitle: "진행 방식",
    steps: [
      { title: "무료 지원", body: "경력, 레벨, 비자 상태, 가능한 시기를 담은 짧은 지원서를 냅니다." },
      { title: "상담", body: "케이스를 검토해 트레이닝, 언어, 비자, 주거, 일정까지 트랙을 설계합니다." },
      { title: "트레이닝·준비", body: "댄스, 한국어, 업계 교육을 받으면서 동시에 비자 서류를 준비합니다." },
      { title: "실무 투입", body: "deetz를 통해 캐스팅됩니다. 계약은 반드시 서면으로 진행해요." },
    ],
    rosterTitle: "GRIGO에서 활동 중인 댄서들",
    rosterNote: "그리고엔터테인먼트는 댄서 전문 매니지먼트이자 에이전시입니다. 소속 댄서들이 지금 서고 있는 실제 무대들이에요. 카드를 누르면 deetz 프로필에서 전체 활동 내역을 볼 수 있습니다.",
    protectTitle: "댄서를 지킵니다",
    protectBody: "이 업계엔 정산 문제가 있습니다. deetz는 그걸 바꾸려고 만들어졌고, 프로그램도 같은 원칙으로 돌아갑니다:",
    protectPoints: [
      "모든 일은 서면 계약으로 진행합니다. 페이, 일정, NDA 조건을 명시하고, 계약 주체는 (주)그리고엔터테인먼트입니다.",
      "비용은 투명하게. 결정 전에 무엇에 얼마가 드는지 명확히 안내합니다.",
      "미수 정산은 진지하게 다룹니다. 클라이언트가 댄서에게 지급하지 않으면 함께 싸웁니다.",
    ],
    whoTitle: "누가 운영하나요",
    whoBody: "그리고엔터테인먼트(GRIGO)는 댄서 전문 매니지먼트이자 에이전시로, K-pop 아티스트의 MV, 방송, 무대를 만들어 왔습니다. deetz는 그 캐스팅 플랫폼으로, 한국 댄서와 클라이언트가 매일 쓰고 있어요. 교실이 아니라 현역 에이전시 안에서 트레이닝합니다.",
    faqTitle: "자주 묻는 질문",
    faqs: [
      { q: "비용이 얼마인가요?", a: "지원과 상담은 무료예요. 프로그램 비용은 트랙(기간·주거·비자 경로)에 따라 다르고, 결정 전 상담에서 전부 명확히 안내합니다." },
      { q: "실력이 어느 정도여야 하나요?", a: "레벨, 가능성, 목표를 보고 모든 지원서를 검토합니다. 완성된 프로일 필요는 없어요. 진지하면 됩니다." },
      { q: "비자만 필요해요.", a: "괜찮아요. 비자 지원 단독 트랙이 있습니다. 지원서에 적어 주시거나 비자 페이지를 봐주세요." },
      { q: "아직 한국 밖인데 지원되나요?", a: "네. 입국 가능 시점을 알려주시면 그에 맞춰 설계합니다." },
      { q: "일이 보장되나요?", a: "정직한 에이전시는 캐스팅을 보장하지 않습니다. 약속하는 건: deetz와 GRIGO 네트워크를 통한 실제 일감 추천, 그리고 투명한 피드백입니다." },
    ],
    cta: "무료로 지원하기",
    ctaSub: "약 3분이면 끝나요. 검토 후 상담 일정을 회신드립니다.",
    visaOnly: "비자 지원만 필요하신가요? → E-6-1 비자 페이지",
    disclaimer: "비자 발급 여부는 한국 출입국 당국이 결정하며, 이는 준비·신청 지원이지 법률 자문이 아닙니다. 프로그램 세부 내용은 상담에서 개별 확정됩니다.",
  },
};

const PILLAR_ICONS = [Music4, Languages, BookOpenText, Stamp, Briefcase];
const PAIN_ICONS = [HelpCircle, AlertTriangle, Home, Users];

export function ProgramLanding({
  initialLang = "en",
  lockLang = false,
  embed = false,
}: {
  initialLang?: Lang;
  lockLang?: boolean;
  embed?: boolean;
}) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    if (lockLang) return; // URL로 언어를 지정해 들어온 경우 브라우저 자동감지로 덮지 않음
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("ja")) setLang("ja");
    else if (nav.startsWith("ko")) setLang("ko");
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
        {embed ? <span /> : <DeetzLogo className="h-7 w-auto" priority />}
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

      {/* Hero */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{c.eyebrow}</p>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-5xl">
        {c.title1}
        <br />
        {c.title2}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2 md:mt-5 md:max-w-2xl md:text-base">{c.sub}</p>

      <CtaButton lang={lang} label={c.cta} className="mt-7 md:mt-8 md:self-start md:px-12" />
      <p className="mt-2 text-center text-xs text-ink-4 md:text-left">{c.ctaSub}</p>

      {/* Pain points */}
      <SectionTitle>{c.painTitle}</SectionTitle>
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
        {c.pains.map((p, i) => {
          const Icon = PAIN_ICONS[i];
          return (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
              <Icon className="mt-0.5 size-5 shrink-0 text-ink-3" />
              <p className="text-[13px] leading-relaxed text-ink-2">{p}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm font-semibold leading-relaxed text-foreground">{c.painClose}</p>

      {/* Pillars */}
      <SectionTitle>{c.pillarsTitle}</SectionTitle>
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
        {c.pillars.map((p, i) => {
          const Icon = PILLAR_ICONS[i];
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5",
                i === c.pillars.length - 1 && "md:col-span-2",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                <Icon className="size-5 text-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{p.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{p.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* How it works */}
      <SectionTitle>{c.howTitle}</SectionTitle>
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
        {c.steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {i + 1}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{s.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Dancer protection */}
      <SectionTitle>{c.protectTitle}</SectionTitle>
      <div className="rounded-xl border-2 border-foreground/10 bg-secondary/40 p-5 md:p-6">
        <p className="text-sm leading-relaxed text-foreground">{c.protectBody}</p>
        <div className="mt-3.5 flex flex-col gap-2.5 md:grid md:grid-cols-3 md:gap-4">
          {c.protectPoints.map((p, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
              <p className="text-[13px] leading-relaxed text-ink-2">{p}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Who */}
      <SectionTitle>{c.whoTitle}</SectionTitle>
      <p className="text-sm leading-relaxed text-ink-2 md:max-w-2xl md:text-[15px]">{c.whoBody}</p>

      {/* GRIGO roster */}
      <SectionTitle>{c.rosterTitle}</SectionTitle>
      <p className="mb-4 text-[13px] leading-relaxed text-ink-2 md:max-w-2xl">{c.rosterNote}</p>
      <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-2 md:mx-0 md:px-0">
        {ROSTER.map((d) => (
          <a
            key={d.slug}
            href={`/d/${d.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-hairline-2 bg-card transition-transform hover:-translate-y-0.5 md:w-[calc(20%-10px)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.img}
              alt={d.name}
              loading="lazy"
              className="aspect-[3/4] w-full object-cover"
            />
            <div className="p-3">
              <p className="text-sm font-bold text-foreground">{d.name}</p>
              {d.credits.map((cr, i) => (
                <p key={i} className="mt-1 text-[11px] leading-snug text-ink-3">
                  {cr}
                </p>
              ))}
            </div>
          </a>
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
            <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">{f.a}</p>
          </details>
        ))}
      </div>

      <CtaButton lang={lang} label={c.cta} className="mt-9 md:mt-10 md:self-start md:px-12" />

      <Link
        href={`/visa?lang=${lang}`}
        className="mt-4 text-center text-xs text-ink-3 underline underline-offset-2 hover:text-foreground md:text-left"
      >
        {c.visaOnly}
      </Link>

      <p className="mt-5 text-center text-xs leading-relaxed text-ink-4 md:max-w-2xl md:text-left">{c.disclaimer}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3.5 mt-11 text-lg font-bold tracking-tight md:mb-4 md:mt-14 md:text-2xl">{children}</h2>;
}

function CtaButton({ lang, label, className }: { lang: Lang; label: string; className?: string }) {
  return (
    <Link
      href={`/visa/apply?lang=${lang}&src=program`}
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
