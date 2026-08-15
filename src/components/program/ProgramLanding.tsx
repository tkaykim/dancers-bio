"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  Briefcase,
  ChevronDown,
  ExternalLink,
  Globe,
  HelpCircle,
  Home,
  Languages,
  Music4,
  ShieldCheck,
  Stamp,
  Users,
  Video,
  X,
} from "lucide-react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { splitSentences } from "@/components/village/copy";
import { cn } from "@/lib/utils";

type Lang = "en" | "ja" | "ko";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

// 최초 진입 언어 선택 팝업용 (모국어 표기 + 영어 병기)
const LANG_CHOICES: { code: Lang; native: string; en: string }[] = [
  { code: "en", native: "English", en: "English" },
  { code: "ja", native: "日本語", en: "Japanese" },
  { code: "ko", native: "한국어", en: "Korean" },
];

// 사용자가 고른 언어를 기억해 다음 방문에 다시 묻지 않는다.
const LANG_STORAGE_KEY = "deetz_program_lang";

type QA = { q: string; a: string };
type Step = { title: string; body: string };
type Pillar = { title: string; body: string };
type Copy = {
  eyebrow: string;
  title1: string;
  title2: string;
  sub: string;
  eligibility: string;
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
  disclaimer: string;
  sheetCredits: string;
  sheetProfile: string;
  villageBadge: string;
  villageTitle: string;
  villageBody: string;
  villageCta: string;
};

// GRIGO 소속 댄서 로스터 — deetz DB 실데이터 (프로필 사진=deetz 공개 스토리지)
// nat: 국적 (대표 확인 + 인스타 바이오·공개 프로필 검증 — Emily US=Born in New York / 나머지 4인=일본)
type Nat = "us" | "jp";
const NAT_NAME: Record<Nat, Record<Lang, string>> = {
  us: { en: "USA", ja: "アメリカ", ko: "미국" },
  jp: { en: "Japan", ja: "日本", ko: "일본" },
};

function InstaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

// 국기 SVG (이모지는 Windows에서 글자로 렌더되므로 아이콘으로 직접 그림)
function FlagIcon({ nat, className }: { nat: Nat; className?: string }) {
  if (nat === "jp") {
    return (
      <svg viewBox="0 0 30 20" className={cn("h-3 w-[18px] rounded-[2px] border border-hairline-2", className)} aria-hidden>
        <rect width="30" height="20" fill="#fff" />
        <circle cx="15" cy="10" r="6" fill="#bc002d" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 30 20" className={cn("h-3 w-[18px] rounded-[2px] border border-hairline-2", className)} aria-hidden>
      <rect width="30" height="20" fill="#fff" />
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} y={i * (20 / 9)} width="30" height={20 / 9} fill="#b22234" />
      ))}
      <rect width="13" height={20 * (4 / 9)} fill="#3c3b6e" />
    </svg>
  );
}

type RosterItem = {
  name: string;
  handle: string;
  nat: Nat;
  ig: string;
  deetz?: string;
  img: string;
  credits: string[];
  more: string[];
};

const ROSTER: RosterItem[] = [
  {
    name: "Emily",
    handle: "@m12_emilylis",
    nat: "us",
    ig: "https://www.instagram.com/m12_emilylis/",
    deetz: "/d/emily",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/2f9467ee-497e-4010-9f15-08d82b8c81ae/profile_1773655437634.jpg",
    credits: ["NCT TEN World Tour Direction", "Red Velvet IRENE 'Like A Flower'"],
    more: [
      "NCT TEN 'Stunner' World Tour — Performance Direction",
      "Red Velvet IRENE 'Like A Flower'",
      "BIBI 'Burn it' MV — Choreo & Direction",
      "SHINee MINHO 'Tempo'",
      "Jay Park 'Like I Do' MV",
      "P1Harmony 'Unique'",
      "World of Dance Korea 2024 — Grand Prize",
    ],
  },
  {
    name: "Renan",
    handle: "@renan0115",
    nat: "jp",
    ig: "https://www.instagram.com/renan0115/",
    deetz: "/d/renan",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/e684ae74-57dd-4785-8a7d-4e4f8a79757f/profile_1773134365759.webp",
    credits: ["G-DRAGON 'TOO BAD'", "aespa 'Armageddon' · 'Whiplash'"],
    more: [
      "G-DRAGON 'TOO BAD'",
      "aespa 'Armageddon' · 'Whiplash' · 'Mine' 외 다수",
      "(여자)아이들 'Mono'",
      "NMIXX 'TIC TIC'",
      "Red Velvet 'Chill Kill' · 'Birthday'",
      "XG 'LEFT RIGHT' · 'SHOOTING STAR' 외 다수",
      "2025 CHOREO AWARDS",
    ],
  },
  {
    name: "YUMEKI",
    handle: "@yumekitakenaka_",
    nat: "jp",
    ig: "https://www.instagram.com/yumekitakenaka_/",
    deetz: "/d/yumeki",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/4cc8a178-1654-42a5-a217-ccb0f982cde3/profile_1773192321867.webp",
    credits: ["TXT 'Love Language'", "ILLIT 'Jellyous' · Street Man Fighter"],
    more: [
      "TOMORROW X TOGETHER 'Love Language'",
      "ILLIT 'Jellyous' · 'oops!'",
      "Street Man Fighter (Mnet)",
      "Boys II Planet (Mnet)",
      "PRODUCE 101 JAPAN THE GIRLS",
      "KANSAI COLLECTION SS2026",
    ],
  },
  {
    name: "Emily",
    handle: "@emilee.jp",
    nat: "jp",
    ig: "https://www.instagram.com/emilee.jp/",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/program/emilee-jp.jpg",
    credits: ["aespa 'Drift' · SMTM12", "'KPOPPED' (Apple TV+) · 2PM JUN. K"],
    more: [
      "aespa 'Drift'",
      "Show Me The Money 12",
      "'KPOPPED' (Apple TV+)",
      "2PM JUN. K 'Midnight Ticket'",
      "NCT TEN · Whee In stages",
      "RAP:PUBLIC",
    ],
  },
  {
    name: "HIYORI",
    handle: "@hiyori_club",
    nat: "jp",
    ig: "https://www.instagram.com/hiyori_club/",
    deetz: "/d/hiyori",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/6c4e146c-5dd7-408f-8165-4c8fcd6cc907/profile_1773813569999.png",
    credits: ["NCT WISH 'WISH'", "WayV 'FREQUENCY' Music Bank"],
    more: [
      "NCT WISH 'WISH'",
      "WayV 'FREQUENCY' — 2024 Music Bank Global Festival",
      "WayV Dance Break — 2024 AAA",
      "Da-iCE 'TAKE IT BACK'",
      "WATERBOMB — HOOK Stage",
      "2023 APAN STAR AWARDS",
    ],
  },
  {
    name: "MARIA",
    handle: "@maria._.bh01",
    nat: "jp",
    ig: "https://www.instagram.com/maria._.bh01/",
    deetz: "/d/maria",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/7ba298b7-afbb-4fdf-8a28-7a3a7bd975f4/profile_1773815493545.png",
    credits: ["MAMA AWARDS stages", "NewJeans Bunnies Camp, Tokyo Dome"],
    more: [
      "MAMA AWARDS — aespa · SEVENTEEN · ZEROBASEONE",
      "NewJeans 'Bunnies Camp' @ Tokyo Dome",
      "KCON JAPAN Dream Stage",
      "KBS 가요대축제 · KGMA — P1Harmony",
      "WayV TEN Solo Concert",
      "JO1 'Hands In My Pocket'",
    ],
  },
  {
    name: "MIZUKI",
    handle: "@mizukkiz",
    nat: "jp",
    ig: "https://www.instagram.com/mizukkiz/",
    deetz: "/d/mizuki",
    img: "https://wvfmqiajdvbsevlhlgtl.supabase.co/storage/v1/object/public/profile-photos/677d2dfd-3781-49fb-8614-05b3aac579bc/avatar_1782996183416.jpeg",
    credits: ["SEVENTEEN World Tour [NEW_] · BE THE SUN", "Stray Kids 5-STAR Dome Tour"],
    more: [
      "SEVENTEEN 'BE THE SUN' · 'FOLLOW' · World Tour [NEW_]",
      "Stray Kids 5-STAR Dome Tour",
      "SHINee KEY 'Pleasure Shop' · 'Overthink'",
      "PLAVE Asia Tour [DASH] · THE BOYZ concert",
      "ITZY Fan Meeting · WATERBOMB 2025",
      "BAEKHO 'OFF-ROAD' — Choreography",
    ],
  },
];

const T: Record<Lang, Copy> = {
  en: {
    eyebrow: "K-DEBUT · by deetz × GRIGO Entertainment",
    title1: "Build your dance career",
    title2: "in Korea — all the way.",
    sub: "After an online meeting, we will explain whether we can move forward and what schedule is realistic for your situation.",
    eligibility:
      "Already in Korea, or still abroad and planning to come — either way, you can apply. We support your move and visa from wherever you are.",
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
      { title: "Online meeting first", body: "We review your current situation, goals, and possible visa route before planning the next step." },
      { title: "In-person evaluation, if needed", body: "If we need to confirm your level in person, we will share the available schedule after the online meeting." },
      { title: "Direct visa track", body: "If your route is ready, we begin the visa document and application process with you." },
      { title: "Professional training, if needed", body: "If more preparation is needed, we may recommend training with an affiliated dance academy and working professionals." },
      { title: "Progress review", body: "Your progress review helps decide whether to move into visa preparation or keep training with a clear next target." },
      { title: "deetz project opportunities", body: "You may apply to matching deetz projects while building your profile. Casting and paid work are opportunities, not guarantees." },
    ],
    howTitle: "How it works",
    steps: [
      { title: "Apply", body: "Share your current visa, location, career evidence, and goals." },
      { title: "Online meeting", body: "We review your information and explain the realistic next step for your situation." },
      { title: "Follow the right route", body: "Move into visa preparation when ready, or prepare first through professional training." },
      { title: "Visa & project opportunities", body: "We support the visa process and let you apply to matching deetz projects without guaranteeing approval or work." },
    ],
    rosterTitle: "Dancers already working with GRIGO",
    rosterNote: "GRIGO Entertainment is a dancer-first management & agency. Several of the dancers below actually moved to Korea from the US and Japan and are working on E-6 visas right now. Tap a card to see their full history.",
    protectTitle: "We protect dancers",
    protectBody: "This industry has a fair-pay problem. We built deetz to fix it — and the program runs on the same rules:",
    protectPoints: [
      "Written contracts for every job — pay, schedule, and NDA terms stated clearly, under GRIGO Entertainment.",
      "Clear scope — we explain the process and responsibilities before you decide anything.",
      "We take unpaid work cases seriously — if a client doesn't pay a dancer, we fight for it.",
    ],
    whoTitle: "Who's behind this",
    whoBody: "GRIGO Entertainment is a dancer-first management & agency founded in 2019, with deep experience across choreography production, dancer dispatch, broadcast, and advertising. deetz is its casting platform where Korean dancers and clients already work every day. You train inside a working agency, not a classroom.",
    faqTitle: "Questions",
    faqs: [
      { q: "What happens after I apply?", a: "We review your information first, then contact you with the next step for an online meeting and any additional questions." },
      { q: "How good do I need to be?", a: "We look at your experience, submitted video, and current goals to decide whether visa preparation or training should come first." },
      { q: "I only need the visa, not the training.", a: "If your route is ready, training is not mandatory and we can begin visa preparation." },
      { q: "I'm not in Korea yet — can I apply?", a: "Yes. Tell us when you can enter Korea and we'll plan your track around it." },
      { q: "Is work guaranteed?", a: "No honest agency can guarantee castings. What we do promise: real submissions to real jobs through deetz and GRIGO's network, and transparent feedback." },
    ],
    cta: "Apply now",
    ctaSub: "Takes about 3 minutes. We review your application and reply with the next step.",
    disclaimer: "Visa approval is decided by Korea Immigration, and casting is decided by each project. deetz provides preparation, application support, and project opportunities, but does not guarantee a visa or work.",
    sheetCredits: "Selected work",
    sheetProfile: "View deetz profile",
    villageBadge: "Coming soon",
    villageTitle: "deetz Village by GRIGO Entertainment",
    villageBody:
      "Renting in Seoul normally means a 10–20 million KRW deposit before your first month's rent. We are preparing a dancer house where you can start without it. It is not open yet — we are checking demand first.",
    villageCta: "See deetz Village",
  },
  ja: {
    eyebrow: "K-DEBUT · deetz × GRIGO Entertainment",
    title1: "韓国でダンスを、",
    title2: "仕事にする。",
    sub: "オンラインミーティングで詳しく確認した後、進行可能かどうかと現実的なスケジュールをご案内します。",
    eligibility:
      "すでに韓国にいる方も、これから韓国に来て活動したい海外の方も、どなたでも応募できます。今いる場所から、渡航とビザをサポートします。",
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
      { title: "まずオンライン相談", body: "現在の状況、目標、考えられるビザ経路を確認してから次のステップを設計します。" },
      { title: "必要に応じた対面評価", body: "対面での確認が必要な場合は、オンライン相談後に可能な日程をご案内します。" },
      { title: "ビザへ直接進むルート", body: "すぐに進行できる場合は、ビザ書類の準備と申請手続きを一緒に始めます。" },
      { title: "必要に応じた専門トレーニング", body: "準備が必要な場合は、提携ダンスアカデミーと現役専門家によるトレーニングをご案内します。" },
      { title: "進行確認", body: "進行状況を確認し、ビザ準備へ進むか、次の目標を設定してトレーニングを継続するかを判断します。" },
      { title: "deetzプロジェクトの機会", body: "プロフィールに合うdeetz案件へ応募できます。キャスティングや有償の仕事を保証するものではありません。" },
    ],
    howTitle: "進め方",
    steps: [
      { title: "応募", body: "現在のビザ、居住地、活動経歴、目標を共有してください。" },
      { title: "オンライン相談", body: "情報を確認し、現実的な次のステップをご案内します。" },
      { title: "適切なルートへ進行", body: "準備が整っている場合はビザ準備へ、必要な場合は専門トレーニングへ進みます。" },
      { title: "ビザ・案件機会", body: "ビザ手続きをサポートし、deetz案件へ応募できる機会を提供しますが、発給や仕事は保証されません。" },
    ],
    rosterTitle: "GRIGOで活動中のダンサーたち",
    rosterNote: "GRIGO Entertainmentはダンサー専門のマネジメント＆エージェンシー。下のダンサーの多くは、実際にアメリカや日本から韓国に渡り、E-6ビザで活動しています。カードをタップすると活動履歴が見られます。",
    protectTitle: "ダンサーを守ります",
    protectBody: "この業界には未払いの問題があります。deetzはそれを変えるために作られ、プログラムも同じルールで動きます：",
    protectPoints: [
      "すべての案件で書面契約。ギャラ・スケジュール・NDA条件を明記します（契約主体はGRIGO Entertainment）。",
      "進行範囲を明確に。決める前に、流れと役割を分かりやすく説明します。",
      "未払いには本気で対応。クライアントがダンサーに支払わない場合、私たちが闘います。",
    ],
    whoTitle: "運営について",
    whoBody: "GRIGO Entertainmentは2019年設立のダンサー専門マネジメント＆エージェンシー。振付制作、ダンサー派遣、放送、広告まで、数多くのプロジェクトを手がけてきました。deetzは韓国のダンサーとクライアントが日々使っている、GRIGOのキャスティングプラットフォームです。このプログラムに入るということは、ただレッスンを受けることではなく、実際にキャスティングが動くエージェンシーの中でキャリアを始めるということです。",
    faqTitle: "よくある質問",
    faqs: [
      { q: "応募後はどう進みますか？", a: "まず情報を確認し、オンライン相談と追加確認事項について個別にご連絡します。" },
      { q: "どのくらいのレベルが必要ですか？", a: "これまでの経歴、提出映像、現在の目標を確認し、ビザ準備とトレーニングのどちらを先に進めるか判断します。" },
      { q: "ビザだけ必要です。トレーニングは不要です。", a: "すぐに進行できる状態であれば、トレーニングは必須ではなく、ビザ準備を始められます。" },
      { q: "まだ韓国にいませんが応募できますか？", a: "はい。入国できる時期を教えていただければ、それに合わせて設計します。" },
      { q: "お仕事は保証されますか？", a: "誠実なエージェンシーはキャスティングを保証できません。約束できるのは：deetzとGRIGOのネットワークを通じた本物の案件への推薦と、透明なフィードバックです。" },
    ],
    cta: "応募する",
    ctaSub: "約3分。内容を確認し、次のステップをご連絡します。",
    disclaimer: "ビザ発給は韓国の出入国当局が、キャスティングは各プロジェクトが判断します。deetzは準備・申請支援と案件機会を提供しますが、ビザや仕事を保証しません。",
    sheetCredits: "主な活動",
    sheetProfile: "deetzプロフィールを見る",
    villageBadge: "準備中",
    villageTitle: "deetz Village by GRIGO Entertainment",
    villageBody:
      "ソウルで部屋を借りるには、家賃の前に1,000万〜2,000万ウォンの保証金が必要です。それがなくても始められるダンサーハウスを準備しています。まだオープン前で、いまは需要を確認している段階です。",
    villageCta: "deetz Villageを見る",
  },
  ko: {
    eyebrow: "K-DEBUT · deetz × 그리고엔터테인먼트",
    title1: "한국에서 댄스 커리어를,",
    title2: "처음부터 끝까지.",
    sub: "온라인 미팅으로 자세한 정보를 상담한 후에 진행 가능 여부와 일정을 안내드립니다.",
    eligibility:
      "한국에 이미 계신 분도, 지금 해외에 있고 한국에 들어와 활동하고 싶은 분도 모두 지원할 수 있어요. 어디에 계시든 입국과 비자까지 함께 준비합니다.",
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
      { title: "온라인 상담 먼저", body: "현재 상황, 목표, 가능한 비자 경로를 확인한 뒤 다음 단계를 설계합니다." },
      { title: "필요 시 대면 확인", body: "대면 확인이 필요한 경우 온라인 상담 후 가능한 일정을 안내합니다." },
      { title: "비자 준비 트랙", body: "바로 진행 가능한 경우 비자 서류 준비와 신청 절차를 함께 시작합니다." },
      { title: "필요 시 전문 트레이닝", body: "준비가 더 필요한 경우 제휴 댄스학원과 현업 전문가의 트레이닝을 안내합니다." },
      { title: "진행 상태 확인", body: "진행 상태를 확인하며 비자 준비로 이동할지, 다음 목표를 정해 트레이닝을 이어갈지 판단합니다." },
      { title: "deetz 프로젝트 기회", body: "프로필에 맞는 deetz 프로젝트에 지원할 수 있습니다. 캐스팅이나 유급 일감이 보장되는 것은 아닙니다." },
    ],
    howTitle: "진행 방식",
    steps: [
      { title: "지원", body: "현재 비자, 거주지, 활동 경력, 목표를 공유합니다." },
      { title: "온라인 상담", body: "정보를 확인한 뒤 현재 상황에 맞는 현실적인 다음 단계를 안내합니다." },
      { title: "적절한 경로로 진행", body: "준비가 된 경우 비자 준비로, 더 필요한 경우 전문 트레이닝으로 진행합니다." },
      { title: "비자·프로젝트 기회", body: "비자 절차를 지원하고 deetz 프로젝트 지원 기회를 제공하되, 발급이나 일거리를 보장하지 않습니다." },
    ],
    rosterTitle: "GRIGO에서 활동 중인 댄서들",
    rosterNote: "그리고엔터테인먼트는 댄서 전문 매니지먼트이자 에이전시입니다. 아래 댄서들 중 여러 명이 실제로 미국과 일본에서 건너와, E-6 비자로 한국 무대에 서고 있습니다. 카드를 누르면 전체 활동 내역이 보입니다.",
    protectTitle: "댄서를 지킵니다",
    protectBody: "이 업계엔 정산 문제가 있습니다. deetz는 그걸 바꾸려고 만들어졌고, 프로그램도 같은 원칙으로 돌아갑니다:",
    protectPoints: [
      "모든 일은 서면 계약으로 진행합니다. 페이, 일정, NDA 조건을 명시하고, 계약 주체는 (주)그리고엔터테인먼트입니다.",
      "진행 범위는 명확하게. 결정 전에 과정과 역할을 이해하기 쉽게 설명합니다.",
      "미수 정산은 진지하게 다룹니다. 클라이언트가 댄서에게 지급하지 않으면 함께 싸웁니다.",
    ],
    whoTitle: "누가 운영하나요",
    whoBody: "그리고엔터테인먼트(GRIGO)는 2019년에 설립된 댄서 전문 매니지먼트이자 에이전시입니다. 안무 제작, 댄서 파견, 방송, 광고까지 다양한 프로젝트를 진행하며 풍부한 경험을 쌓아 왔고, deetz는 한국 댄서와 클라이언트가 매일 쓰는 GRIGO의 캐스팅 플랫폼입니다. 이 프로그램에 들어오면 단순히 수업을 듣는 게 아니라, 실제 캐스팅이 오가는 에이전시 안에서 커리어를 시작하게 됩니다.",
    faqTitle: "자주 묻는 질문",
    faqs: [
      { q: "지원 후에는 어떻게 진행되나요?", a: "먼저 정보를 확인한 뒤 온라인 상담과 추가 확인 사항을 개별적으로 안내합니다." },
      { q: "실력이 어느 정도여야 하나요?", a: "기존 경력, 제출 영상, 현재 목표를 확인해 비자 준비와 트레이닝 중 무엇을 먼저 진행할지 판단합니다." },
      { q: "비자만 필요해요.", a: "바로 진행 가능한 상태라면 트레이닝은 필수가 아니며 비자 준비를 시작할 수 있습니다." },
      { q: "아직 한국 밖인데 지원되나요?", a: "네. 입국 가능 시점을 알려주시면 그에 맞춰 설계합니다." },
      { q: "일이 보장되나요?", a: "캐스팅을 100% 보장한다고 말하는 곳은 믿기 어렵죠. 저희는 deetz와 GRIGO 네트워크로 실제 일감에 계속 추천하고, 결과를 투명하게 알려드립니다." },
    ],
    cta: "지원하기",
    ctaSub: "약 3분이면 끝나요. 내용을 확인한 뒤 다음 단계를 안내합니다.",
    disclaimer: "비자 발급은 한국 출입국 당국이, 캐스팅은 각 프로젝트가 결정합니다. deetz는 준비·신청 지원과 프로젝트 기회를 제공하지만 비자나 일거리를 보장하지 않습니다.",
    sheetCredits: "주요 활동",
    sheetProfile: "deetz 프로필 보기",
    villageBadge: "오픈 준비 중",
    villageTitle: "deetz Village by GRIGO Entertainment",
    villageBody:
      "서울에서 방을 구하려면 첫 월세보다 먼저 보증금 1,000만~2,000만원이 필요합니다. 그 장벽 없이 시작할 수 있는 댄서 하우스를 준비하고 있습니다. 아직 오픈 전이고, 지금은 수요를 확인하는 단계입니다.",
    villageCta: "deetz Village 보기",
  },
};

const PILLAR_ICONS = [Video, Music4, Languages, BookOpenText, Stamp, Briefcase];
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
  const [selected, setSelected] = useState<RosterItem | null>(null);
  const [askLang, setAskLang] = useState(false);
  const [suggested, setSuggested] = useState<Lang>(initialLang);

  // 선택한 언어를 URL(?lang=)에 반영 → 그 상태로 복붙하면 언어가 유지된 채 공유된다.
  const syncUrlLang = (l: Lang) => {
    if (embed) return; // iframe 내부에서는 URL 조작하지 않음
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", l);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL 조작 불가 환경 무시 */
    }
  };

  const selectLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, l);
    } catch {
      /* localStorage 불가 환경 무시 */
    }
    syncUrlLang(l);
  };

  useEffect(() => {
    // URL에 ?lang= 로 명시했거나(embed/iframe) 진입한 경우 → 팝업 없이 그 언어 그대로.
    if (lockLang || embed) return;
    // 이전에 고른 언어가 있으면 그대로 적용 + URL에도 반영(복붙 시 언어 유지), 다시 묻지 않는다.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (saved === "en" || saved === "ja" || saved === "ko") {
      // 클라이언트 전용(localStorage) 값이라 SSR에서 알 수 없어 마운트 후 동기화가 불가피.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLang(saved);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("lang", saved);
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* ignore */
      }
      return;
    }
    // 최초 진입(깨끗한 URL) → 브라우저 언어로 추천만 하고, 자동 전환 대신 선택 팝업.
    const nav = navigator.language?.toLowerCase() ?? "";
    const detected: Lang = nav.startsWith("ja") ? "ja" : nav.startsWith("ko") ? "ko" : "en";
    setSuggested(detected);
    setAskLang(true);
  }, [lockLang, embed]);

  // 언어 선택 팝업 열림 중 배경 스크롤 잠금
  useEffect(() => {
    if (!askLang) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [askLang]);

  // 시트 열림 중 배경 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

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

      {/* 최초 진입 언어 선택 팝업 (깨끗한 URL 진입 시 1회) */}
      {askLang ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Select your language"
        >
          <div className="w-full max-w-xs rounded-2xl bg-background p-6 shadow-2xl">
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
                <Languages className="size-5 text-foreground" />
              </div>
              <p className="text-base font-bold text-foreground">Select your language</p>
              <p className="mt-1 text-xs text-ink-3">言語を選択 · 언어 선택</p>
            </div>
            <div className="flex flex-col gap-2">
              {LANG_CHOICES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    selectLang(l.code);
                    setAskLang(false);
                  }}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                    suggested === l.code
                      ? "border-foreground bg-secondary/50"
                      : "border-hairline-2 hover:border-foreground/40",
                  )}
                >
                  <span className="text-sm font-semibold text-foreground">{l.native}</span>
                  <span className="text-xs text-ink-3">{l.en}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Hero */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{c.eyebrow}</p>
      <h1 className="text-[28px] font-bold leading-tight tracking-tight md:text-5xl">
        {c.title1}
        <br />
        {c.title2}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2 md:mt-5 md:max-w-2xl md:text-base">{c.sub}</p>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 md:max-w-2xl">
        <Globe className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="text-[13px] font-medium leading-relaxed text-foreground">{c.eligibility}</p>
      </div>

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

      {/* deetz Village 예고 — 주거 장벽(보증금)에 대한 답이라 pain point 바로 뒤에 둔다. */}
      <Link
        href={`/village?lang=${lang}`}
        className="mt-5 flex items-start gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 transition-colors hover:border-primary/50 md:p-5"
      >
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Home className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {c.villageBadge}
          </span>
          <p className="mt-1.5 text-sm font-bold text-foreground">{c.villageTitle}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            {splitSentences(c.villageBody).map((line, li) => (
              <span key={li} className="block">
                {line}
              </span>
            ))}
          </p>
          <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
            {c.villageCta}
            <ArrowRight className="size-3.5" />
          </span>
        </div>
      </Link>

      {/* Pillars */}
      <SectionTitle>{c.pillarsTitle}</SectionTitle>
      <div className="flex flex-col gap-2.5 md:grid md:grid-cols-2 md:gap-3">
        {c.pillars.map((p, i) => {
          const Icon = PILLAR_ICONS[i];
          return (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-hairline-2 bg-card p-4 md:p-5">
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
          <button
            key={d.handle}
            type="button"
            onClick={() => setSelected(d)}
            className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-hairline-2 bg-card text-left transition-transform hover:-translate-y-0.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={d.img}
              alt={d.name}
              loading="lazy"
              className="aspect-[3/4] w-full object-cover"
            />
            <div className="p-3">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-foreground">{d.name}</p>
                <FlagIcon nat={d.nat} />
              </div>
              <p className="text-[11px] text-ink-4">{d.handle}</p>
              {d.credits.map((cr, i) => (
                <p key={i} className="mt-1 text-[11px] leading-snug text-ink-3">
                  {cr}
                </p>
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* 로스터 상세 — 바텀시트(모바일) / 센터 모달(PC), 페이지 이탈 없음 */}
      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-5 pb-8 md:rounded-2xl md:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.img} alt={selected.name} className="size-12 rounded-full object-cover" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-base font-bold text-foreground">{selected.name}</p>
                    <FlagIcon nat={selected.nat} />
                    <span className="text-xs text-ink-3">{NAT_NAME[selected.nat][lang]}</span>
                  </div>
                  <p className="text-xs text-ink-4">{selected.handle}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-full border border-hairline-2 p-1.5 text-ink-3 hover:text-foreground"
                aria-label="close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.img}
              alt={selected.name}
              className="aspect-[4/5] w-full rounded-xl object-cover object-center"
            />

            <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-3">
              {c.sheetCredits}
            </p>
            <div className="flex flex-col gap-1.5">
              {selected.more.map((m, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-ink-2">
                  · {m}
                </p>
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              {selected.deetz ? (
                <a
                  href={selected.deetz}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {c.sheetProfile}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              <a
                href={selected.ig}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border border-hairline-2 px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary",
                  selected.deetz ? "flex-none" : "flex-1",
                )}
              >
                <InstaIcon className="size-4" />
                Instagram
              </a>
            </div>
          </div>
        </div>
      ) : null}

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
