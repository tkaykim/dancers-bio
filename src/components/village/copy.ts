// deetz Village(디츠 빌리지) 예고·수요조사 페이지 문구 정본.
// 랜딩(VillageLanding)과 폼(VillageWaitlistForm)이 같은 딕셔너리를 쓴다.
//
// ⚠️ 아직 오픈 전이다. 확정 표현("보장", "제공합니다") 대신 "예정", "계획"으로 쓴다.
//    2026-08-16부터 크라우드펀딩형 사전예약금(₩200,000)을 받는다 —
//    입주 시 첫 결제에서 전액 차감, 오픈 무산·입주 전 요청 시 전액 환불이 고지 정본이다.
//    무료 관심 등록(waitlist)은 그대로 유지한다.

export type Lang = "en" | "ja" | "ko";

/** 정식 명칭 — 페이지·메타·메일 어디서든 이 상수를 쓴다. */
export const VILLAGE_FULL_NAME = "deetz Village by GRIGO Entertainment";

/**
 * 한 문장이 끝나면 줄을 바꾼다(대표 지시, 전 BU 공통 규칙).
 * 마침표·물음표·느낌표 뒤에서 끊고, 일본어 `。`는 뒤에 공백이 없어도 끊는다.
 * ⚠ 카피에 `approx.` 같은 약어 마침표를 쓰면 그 자리에서도 끊기므로 약어를 쓰지 않는다.
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/([。！？])\s*/g, "$1\n")
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

/** 사용자가 고른 언어를 기억해 다음 방문에 다시 감지하지 않는다. */
export const LANG_STORAGE_KEY = "deetz_village_lang";

// ── 가격 정본 (KRW) ─────────────────────────────────────────────────────────
// A: 선납 150만(월세 3개월치) + 첫 달 월세 50만 = 첫 달 200만, 이후 월 50만
// B: 선납 180만(월세 3개월치) + 첫 달 월세 60만 = 첫 달 240만, 이후 월 60만
export type PlanKey = "a" | "b";

export const PLANS: {
  key: PlanKey;
  upfront: number;
  monthly: number;
  firstMonth: number;
}[] = [
  { key: "a", upfront: 1_500_000, monthly: 500_000, firstMonth: 2_000_000 },
  { key: "b", upfront: 1_800_000, monthly: 600_000, firstMonth: 2_400_000 },
];

/** 일반 원룸 비교용 기준값 (외부 안내에서 "보통 이 정도"로 쓰는 범위). */
export const MARKET = {
  depositMin: 10_000_000,
  depositMax: 20_000_000,
  rentMin: 500_000,
  rentMax: 700_000,
};

export type DeclineReason =
  | "price"
  | "roommate"
  | "already_housed"
  | "facility"
  | "location"
  | "timing"
  | "other";

export const DECLINE_REASONS: DeclineReason[] = [
  "price",
  "roommate",
  "already_housed",
  "facility",
  "location",
  "timing",
  "other",
];

export type RoomPreference = "single" | "double" | "quad" | "six" | "any";

export const ROOM_PREFERENCES: RoomPreference[] = ["single", "double", "quad", "six", "any"];

export type PreferredOption = "a" | "b" | "either" | "undecided";

/** 연락처 종류 — 해외 거주 댄서가 실제로 쓰는 채널 위주. */
export const CONTACT_TYPES = [
  "Email",
  "Instagram",
  "KakaoTalk",
  "WhatsApp",
  "Line",
  "Telegram",
  "WeChat",
  "Phone",
];

type QA = { q: string; a: string };

export type Copy = {
  // 헤더/히어로
  badge: string;
  title1: string;
  title2: string;
  sub: string;
  heroNote: string;
  cta: string;
  ctaSub: string;

  // 문제
  problemTitle: string;
  problemBody: string;
  marketLabel: string;
  marketDeposit: string;
  marketRent: string;
  marketNote: string;
  villageLabel: string;
  villageDeposit: string;
  villageDepositValue: string;
  villageRent: string;
  villageNote: string;

  // 구성
  spaceTitle: string;
  spaceBody: string;
  features: { title: string; body: string }[];

  roomsTitle: string;
  roomsBody: string;
  rooms: { title: string; body: string }[];

  photosTitle: string;
  photosBody: string;
  photoPlaceholder: string;
  photoCommonLabel: string;
  photoOpen: string;
  photoClose: string;
  photoPrev: string;
  photoNext: string;

  // 가격
  priceTitle: string;
  priceBody: string;
  planNames: Record<PlanKey, string>;
  planDescs: Record<PlanKey, string>;
  planUpfront: string;
  planFirstMonth: string;
  planMonthly: string;
  planFirstMonthNote: string;
  planIncluded: string;
  included: string[];
  optionalLabel: string;
  optional: string[];
  sixMonthLabel: string;
  sixMonthNote: string;
  priceCaution: string;

  // 진행
  stepsTitle: string;
  steps: { title: string; body: string }[];

  // FAQ
  faqTitle: string;
  faqs: QA[];

  // 폼
  formTitle: string;
  formBody: string;
  formQuestion: string;
  yes: string;
  no: string;
  yesHint: string;
  noHint: string;

  nameLabel: string;
  namePlaceholder: string;
  nationalityLabel: string;
  nationalitySearch: string;
  contactLabel: string;
  contactTypeLabel: string;
  contactPlaceholder: string;
  optionLabel: string;
  optionValues: Record<PreferredOption, string>;
  roomLabel: string;
  roomValues: Record<RoomPreference, string>;
  moveInLabel: string;
  messageLabel: string;
  messagePlaceholder: string;
  optionalTag: string;

  declineTitle: string;
  declineBody: string;
  declineValues: Record<DeclineReason, string>;
  declineDetailLabel: string;
  declineDetailPlaceholder: string;
  declineContactLabel: string;

  consent: string;
  submit: string;
  submitDecline: string;
  submitting: string;
  errRequired: string;
  errGeneric: string;

  doneTitle: string;
  doneBody: string;
  doneDeclineTitle: string;
  doneDeclineBody: string;
  backToProgram: string;

  // 사전예약 결제 (크라우드펀딩형 베타)
  depositTitle: string;
  depositBody: string;
  depositTerms: string[];
  depositCta: string;
  depositSkip: string;
  depositAmountLabel: string;
  depositErr: string;

  // 마무리
  disclaimer: string;
};

export const T: Record<Lang, Copy> = {
  en: {
    badge: "Coming soon · Checking demand",
    title1: "No key money.",
    title2: "Just move in and dance.",
    sub: "deetz Village is a dancer house we are preparing in Seoul, for dancers coming from abroad. Renting in Korea normally means a 10–20 million KRW deposit before you even pay rent. We are building a place where you can start without it.",
    heroNote:
      "This page is a pre-announcement. Registering your interest is free, and reserving a room with a deposit is optional.",
    cta: "Join the waitlist",
    ctaSub: "Takes about 1 minute. Free, no commitment.",

    problemTitle: "Why we are building this",
    problemBody:
      "Almost every foreign dancer we work with hits the same wall: not the rent, but the deposit. Here is the difference.",
    marketLabel: "A normal studio flat in Seoul",
    marketDeposit: "Deposit",
    marketRent: "Monthly rent",
    marketNote: "You also handle the contract, furniture, and utilities in Korean, by yourself.",
    villageLabel: "deetz Village",
    villageDeposit: "Deposit",
    villageDepositValue: "None",
    villageRent: "Monthly rent",
    villageNote:
      "Instead of a deposit you prepay about three months of rent up front. Furniture, bed, and living basics are already there.",

    spaceTitle: "What the house is like",
    spaceBody:
      "A dormitory-style house, not a hotel. Private rooms to sleep, shared space to practice, cook, and hang out with other dancers.",
    features: [
      { title: "Practice mirrors in the shared space", body: "A lobby / common area with mirrors, so you can move and review your dance without booking a studio." },
      { title: "Bed and furniture ready", body: "Super single beds or bunk beds are already set up. Bring your suitcase, nothing else." },
      { title: "Food basics always stocked", body: "Instant rice and ramen are kept in the house, so your first week is never a problem." },
      { title: "Laundry & cleaning on request", body: "Laundry and cleaning service can be arranged when you need it." },
      { title: "Meal-box delivery on request", body: "A prepared meal-box delivery can be arranged for dancers who want to keep their diet on track." },
      { title: "Dancers only", body: "Everyone in the house is here for the same reason — training, auditions, and work in the Korean dance scene." },
    ],

    roomsTitle: "Room types",
    roomsBody: "Room mix is still being finalized. Tell us what you would want and it helps us decide.",
    rooms: [
      { title: "Single", body: "A room to yourself. Limited number." },
      { title: "2 people", body: "Share with one other dancer." },
      { title: "4 people", body: "Dormitory with bunk beds." },
      { title: "6 people", body: "Largest dormitory room." },
    ],

    photosTitle: "Photos",
    photosBody: "Real photos of the building and rooms are being prepared and will be added here.",
    photoPlaceholder: "Photo coming soon",
    photoCommonLabel: "Shared space",
    photoOpen: "Tap a photo to view it larger",
    photoClose: "Close",
    photoPrev: "Previous photo",
    photoNext: "Next photo",

    priceTitle: "Planned pricing",
    priceBody:
      "Two buildings are under review, both in Gangseo-gu, Seoul. Prices below are the planned rates — final numbers are confirmed when we open.",
    planNames: { a: "Option A", b: "Option B" },
    planDescs: {
      a: "Gangseo-gu, 2nd floor",
      b: "Gangseo-gu, 4th floor (with elevator)",
    },
    planUpfront: "Prepaid (about 3 months of rent)",
    planFirstMonth: "First payment",
    planMonthly: "From the second month",
    planFirstMonthNote: "Prepaid amount + first month's rent",
    planIncluded: "Included in the monthly rent",
    included: [
      "Bed and furniture",
      "Instant rice and ramen stocked in the house",
      "Shared practice space with mirrors",
      "Utilities and shared living supplies",
    ],
    optionalLabel: "On request",
    optional: ["Laundry service", "Cleaning service", "Meal-box delivery"],
    sixMonthLabel: "6 months, total",
    sixMonthNote: "First payment + 5 months of rent. No deposit locked up.",
    priceCaution:
      "Planned rates for demand checking. The exact contract terms, including how the prepaid amount is settled, are explained in writing before you sign anything.",

    stepsTitle: "How this moves forward",
    steps: [
      { title: "1. Demand check (now)", body: "You join the waitlist. No payment, no commitment." },
      { title: "2. We confirm the building", body: "If enough dancers need it, we lock in the building and finalize the rooms and prices." },
      { title: "3. We contact you first", body: "Waitlist members get the photos, the exact address, and the move-in dates before anyone else." },
      { title: "4. Contract and payment", body: "Only then — after you have seen the real terms — do we talk about payment." },
    ],

    faqTitle: "Questions",
    faqs: [
      { q: "Do I have to be in the deetz visa program?", a: "No. The Village is open to dancers working with deetz and GRIGO, and we will announce the exact priority order when we open. Joining the waitlist does not require any other program." },
      { q: "Is the prepaid amount a deposit?", a: "It works as prepaid rent, not as a Korean-style key money deposit. How it is settled at the end is written into the contract, and we explain it before you sign." },
      { q: "When does it open?", a: "Not fixed yet. That is exactly what this page is for — we open once we know the demand is real." },
      { q: "Can I choose who I share a room with?", a: "Tell us in the form. We will try to match room requests where possible, but we cannot promise it before the rooms are set." },
      { q: "What if I only need a few months?", a: "Tell us your planned period in the form. Minimum stay is one of the things we are deciding based on these answers." },
      { q: "Where exactly is it?", a: "Gangseo-gu, Seoul. The exact address is shared with waitlist members once the building is confirmed." },
    ],

    formTitle: "Tell us where you stand",
    formBody:
      "Both answers help us. If this is not for you, the reason is just as useful as a signup — it tells us what to change.",
    formQuestion: "Would you want to live in deetz Village?",
    yes: "Yes, put me on the waitlist",
    no: "No, not for me",
    yesHint: "We will contact you first when it opens.",
    noHint: "Just tell us why — 10 seconds.",

    nameLabel: "Name",
    namePlaceholder: "Your name",
    nationalityLabel: "Nationality",
    nationalitySearch: "Search country (English / 한글)",
    contactLabel: "Contact",
    contactTypeLabel: "Channel",
    contactPlaceholder: "@handle, email, or number",
    optionLabel: "Which option interests you?",
    optionValues: {
      a: "Option A — 500,000 KRW / month",
      b: "Option B — 600,000 KRW / month",
      either: "Either is fine",
      undecided: "Not decided yet",
    },
    roomLabel: "Room type you want",
    roomValues: {
      single: "Single",
      double: "2 people",
      quad: "4 people",
      six: "6 people",
      any: "Any is fine",
    },
    moveInLabel: "When would you want to move in?",
    messageLabel: "Anything you want us to know",
    messagePlaceholder: "Period of stay, room requests, questions…",
    optionalTag: "optional",

    declineTitle: "What is the reason?",
    declineBody: "Choose everything that applies.",
    declineValues: {
      price: "Too expensive",
      roommate: "I don't want to share with others",
      already_housed: "I already have a place to stay",
      facility: "The facilities don't look good enough",
      location: "The location doesn't work for me",
      timing: "The timing doesn't work for me",
      other: "Other",
    },
    declineDetailLabel: "Tell us more",
    declineDetailPlaceholder: "One line is enough.",
    declineContactLabel: "Name or contact, if you don't mind",

    consent: "I agree to deetz keeping this information to contact me about deetz Village.",
    submit: "Join the waitlist",
    submitDecline: "Send my answer",
    submitting: "Sending…",
    errRequired: "Please fill in your name, nationality, and contact.",
    errGeneric: "Something went wrong. Please try again.",

    doneTitle: "You're on the waitlist",
    doneBody:
      "We will contact you with photos, the exact address, and move-in dates before we open it to anyone else. Registering your interest alone does not charge you anything.",
    doneDeclineTitle: "Thank you — that helps",
    doneDeclineBody:
      "Your answer goes straight into how we design this. If it changes later, you can always come back to this page.",
    backToProgram: "See the deetz Korea program",

    depositTitle: "Reserve your place now",
    depositBody:
      "We are confirming the building. Reserving now secures a room and shows us the demand is real.",
    depositTerms: [
      "Fully deducted from your first payment when you move in.",
      "Full refund if we do not reach enough residents, or the opening does not happen.",
      "Full refund for any reason at any time before move-in begins.",
    ],
    depositCta: "Reserve with a deposit",
    depositSkip: "Or register your interest for free above — no payment needed.",
    depositAmountLabel: "Pre-registration deposit",
    depositErr: "We could not open the payment page. Please try again.",
    disclaimer:
      "deetz Village is in preparation and is not open yet. Buildings, room composition, prices, and the opening date can change. Registering your interest is free and does not reserve a room. A pre-registration deposit reserves a room and is fully deducted from your first payment, or fully refunded if the opening does not happen.",
  },

  ja: {
    badge: "準備中 · 需要調査",
    title1: "保証金なしで、",
    title2: "ソウルでの生活を始める。",
    sub: "deetz Villageは、海外から来るダンサーのためにソウルで準備しているダンサーハウスです。韓国で部屋を借りるには、家賃とは別に1,000万〜2,000万ウォンの保証金が必要になります。それがなくても始められる場所をつくります。",
    heroNote:
      "このページは事前告知です。関心登録は無料で、事前予約金でのお部屋確保は任意です。",
    cta: "ウェイトリストに登録",
    ctaSub: "約1分。無料で、義務もありません。",

    problemTitle: "なぜつくるのか",
    problemBody:
      "一緒に活動する海外ダンサーのほとんどが、同じ壁にぶつかります。家賃ではなく、保証金です。違いはこうです。",
    marketLabel: "ソウルの一般的なワンルーム",
    marketDeposit: "保証金",
    marketRent: "家賃（月）",
    marketNote: "契約・家具・公共料金の手続きも、すべて韓国語で自分で行うことになります。",
    villageLabel: "deetz Village",
    villageDeposit: "保証金",
    villageDepositValue: "なし",
    villageRent: "家賃（月）",
    villageNote:
      "保証金の代わりに、家賃およそ3か月分を先に納めます。家具・ベッド・生活の基本はすでに揃っています。",

    spaceTitle: "どんな家か",
    spaceBody:
      "ホテルではなく、ドミトリー形式の家です。寝るための部屋があり、練習・食事・交流のための共用スペースがあります。",
    features: [
      { title: "共用スペースに練習用の鏡", body: "鏡のあるロビー・共用空間。スタジオを予約しなくても、動いて確認できます。" },
      { title: "ベッド・家具は設置済み", body: "スーパーシングルまたは2段ベッドを設置予定。スーツケースひとつで入居できます。" },
      { title: "ごはん・ラーメンを常備", body: "レトルトごはんとラーメンを家に常備。最初の1週間で困ることはありません。" },
      { title: "洗濯・清掃は申請制", body: "必要なときに洗濯・清掃サービスを利用できるようにします。" },
      { title: "食事デリバリーも申請制", body: "食事管理をしたいダンサー向けに、食事デリバリーを利用できるようにします。" },
      { title: "ダンサーだけの家", body: "住んでいる全員が同じ目的です。トレーニング、オーディション、韓国での活動。" },
    ],

    roomsTitle: "部屋タイプ",
    roomsBody: "部屋の構成はまだ確定していません。希望を教えていただけると、そのまま設計の判断材料になります。",
    rooms: [
      { title: "1人部屋", body: "自分だけの部屋。数に限りがあります。" },
      { title: "2人部屋", body: "ダンサー1人とシェア。" },
      { title: "4人部屋", body: "2段ベッドのドミトリー。" },
      { title: "6人部屋", body: "いちばん大きいドミトリー。" },
    ],

    photosTitle: "写真",
    photosBody: "建物と部屋の実際の写真は準備中で、ここに追加されます。",
    photoPlaceholder: "写真は準備中です",
    photoCommonLabel: "共用スペース",
    photoOpen: "写真をタップすると大きく見られます",
    photoClose: "閉じる",
    photoPrev: "前の写真",
    photoNext: "次の写真",

    priceTitle: "予定料金",
    priceBody:
      "ソウル江西区（カンソグ）の2つの物件を検討中です。以下は予定料金で、オープン時に最終確定します。",
    planNames: { a: "オプションA", b: "オプションB" },
    planDescs: {
      a: "江西区・2階",
      b: "江西区・4階（エレベーターあり）",
    },
    planUpfront: "先納金（家賃およそ3か月分）",
    planFirstMonth: "初回のお支払い",
    planMonthly: "2か月目から",
    planFirstMonthNote: "先納金 + 初月の家賃",
    planIncluded: "家賃に含まれるもの",
    included: [
      "ベッド・家具",
      "常備のレトルトごはん・ラーメン",
      "鏡のある共用練習スペース",
      "公共料金・共用の生活用品",
    ],
    optionalLabel: "申請制",
    optional: ["洗濯サービス", "清掃サービス", "食事デリバリー"],
    sixMonthLabel: "6か月の合計",
    sixMonthNote: "初回のお支払い + 5か月分の家賃。保証金として拘束されるお金はありません。",
    priceCaution:
      "需要調査のための予定料金です。先納金の精算方法を含む契約条件は、署名の前に書面でご説明します。",

    stepsTitle: "これからの流れ",
    steps: [
      { title: "1. 需要調査（現在）", body: "ウェイトリストに登録するだけです。支払いも義務もありません。" },
      { title: "2. 物件の確定", body: "必要とするダンサーが集まれば物件を確定し、部屋と料金を最終決定します。" },
      { title: "3. 先にご連絡", body: "写真・正確な住所・入居可能日を、ウェイトリストの方に最初にお知らせします。" },
      { title: "4. 契約とお支払い", body: "実際の条件をご確認いただいたうえで、はじめてお支払いの話をします。" },
    ],

    faqTitle: "よくある質問",
    faqs: [
      { q: "deetzのビザプログラムに参加していないと入れませんか？", a: "いいえ。deetzやGRIGOと活動するダンサーが対象で、優先順位はオープン時に明示します。ウェイトリスト登録に他のプログラムへの参加は必要ありません。" },
      { q: "先納金は保証金（チョンセ・保証金）ですか？", a: "韓国式の保証金ではなく、家賃の前払いとして扱います。最終的な精算方法は契約書に明記し、署名の前にご説明します。" },
      { q: "いつオープンしますか？", a: "まだ確定していません。このページはまさにそのためのもので、需要が確認できた時点でオープンします。" },
      { q: "同室の相手は選べますか？", a: "フォームに書いてください。可能な範囲で希望を反映しますが、部屋が確定する前にお約束はできません。" },
      { q: "数か月だけの利用でもいいですか？", a: "希望期間をフォームに書いてください。最短滞在期間も、この回答をもとに決めます。" },
      { q: "場所はどこですか？", a: "ソウル江西区です。正確な住所は物件確定後、ウェイトリストの方にお知らせします。" },
    ],

    formTitle: "今のお気持ちを教えてください",
    formBody:
      "どちらの回答も役に立ちます。合わないという回答も、何を変えるべきかを教えてくれる大切な情報です。",
    formQuestion: "deetz Villageに住んでみたいですか？",
    yes: "はい、ウェイトリストに登録します",
    no: "いいえ、今回は見送ります",
    yesHint: "オープン時に最初にご連絡します。",
    noHint: "理由だけ教えてください（10秒）。",

    nameLabel: "お名前",
    namePlaceholder: "お名前",
    nationalityLabel: "国籍",
    nationalitySearch: "国名を検索（英語／한글）",
    contactLabel: "連絡先",
    contactTypeLabel: "連絡手段",
    contactPlaceholder: "@ハンドル・メール・番号",
    optionLabel: "気になるオプションは？",
    optionValues: {
      a: "オプションA — 月50万ウォン",
      b: "オプションB — 月60万ウォン",
      either: "どちらでもよい",
      undecided: "まだ決めていない",
    },
    roomLabel: "希望する部屋タイプ",
    roomValues: {
      single: "1人部屋",
      double: "2人部屋",
      quad: "4人部屋",
      six: "6人部屋",
      any: "どれでもよい",
    },
    moveInLabel: "入居希望時期",
    messageLabel: "伝えておきたいこと",
    messagePlaceholder: "滞在予定期間、部屋の希望、質問など…",
    optionalTag: "任意",

    declineTitle: "理由を教えてください",
    declineBody: "当てはまるものをすべて選んでください。",
    declineValues: {
      price: "費用が高い",
      roommate: "他の人と一緒に住むのは避けたい",
      already_housed: "すでに住む場所がある",
      facility: "設備が物足りない",
      location: "場所が合わない",
      timing: "時期が合わない",
      other: "その他",
    },
    declineDetailLabel: "もう少し詳しく",
    declineDetailPlaceholder: "一行で十分です。",
    declineContactLabel: "差し支えなければ、お名前か連絡先",

    consent: "deetz Villageのご案内のために、この情報をdeetzが保管することに同意します。",
    submit: "ウェイトリストに登録",
    submitDecline: "回答を送る",
    submitting: "送信中…",
    errRequired: "お名前・国籍・連絡先をご入力ください。",
    errGeneric: "エラーが発生しました。もう一度お試しください。",

    doneTitle: "ウェイトリストに登録しました",
    doneBody:
      "写真・正確な住所・入居可能日を、公開前に最初にご連絡します。関心登録のみであれば、お支払いは発生しません。",
    doneDeclineTitle: "ありがとうございます",
    doneDeclineBody:
      "いただいた回答は、そのまま設計の見直しに使わせていただきます。お気持ちが変わったら、いつでもこのページに戻ってきてください。",
    backToProgram: "deetzの韓国プログラムを見る",

    depositTitle: "今すぐ入居枠を確保する",
    depositBody:
      "現在、物件を確定中です。今ご予約いただくと入居枠が確保され、私たちにとっては実際の需要の確認になります。",
    depositTerms: [
      "ご入居時に初回のお支払い金額から全額差し引かれます。",
      "入居者が定員に満たない場合、またはオープンが実現しない場合は全額返金します。",
      "入居開始前であれば、理由を問わずいつでも全額返金します。",
    ],
    depositCta: "事前予約金を支払って確保する",
    depositSkip: "まずは上のフォームから無料で関心登録だけすることもできます。",
    depositAmountLabel: "事前予約金",
    depositErr: "決済ページを開けませんでした。もう一度お試しください。",
    disclaimer:
      "deetz Villageは準備中で、まだオープンしていません。物件・部屋構成・料金・オープン時期は変更される可能性があります。関心登録は無料で、登録によって部屋が確保されるものではありません。事前予約金をお支払いいただくと入居枠が確保され、ご入居時に初回のお支払いから全額差し引かれます。オープンが実現しない場合は全額返金いたします。",
  },

  ko: {
    badge: "오픈 준비 중 · 수요조사",
    title1: "보증금 없이,",
    title2: "서울에서 시작하는 법.",
    sub: "deetz Village는 해외에서 오는 댄서들을 위해 서울에 준비하고 있는 댄서 하우스입니다. 한국에서 방을 구하려면 월세와 별개로 보증금 1,000만~2,000만원이 필요합니다. 그 장벽 없이 시작할 수 있는 공간을 만듭니다.",
    heroNote:
      "이 페이지는 사전 예고입니다. 관심 등록은 무료이고, 사전예약금으로 자리를 확보하는 것은 선택입니다.",
    cta: "웨이팅 리스트 등록",
    ctaSub: "1분이면 끝나요. 무료이고 의무도 없습니다.",

    problemTitle: "왜 만드나요",
    problemBody:
      "함께 일하는 외국 댄서 대부분이 같은 벽에 부딪힙니다. 월세가 아니라 보증금입니다. 차이는 이렇습니다.",
    marketLabel: "서울의 일반 원룸",
    marketDeposit: "보증금",
    marketRent: "월세",
    marketNote: "계약, 가구, 공과금까지 전부 한국어로 직접 해결해야 합니다.",
    villageLabel: "deetz Village",
    villageDeposit: "보증금",
    villageDepositValue: "없음",
    villageRent: "월세",
    villageNote:
      "보증금 대신 월세 3개월치 정도를 미리 냅니다. 가구, 침대, 기본 생활용품은 이미 갖춰져 있습니다.",

    spaceTitle: "어떤 공간인가요",
    spaceBody:
      "호텔이 아니라 도미토리 형태의 집입니다. 잠은 각자의 방에서 자고, 연습·식사·교류는 공용 공간에서 합니다.",
    features: [
      { title: "공용 공간에 연습용 거울", body: "거울이 있는 로비·공용 공간. 스튜디오를 예약하지 않아도 몸을 풀고 확인할 수 있습니다." },
      { title: "침대·가구 세팅 완료", body: "슈퍼싱글 또는 이층침대가 이미 설치될 예정입니다. 캐리어 하나만 들고 오면 됩니다." },
      { title: "햇반·라면 상시 비치", body: "즉석밥과 라면을 집에 상시 비치합니다. 도착 첫 주에 끼니로 곤란할 일이 없습니다." },
      { title: "빨래·청소 신청 가능", body: "필요할 때 빨래와 청소 서비스를 이용할 수 있게 준비합니다." },
      { title: "식단 도시락 배송 신청 가능", body: "식단 관리를 하는 댄서를 위해 도시락 배송을 이용할 수 있게 준비합니다." },
      { title: "댄서만 사는 집", body: "사는 사람 전부가 같은 이유로 모입니다. 트레이닝, 오디션, 한국에서의 활동." },
    ],

    roomsTitle: "방 구성",
    roomsBody: "방 구성은 아직 확정 전입니다. 어떤 방을 원하는지 알려주시면 그대로 설계 판단에 반영됩니다.",
    rooms: [
      { title: "1인실", body: "혼자 쓰는 방. 수량이 제한됩니다." },
      { title: "2인실", body: "댄서 한 명과 함께 사용." },
      { title: "4인실", body: "이층침대 도미토리." },
      { title: "6인실", body: "가장 큰 도미토리 방." },
    ],

    photosTitle: "사진",
    photosBody: "건물과 방의 실제 사진은 준비 중이며, 확정되는 대로 이곳에 올라갑니다.",
    photoPlaceholder: "사진 준비 중",
    photoCommonLabel: "공용 공간",
    photoOpen: "사진을 누르면 크게 볼 수 있어요",
    photoClose: "닫기",
    photoPrev: "이전 사진",
    photoNext: "다음 사진",

    priceTitle: "예정 요금",
    priceBody:
      "서울 강서구의 두 건물을 검토 중입니다. 아래는 예정 요금이며, 오픈 시점에 최종 확정합니다.",
    planNames: { a: "옵션 A", b: "옵션 B" },
    planDescs: {
      a: "강서구 · 2층",
      b: "강서구 · 4층 (엘리베이터 있음)",
    },
    planUpfront: "선납금 (월세 약 3개월치)",
    planFirstMonth: "첫 결제",
    planMonthly: "둘째 달부터",
    planFirstMonthNote: "선납금 + 첫 달 월세",
    planIncluded: "월세에 포함",
    included: [
      "침대·가구",
      "햇반·라면 상시 비치",
      "거울 있는 공용 연습 공간",
      "공과금·공용 생활용품",
    ],
    optionalLabel: "신청 시 이용",
    optional: ["빨래 서비스", "청소 서비스", "식단 도시락 배송"],
    sixMonthLabel: "6개월 총액",
    sixMonthNote: "첫 결제 + 5개월 월세. 보증금으로 묶이는 목돈이 없습니다.",
    priceCaution:
      "수요조사를 위한 예정 요금입니다. 선납금 정산 방식을 포함한 계약 조건은 서명 전에 서면으로 안내합니다.",

    stepsTitle: "앞으로의 진행",
    steps: [
      { title: "1. 수요조사 (지금)", body: "웨이팅 리스트에 등록만 하시면 됩니다. 결제도 의무도 없습니다." },
      { title: "2. 건물 확정", body: "필요로 하는 댄서가 모이면 건물을 확정하고 방 구성과 요금을 최종 결정합니다." },
      { title: "3. 먼저 연락", body: "사진, 정확한 주소, 입주 가능일을 웨이팅 리스트 등록자에게 가장 먼저 안내합니다." },
      { title: "4. 계약과 결제", body: "실제 조건을 확인하신 뒤에야 결제 이야기를 시작합니다." },
    ],

    faqTitle: "자주 묻는 질문",
    faqs: [
      { q: "deetz 비자 프로그램에 참여해야만 들어갈 수 있나요?", a: "아닙니다. deetz·GRIGO와 함께 활동하는 댄서를 대상으로 하며, 우선순위는 오픈 시점에 명확히 안내합니다. 웨이팅 리스트 등록에는 다른 프로그램 참여가 필요하지 않습니다." },
      { q: "선납금은 보증금인가요?", a: "한국식 보증금이 아니라 월세를 미리 내는 개념으로 운영할 계획입니다. 최종 정산 방식은 계약서에 명시하고, 서명 전에 설명드립니다." },
      { q: "언제 오픈하나요?", a: "아직 확정되지 않았습니다. 이 페이지가 바로 그것을 정하기 위한 것이고, 수요가 확인되면 오픈합니다." },
      { q: "같은 방 쓸 사람을 고를 수 있나요?", a: "폼에 적어주세요. 가능한 범위에서 반영하려고 하지만, 방이 확정되기 전에는 약속드릴 수 없습니다." },
      { q: "몇 달만 살아도 되나요?", a: "희망 기간을 폼에 적어주세요. 최소 거주 기간도 이 응답들을 보고 정합니다." },
      { q: "위치가 정확히 어디인가요?", a: "서울 강서구입니다. 정확한 주소는 건물 확정 후 웨이팅 리스트 등록자에게 안내합니다." },
    ],

    formTitle: "지금 생각을 알려주세요",
    formBody:
      "어느 쪽이든 도움이 됩니다. 안 하겠다는 답도 무엇을 바꿔야 하는지 알려주는 중요한 정보입니다.",
    formQuestion: "deetz Village에서 살아보고 싶으신가요?",
    yes: "네, 웨이팅 리스트에 등록할게요",
    no: "아니요, 저는 안 할 것 같아요",
    yesHint: "오픈하면 가장 먼저 연락드립니다.",
    noHint: "이유만 알려주세요. 10초면 됩니다.",

    nameLabel: "이름",
    namePlaceholder: "이름",
    nationalityLabel: "국적",
    nationalitySearch: "국가 검색 (영문/한글)",
    contactLabel: "연락처",
    contactTypeLabel: "연락 수단",
    contactPlaceholder: "@아이디, 이메일 또는 번호",
    optionLabel: "어떤 옵션이 마음에 드시나요?",
    optionValues: {
      a: "옵션 A — 월 50만원",
      b: "옵션 B — 월 60만원",
      either: "둘 다 괜찮아요",
      undecided: "아직 모르겠어요",
    },
    roomLabel: "원하는 방 형태",
    roomValues: {
      single: "1인실",
      double: "2인실",
      quad: "4인실",
      six: "6인실",
      any: "상관없어요",
    },
    moveInLabel: "언제쯤 입주하고 싶으세요?",
    messageLabel: "더 알려주실 내용",
    messagePlaceholder: "거주 예정 기간, 방 관련 요청, 질문 등…",
    optionalTag: "선택",

    declineTitle: "이유가 무엇인가요?",
    declineBody: "해당되는 것을 모두 골라주세요.",
    declineValues: {
      price: "비용이 비싸요",
      roommate: "다른 사람과 같이 사는 게 부담돼요",
      already_housed: "이미 지낼 곳이 있어요",
      facility: "시설이 아쉬워요",
      location: "위치가 안 맞아요",
      timing: "시기가 안 맞아요",
      other: "기타",
    },
    declineDetailLabel: "조금 더 자세히",
    declineDetailPlaceholder: "한 줄이면 충분해요.",
    declineContactLabel: "괜찮으시면 이름이나 연락처",

    consent: "deetz Village 안내를 위해 이 정보를 deetz가 보관하는 데 동의합니다.",
    submit: "웨이팅 리스트 등록",
    submitDecline: "답변 보내기",
    submitting: "보내는 중…",
    errRequired: "이름, 국적, 연락처를 입력해 주세요.",
    errGeneric: "오류가 발생했습니다. 다시 시도해 주세요.",

    doneTitle: "웨이팅 리스트에 등록됐어요",
    doneBody:
      "사진, 정확한 주소, 입주 가능일을 공개 전에 가장 먼저 연락드립니다. 관심 등록만으로는 결제되는 금액이 없습니다.",
    doneDeclineTitle: "답변 감사합니다",
    doneDeclineBody:
      "주신 답변은 그대로 기획을 다시 보는 데 쓰입니다. 생각이 바뀌시면 언제든 이 페이지로 다시 오세요.",
    backToProgram: "deetz 한국 활동 프로그램 보기",

    depositTitle: "지금 입주 자리 확보하기",
    depositBody:
      "지금 건물을 확정하는 중입니다. 지금 예약하시면 자리가 확보되고, 저희에게는 실제 수요를 확인하는 근거가 됩니다.",
    depositTerms: [
      "입주하시면 첫 결제 금액에서 전액 차감됩니다.",
      "정원이 차지 않거나 오픈이 무산되면 전액 환불해 드립니다.",
      "입주 시작 전까지는 사유를 불문하고 언제든 전액 환불해 드립니다.",
    ],
    depositCta: "사전예약금 결제하고 확보하기",
    depositSkip: "먼저 위에서 무료로 관심 등록만 하셔도 됩니다.",
    depositAmountLabel: "사전예약금",
    depositErr: "결제 페이지를 열지 못했습니다. 다시 시도해 주세요.",
    disclaimer:
      "deetz Village는 준비 중이며 아직 오픈하지 않았습니다. 건물, 방 구성, 요금, 오픈 시기는 변경될 수 있습니다. 관심 등록은 무료이며 등록만으로 방이 확보되지 않습니다. 사전예약금을 결제하시면 입주 자리가 확보되고, 입주 시 첫 결제 금액에서 전액 차감되며, 오픈이 무산되면 전액 환불해 드립니다.",
  },
};
