// deetz Workshop(수요 기반 안무가 초청) 페이지 문구 정본 — ko/en/ja 3개국어.
// 랜딩·제안 폼·찜 버튼이 같은 딕셔너리를 쓴다. (상세/결제 페이지는 한국어 — 결제·규정은 국내 운영 기준)
//
// 톤 (대표 지시 2026-08-16):
//   "deetz는 주기적으로 워크샵을 운영합니다. 어떤 안무가가 왔으면 좋겠는지 알려주세요.
//    여러분의 수요를 확인해 다음 워크샵 라인업 구상에 참고합니다."
// 해외 거주 댄서의 수요도 받는다 — 한국 댄서를 해외로 보내는 창구로 확장될 수 있다.
//
// ⚠️ 브랜드 표기: "deetz"는 항상 소문자 — uppercase 클래스를 브랜드 텍스트에 걸지 않는다.
// ⚠️ 확정 전 표현 주의: 섭외는 "예정·추진"으로 쓰고 "확정"은 confirmed 상태에서만 쓴다.
// ⚠️ 문구를 고치면 lib/workshops/shared.ts 의 WORKSHOP_POLICY_VERSION 도 올린다.

import type { DemandBand } from "@/lib/workshops/shared";

export type Lang = "ko" | "en" | "ja" | "th";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
  { code: "th", label: "ไทย" },
];

/** 폼 거주지 기본값 — 언어가 곧 1차 타깃 지역이다 (th=방콕 캠페인). ko/en 은 기존 결정(KR/서울) 유지. */
export const DEFAULT_COUNTRY_BY_LANG: Record<Lang, string> = {
  ko: "KR",
  en: "KR",
  ja: "JP",
  th: "TH",
};

/** 사용자가 고른 언어를 기억해 다음 방문에 다시 감지하지 않는다. */
export const LANG_STORAGE_KEY = "deetz_ws_lang";

/** 정식 명칭 — 페이지·메타·메일 어디서든 이 상수를 쓴다. */
export const WORKSHOP_FULL_NAME = "deetz Workshop";

/**
 * 한 문장이 끝나면 줄을 바꾼다(대표 지시, 전 BU 공통 규칙).
 * 일본어 `。`는 뒤 공백 없이도 끊는다. 약어 마침표(approx. 등)를 카피에 쓰지 않는다.
 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/([。！？])\s*/g, "$1\n")
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Step = { title: string; body: string };
type Faq = { q: string; a: string };

export type WorkshopCopy = {
  badge: string;
  title1: string;
  title2: string;
  sub: string;
  heroNote: string;
  ctaNominate: string;
  ctaBrowse: string;
  loginLabel: string;

  eventsTitle: string;
  eventsSub: string;
  eventsView: string;
  eventsClasses: (n: number) => string;

  recruitingTitle: string;
  recruitingBadge: string;
  deadlineToday: string;
  closedLabel: string;
  reservedProgress: (reserved: number, min: number) => string;
  remainingToMin: (n: number) => string;
  minReached: string;
  depositLabel: (amount: string) => string;

  /**
   * 크라우드펀딩식 단일 그리드 — 유저 요청(suggested·실수요 1+)과 운영 발행(published+)을
   * 한 리스트로 합치고 단계는 뱃지로만 구분한다. 카드 클릭 = deetz 프로필 모달(인스타 이탈 아님).
   */
  requestedTitle: string;
  requestedSub: string;
  requestedEmpty: string;
  /** published 이상 = deetz 가 검토·섭외 착수한 카드 표시. */
  officialBadge: string;
  confirmedBadge: string;
  completedBadge: string;
  /** 수요 표시는 정확 수 대신 구간만 (D1 — 경쟁 노출 차단 + 초기 카드 썰렁함 방지). */
  demandBand: Record<DemandBand, string>;

  /** 콜드스타트 탐색 보조 — 검색창 아래 추천 검색 칩. */
  chipsTitle: string;
  chips: Array<{ label: string; q: string }>;

  /** 프로필 모달 */
  modalInsta: string;
  modalDeetzProfile: string;
  modalGoDetail: string;

  /** 수요 0 → 1 첫 요청 축하 (콜드스타트 동기 부여) */
  firstVoteNote: string;

  searchPh: string;
  searchSearching: string;
  searchEmpty: string;
  searchManualCta: string;
  searchStatusListed: string;
  searchStatusSuggested: string;
  /** deetz 댄서 풀에서 온 검색 결과 뱃지 (한국 안무가 — 태국 역방향 수요조사의 핵심 공급) */
  searchStatusDancer: string;
  shareCta: string;
  shareText: string;
  shareCopied: string;

  voteCta: string;
  votedLabel: string;
  voteSubmitting: string;
  voteContactPrompt: string;
  voteEmailPh: string;
  voteInstaPh: string;
  voteClose: string;
  voteSubmit: string;
  voteNeedContact: string;

  howTitle: string;
  howSteps: Step[];

  nominateTitle: string;
  nominateSub: string;
  fArtistName: string;
  fArtistNamePh: string;
  fInstagram: string;
  fInstagramPh: string;
  fComment: string;
  fCommentPh: string;
  fCountry: string;
  fCity: string;
  fCityDefault: string;
  fLocationNote: string;
  fMyEmail: string;
  fMyEmailPh: string;
  fMyInsta: string;
  fMyInstaPh: string;
  fContactNote: string;
  fSubmit: string;
  fSubmitting: string;
  fFreeNote: string;
  errNeedNameInsta: string;
  errNeedContact: string;
  errGeneric: string;
  doneTitle: string;
  doneAlreadyTitle: string;
  doneBody: string;
  doneAgain: string;
  requiredMark: string;
  optionalMark: string;

  policyTitle: string;
  policyRows: string[];
  faqTitle: string;
  faqs: Faq[];
  disclaimer: string;
};

export const T: Record<Lang, WorkshopCopy> = {
  ko: {
    badge: "수요 기반 초청 워크샵",
    title1: "다음 워크샵,",
    title2: "어떤 안무가와 하고 싶나요?",
    sub: "deetz는 주기적으로 워크샵을 운영합니다. 배우고 싶은 안무가, 한국에 꼭 왔으면 하는 안무가가 있다면 알려주세요. 여러분의 수요를 확인해 다음 워크샵 라인업을 구상하는 데 참고합니다.",
    heroNote: "제안과 수요 등록은 무료입니다. 예약금은 모집이 열린 워크샵에만 받고, 최소 인원 미달로 열리지 않으면 전액 환불됩니다.",
    ctaNominate: "안무가 제안하기",
    ctaBrowse: "요청 현황 보기",
    loginLabel: "로그인",

    eventsTitle: "열린 워크샵",
    eventsSub: "일정과 강사가 확정된 워크샵입니다. 클래스를 골라 바로 신청할 수 있어요.",
    eventsView: "시간표 보기 · 신청",
    eventsClasses: (n) => `클래스 ${n}개`,

    recruitingTitle: "지금 모집 중",
    recruitingBadge: "모집 중",
    deadlineToday: "오늘 마감",
    closedLabel: "마감",
    reservedProgress: (r, m) => `${r}명 예약${m > 0 ? ` / 최소 ${m}명` : ""}`,
    remainingToMin: (n) => `${n}명만 더 모이면 초청이 확정됩니다.`,
    minReached: "최소 인원 달성 — 확정 준비 중입니다.",
    depositLabel: (a) => `예약금 ${a}`,

    requestedTitle: "지금 요청되고 있는 안무가",
    requestedSub: "카드를 누르면 프로필을 볼 수 있어요. 수요가 모이면 deetz가 섭외를 시작하고, 협의가 진행되면 예약 모집이 열립니다.",
    requestedEmpty: "아직 요청된 안무가가 없어요. 위 검색창에서 첫 번째로 요청해 보세요.",
    officialBadge: "공식 후보",
    confirmedBadge: "초청 확정",
    completedBadge: "진행 완료",
    demandBand: {
      lt10: "수요 모으는 중",
      "10+": "10명+ 기다려요",
      "30+": "30명+ 기다려요",
      "50+": "50명+ 기다려요",
      "100+": "100명+ 기다려요",
    },

    chipsTitle: "이런 안무가·장르로 찾아보세요",
    chips: [
      { label: "RIEHATA", q: "riehata" },
      { label: "Kyle Hanagami", q: "kyle hanagami" },
      { label: "Bailey Sok", q: "bailey sok" },
      { label: "Parris Goebel", q: "parris" },
      { label: "Heels", q: "heels" },
      { label: "Breaking", q: "breaking" },
      { label: "Popping", q: "popping" },
      { label: "K-Pop", q: "k-pop" },
    ],

    modalInsta: "인스타그램에서 보기",
    modalDeetzProfile: "deetz 프로필 보기",
    modalGoDetail: "모집 페이지 보기",

    firstVoteNote: "첫 번째 요청이에요! 수요의 시작을 만드셨어요.",

    searchPh: "안무가 이름 또는 @인스타 아이디",
    searchSearching: "검색 중…",
    searchEmpty: "등록된 카드가 아직 없어요. 아래에서 직접 제안해 주세요.",
    searchManualCta: "찾는 안무가가 없나요? 직접 제안하기",
    searchStatusListed: "후보 공개",
    searchStatusSuggested: "제안됨",
    searchStatusDancer: "deetz 댄서",
    shareCta: "친구에게 알리기",
    shareText: "deetz 워크샵 — 배우고 싶은 안무가에게 투표하면 초청이 추진돼요.",
    shareCopied: "링크를 복사했어요",

    voteCta: "나도 원해요",
    votedLabel: "수요 등록 완료",
    voteSubmitting: "등록 중…",
    voteContactPrompt: "진행 소식을 알려드릴 연락 수단이 필요해요. 이메일 또는 인스타 아이디 중 하나만 남겨주세요.",
    voteEmailPh: "이메일",
    voteInstaPh: "인스타그램 아이디 (@ 없이)",
    voteClose: "닫기",
    voteSubmit: "수요 등록",
    voteNeedContact: "이메일 또는 인스타그램 아이디를 입력해 주세요.",

    howTitle: "진행 방식",
    howSteps: [
      { title: "제안", body: "함께하고 싶은 안무가의 이름과 인스타그램을 알려주세요. 같은 안무가를 원하는 제안은 하나로 모입니다." },
      { title: "수요", body: "공개된 후보 카드에 '나도 원해요'를 눌러 수요를 모읍니다. 수요가 큰 안무가부터 deetz가 섭외를 추진합니다." },
      { title: "모집", body: "섭외 협의가 진행되면 예약금 모집이 열립니다. 예약금은 참가비의 일부이며, 자리를 확정하는 보증금입니다." },
      { title: "확정", body: "최소 인원이 모이면 워크샵이 확정됩니다. 확정 안내와 함께 일정과 잔금 결제 방법을 알려드립니다." },
    ],

    nominateTitle: "안무가 제안",
    nominateSub: "먼저 검색해 보세요. 이미 카드가 있으면 탭 한 번으로 수요가 합산됩니다. 없으면 직접 제안해 주세요.",
    fArtistName: "안무가 이름",
    fArtistNamePh: "예: Ian Eastwood",
    fInstagram: "인스타그램",
    fInstagramPh: "@handle 또는 프로필 링크",
    fComment: "코멘트",
    fCommentPh: "어떤 스타일·곡의 클래스를 원하는지 알려주시면 섭외에 도움이 됩니다.",
    fCountry: "거주 국가",
    fCity: "거주 도시",
    fCityDefault: "서울",
    fLocationNote: "어느 지역의 수요인지 알면 개최 도시를 정하는 데 도움이 됩니다.",
    fMyEmail: "내 이메일",
    fMyEmailPh: "소식 받을 이메일",
    fMyInsta: "내 인스타그램",
    fMyInstaPh: "@ 없이 아이디만",
    fContactNote: "둘 중 하나만 입력하면 됩니다. 모집 오픈·확정 소식을 전해드리는 용도로만 사용합니다.",
    fSubmit: "안무가 제안하기",
    fSubmitting: "접수 중…",
    fFreeNote: "제안은 무료입니다. 카드 공개와 섭외 진행은 deetz 운영진이 검토 후 결정합니다.",
    errNeedNameInsta: "안무가 이름과 인스타그램을 입력해 주세요.",
    errNeedContact: "소식을 받을 이메일 또는 인스타그램 아이디를 입력해 주세요.",
    errGeneric: "오류가 발생했습니다. 다시 시도해 주세요.",
    doneTitle: "제안이 접수되었습니다",
    doneAlreadyTitle: "이미 등록된 수요예요",
    doneBody: "같은 안무가를 원하는 수요가 모이면 deetz가 섭외를 추진합니다. 모집이 열리면 남겨주신 연락 수단으로 소식을 전해드릴게요.",
    doneAgain: "다른 안무가도 제안하기",
    requiredMark: "*",
    optionalMark: "(선택)",

    policyTitle: "예약금·환불 규정",
    policyRows: [
      "예약금은 워크샵 참가비의 일부이며, 초청이 확정되면 잔금 결제 안내를 드립니다.",
      "모집 인원 미달이나 주최 측 사정으로 워크샵이 진행되지 않으면 예약금은 전액 환불됩니다.",
      "워크샵 확정 전에는 개인 사유로 취소하셔도 전액 환불됩니다.",
      "워크샵 확정 후에는 안무가 초청과 좌석 확보가 진행되어 개인 사유에 따른 취소·환불이 제한될 수 있습니다.",
      "다만 관련 법령에 따른 청약철회권과 주최 측 귀책·미제공 부분에 대한 권리는 제한하지 않습니다.",
      "취소·양도는 운영진 확인 후 처리되며, 결제 확인 메일에 회신해 주시면 안내드립니다.",
    ],
    faqTitle: "자주 묻는 질문",
    faqs: [
      { q: "제안만 하면 비용이 드나요?", a: "아니요. 제안과 수요 등록은 모두 무료입니다. 예약금은 모집이 열린 워크샵에서 자리를 확정할 때만 결제합니다." },
      { q: "수요를 등록하면 어떤 연락을 받나요?", a: "해당 안무가의 모집이 열리거나 워크샵이 확정되면 남겨주신 이메일 또는 deetz 계정으로 소식을 전해드립니다." },
      { q: "예약금을 냈는데 최소 인원이 안 모이면요?", a: "모집 기간 내 최소 인원이 모이지 않으면 워크샵은 열리지 않고, 예약금은 전액 환불됩니다." },
      { q: "안무가는 어떻게 섭외하나요?", a: "deetz와 GRIGO Entertainment의 글로벌 네트워크로 직접 컨택합니다. 수요 데이터가 있으면 섭외 협상도 훨씬 빨라집니다." },
      { q: "해외에 살고 있어도 제안할 수 있나요?", a: "네. 거주 국가와 도시를 함께 남겨주세요. 해외 수요가 모이면 해당 지역 개최나 한국 안무가의 해외 워크샵도 검토합니다." },
      { q: "제 이름이 후보에 올라와 있어요. 내릴 수 있나요?", a: "안무가 본인이 게시를 원치 않으시면 contact@deetz.kr 로 알려주세요. 확인 후 바로 내립니다." },
    ],
    disclaimer:
      "후보 카드는 수요 확인용이며, 카드 공개가 해당 안무가의 방한 확정을 뜻하지 않습니다. 섭외 및 일정은 협의에 따라 변경될 수 있습니다.",
  },

  en: {
    badge: "Demand-driven workshops",
    title1: "Who should teach",
    title2: "the next deetz workshop?",
    sub: "deetz runs workshops on a regular basis. Tell us which choreographer you want to learn from. Your demand shapes the next workshop lineup.",
    heroNote: "Suggesting and voting are free. Deposits are only collected once recruiting opens, and are fully refunded if the minimum headcount is not reached.",
    ctaNominate: "Suggest a choreographer",
    ctaBrowse: "See requests",
    loginLabel: "Log in",

    eventsTitle: "Upcoming workshops",
    eventsSub: "Confirmed dates and instructors. Pick your classes and register.",
    eventsView: "See schedule · Register",
    eventsClasses: (n) => `${n} ${n === 1 ? "class" : "classes"}`,

    recruitingTitle: "Recruiting now",
    recruitingBadge: "Recruiting",
    deadlineToday: "Closes today",
    closedLabel: "Closed",
    reservedProgress: (r, m) => `${r} reserved${m > 0 ? ` / min ${m}` : ""}`,
    remainingToMin: (n) => `${n} more to confirm the invitation.`,
    minReached: "Minimum reached — confirming soon.",
    depositLabel: (a) => `Deposit ${a}`,

    requestedTitle: "Choreographers being requested",
    requestedSub: "Tap a card to see the profile. Once demand builds, deetz starts outreach — and recruiting opens when terms are agreed.",
    requestedEmpty: "No requests yet. Be the first — search above.",
    officialBadge: "Official candidate",
    confirmedBadge: "Confirmed",
    completedBadge: "Completed",
    demandBand: {
      lt10: "Gathering demand",
      "10+": "10+ dancers waiting",
      "30+": "30+ dancers waiting",
      "50+": "50+ dancers waiting",
      "100+": "100+ dancers waiting",
    },

    chipsTitle: "Try these names & styles",
    chips: [
      { label: "RIEHATA", q: "riehata" },
      { label: "Kyle Hanagami", q: "kyle hanagami" },
      { label: "Bailey Sok", q: "bailey sok" },
      { label: "Parris Goebel", q: "parris" },
      { label: "Heels", q: "heels" },
      { label: "Breaking", q: "breaking" },
      { label: "Popping", q: "popping" },
      { label: "K-Pop", q: "k-pop" },
    ],

    modalInsta: "View on Instagram",
    modalDeetzProfile: "View deetz profile",
    modalGoDetail: "Go to recruiting page",

    firstVoteNote: "You're the first to request them!",

    searchPh: "Name or @instagram handle",
    searchSearching: "Searching…",
    searchEmpty: "No card yet. Suggest them below.",
    searchManualCta: "Can't find them? Suggest manually",
    searchStatusListed: "Candidate",
    searchStatusSuggested: "Suggested",
    searchStatusDancer: "deetz dancer",
    shareCta: "Share with friends",
    shareText: "deetz Workshops — vote for the choreographer you want to learn from.",
    shareCopied: "Link copied",

    voteCta: "I want this too",
    votedLabel: "Registered",
    voteSubmitting: "Saving…",
    voteContactPrompt: "We need one way to reach you with updates. Leave an email or an Instagram handle.",
    voteEmailPh: "Email",
    voteInstaPh: "Instagram handle (without @)",
    voteClose: "Close",
    voteSubmit: "Register",
    voteNeedContact: "Please enter an email or an Instagram handle.",

    howTitle: "How it works",
    howSteps: [
      { title: "Suggest", body: "Tell us the choreographer's name and Instagram. Suggestions for the same artist are merged into one card." },
      { title: "Demand", body: "Tap 'I want this too' on candidate cards. deetz reaches out to the most-wanted choreographers first." },
      { title: "Recruit", body: "Once outreach is under way, deposit recruiting opens. The deposit is part of the fee and secures your seat." },
      { title: "Confirm", body: "When the minimum headcount is reached, the workshop is confirmed and you receive the schedule and balance payment guide." },
    ],

    nominateTitle: "Suggest a choreographer",
    nominateSub: "Search first — if a card already exists, one tap adds your demand. If not, suggest them directly.",
    fArtistName: "Choreographer name",
    fArtistNamePh: "e.g. Ian Eastwood",
    fInstagram: "Instagram",
    fInstagramPh: "@handle or profile link",
    fComment: "Comment",
    fCommentPh: "Styles or songs you would love a class for — this helps our outreach.",
    fCountry: "Country you live in",
    fCity: "City",
    fCityDefault: "Seoul",
    fLocationNote: "Knowing where demand comes from helps us pick host cities.",
    fMyEmail: "Your email",
    fMyEmailPh: "Email for updates",
    fMyInsta: "Your Instagram",
    fMyInstaPh: "Handle without @",
    fContactNote: "Only one of the two is needed. Used solely to notify you about recruiting and confirmation.",
    fSubmit: "Suggest",
    fSubmitting: "Submitting…",
    fFreeNote: "Suggesting is free. The deetz team reviews suggestions before publishing cards and starting outreach.",
    errNeedNameInsta: "Please enter the choreographer's name and Instagram.",
    errNeedContact: "Please enter an email or an Instagram handle so we can reach you.",
    errGeneric: "Something went wrong. Please try again.",
    doneTitle: "Suggestion received",
    doneAlreadyTitle: "Already registered",
    doneBody: "When enough dancers want the same choreographer, deetz starts outreach. We will contact you when recruiting opens.",
    doneAgain: "Suggest another choreographer",
    requiredMark: "*",
    optionalMark: "(optional)",

    policyTitle: "Deposit & refund policy",
    policyRows: [
      "The deposit is part of the workshop fee; the balance is invoiced after confirmation.",
      "If the workshop does not open due to low headcount or organizer reasons, deposits are fully refunded.",
      "Before confirmation you can cancel for any reason with a full refund.",
      "After confirmation, cancellations for personal reasons may be limited as invitations and seats are secured.",
      "Statutory withdrawal rights and refunds for organizer fault or non-delivery are never limited.",
      "Cancellations and transfers are handled by the team — reply to your payment confirmation email.",
    ],
    faqTitle: "FAQ",
    faqs: [
      { q: "Does suggesting cost anything?", a: "No. Suggesting and voting are free. You only pay a deposit when recruiting opens and you want to secure a seat." },
      { q: "What updates will I receive?", a: "When recruiting opens or the workshop is confirmed, we contact you via the email or deetz account you left." },
      { q: "What if the minimum is not reached?", a: "The workshop does not open and your deposit is fully refunded." },
      { q: "How does deetz invite choreographers?", a: "Directly, through the global network of deetz and GRIGO Entertainment. Demand data makes negotiations much faster." },
      { q: "Can I suggest from outside Korea?", a: "Yes. Leave your country and city — overseas demand can lead to workshops in your region or Korean choreographers touring abroad." },
      { q: "I'm a choreographer listed here. Can I be removed?", a: "If you'd rather not be listed, email contact@deetz.kr and we'll take your card down right away." },
    ],
    disclaimer:
      "Candidate cards exist to gauge demand. A public card does not mean the choreographer's visit is confirmed. Outreach and schedules may change.",
  },

  ja: {
    badge: "リクエスト型ワークショップ",
    title1: "次のワークショップ、",
    title2: "誰に習いたいですか？",
    sub: "deetzは定期的にワークショップを開催しています。習ってみたい振付師を教えてください。皆さんのリクエストを次のラインナップづくりの参考にします。",
    heroNote: "提案とリクエスト登録は無料です。予約金は募集が始まったワークショップのみで、最少人数に達しない場合は全額返金されます。",
    ctaNominate: "振付師を提案する",
    ctaBrowse: "リクエスト状況を見る",
    loginLabel: "ログイン",

    eventsTitle: "開催予定のワークショップ",
    eventsSub: "日程と講師が確定したワークショップです。クラスを選んで申し込めます。",
    eventsView: "タイムテーブル · 申込",
    eventsClasses: (n) => `クラス${n}件`,

    recruitingTitle: "現在募集中",
    recruitingBadge: "募集中",
    deadlineToday: "本日締切",
    closedLabel: "締切",
    reservedProgress: (r, m) => `予約${r}名${m > 0 ? ` / 最少${m}名` : ""}`,
    remainingToMin: (n) => `あと${n}名で開催が確定します。`,
    minReached: "最少人数に到達 — 確定準備中です。",
    depositLabel: (a) => `予約金 ${a}`,

    requestedTitle: "リクエスト中の振付師",
    requestedSub: "カードをタップするとプロフィールが見られます。リクエストが集まるとdeetzが交渉を始め、条件がまとまると募集が開かれます。",
    requestedEmpty: "まだリクエストがありません。上の検索から最初のリクエストをどうぞ。",
    officialBadge: "公式候補",
    confirmedBadge: "招へい確定",
    completedBadge: "開催終了",
    demandBand: {
      lt10: "リクエスト集め中",
      "10+": "10人以上が待っています",
      "30+": "30人以上が待っています",
      "50+": "50人以上が待っています",
      "100+": "100人以上が待っています",
    },

    chipsTitle: "こんな名前・スタイルで探せます",
    chips: [
      { label: "RIEHATA", q: "riehata" },
      { label: "Kyle Hanagami", q: "kyle hanagami" },
      { label: "Bailey Sok", q: "bailey sok" },
      { label: "Parris Goebel", q: "parris" },
      { label: "Heels", q: "heels" },
      { label: "Breaking", q: "breaking" },
      { label: "Popping", q: "popping" },
      { label: "K-Pop", q: "k-pop" },
    ],

    modalInsta: "Instagramで見る",
    modalDeetzProfile: "deetzプロフィールを見る",
    modalGoDetail: "募集ページへ",

    firstVoteNote: "最初のリクエストです！",

    searchPh: "名前または@Instagram ID",
    searchSearching: "検索中…",
    searchEmpty: "まだカードがありません。下から直接提案してください。",
    searchManualCta: "見つからない場合は直接提案する",
    searchStatusListed: "候補公開",
    searchStatusSuggested: "提案済み",
    searchStatusDancer: "deetzダンサー",
    shareCta: "友達に知らせる",
    shareText: "deetz ワークショップ — 習いたい振付師にリクエストしよう。",
    shareCopied: "リンクをコピーしました",

    voteCta: "私も習いたい",
    votedLabel: "登録済み",
    voteSubmitting: "登録中…",
    voteContactPrompt: "進捗をお知らせする連絡先が必要です。メールまたはInstagram IDのどちらかをご記入ください。",
    voteEmailPh: "メールアドレス",
    voteInstaPh: "Instagram ID（@なし）",
    voteClose: "閉じる",
    voteSubmit: "登録する",
    voteNeedContact: "メールまたはInstagram IDを入力してください。",

    howTitle: "進め方",
    howSteps: [
      { title: "提案", body: "習いたい振付師の名前とInstagramを教えてください。同じ振付師への提案は1つのカードにまとまります。" },
      { title: "リクエスト", body: "公開された候補カードで「私も習いたい」を押してリクエストを集めます。多い順にdeetzが交渉を進めます。" },
      { title: "募集", body: "交渉が進むと予約金の募集が始まります。予約金は参加費の一部で、席を確保する保証金です。" },
      { title: "確定", body: "最少人数に達すると開催が確定します。日程と残金のご案内をお送りします。" },
    ],

    nominateTitle: "振付師を提案",
    nominateSub: "まず検索してみてください。カードがあればワンタップでリクエストが合算されます。なければ直接提案できます。",
    fArtistName: "振付師の名前",
    fArtistNamePh: "例: Ian Eastwood",
    fInstagram: "Instagram",
    fInstagramPh: "@handle またはプロフィールリンク",
    fComment: "コメント",
    fCommentPh: "習いたいスタイルや曲があれば教えてください。交渉の参考になります。",
    fCountry: "お住まいの国",
    fCity: "都市",
    fCityDefault: "ソウル",
    fLocationNote: "どの地域からのリクエストかが分かると、開催都市の検討に役立ちます。",
    fMyEmail: "メールアドレス",
    fMyEmailPh: "お知らせを受け取るメール",
    fMyInsta: "あなたのInstagram",
    fMyInstaPh: "@なしのIDのみ",
    fContactNote: "どちらか一方で構いません。募集開始・確定のお知らせにのみ使用します。",
    fSubmit: "提案する",
    fSubmitting: "送信中…",
    fFreeNote: "提案は無料です。カードの公開と交渉はdeetz運営が確認のうえ進めます。",
    errNeedNameInsta: "振付師の名前とInstagramを入力してください。",
    errNeedContact: "お知らせを受け取るメールまたはInstagram IDを入力してください。",
    errGeneric: "エラーが発生しました。もう一度お試しください。",
    doneTitle: "提案を受け付けました",
    doneAlreadyTitle: "すでに登録済みです",
    doneBody: "同じ振付師へのリクエストが集まるとdeetzが交渉を進めます。募集が始まったらご連絡します。",
    doneAgain: "別の振付師も提案する",
    requiredMark: "*",
    optionalMark: "（任意）",

    policyTitle: "予約金・返金規定",
    policyRows: [
      "予約金はワークショップ参加費の一部で、開催確定後に残金のご案内をします。",
      "最少人数に達しない場合や主催者都合で開催されない場合、予約金は全額返金されます。",
      "開催確定前は自己都合のキャンセルでも全額返金されます。",
      "開催確定後は招へい・席確保が進むため、自己都合のキャンセル・返金が制限される場合があります。",
      "ただし法令上のクーリングオフや主催者責任・未提供分に関する権利は制限されません。",
      "キャンセル・譲渡は運営確認のうえ処理します。決済確認メールに返信してください。",
    ],
    faqTitle: "よくある質問",
    faqs: [
      { q: "提案に費用はかかりますか？", a: "いいえ。提案とリクエスト登録は無料です。予約金は募集が始まったワークショップで席を確保するときだけ発生します。" },
      { q: "登録するとどんな連絡が来ますか？", a: "募集開始や開催確定の際に、ご記入いただいたメールまたはdeetzアカウントへお知らせします。" },
      { q: "予約金を払ったのに人数が集まらなかったら？", a: "ワークショップは開催されず、予約金は全額返金されます。" },
      { q: "振付師はどうやって招へいしますか？", a: "deetzとGRIGO Entertainmentのグローバルネットワークで直接コンタクトします。リクエストのデータがあると交渉が早く進みます。" },
      { q: "海外在住でも提案できますか？", a: "はい。お住まいの国と都市もご記入ください。海外のリクエストが集まれば、その地域での開催や韓国人振付師の海外ワークショップも検討します。" },
      { q: "自分の名前が候補に掲載されています。削除できますか？", a: "掲載を望まない振付師の方は contact@deetz.kr までご連絡ください。確認のうえすぐに削除します。" },
    ],
    disclaimer:
      "候補カードはリクエスト確認のためのものであり、公開＝来韓確定ではありません。交渉や日程は協議により変更される場合があります。",
  },

  // 태국 — 역방향 수요조사(태국 댄서 → 한국 안무가)의 1차 타깃. 카피 방향도 "한국 안무가를 당신의 도시로".
  // 태국어는 마침표를 잘 쓰지 않으므로 문장 구분은 \n (splitSentences 가 \n 도 분리한다).
  th: {
    badge: "เวิร์กช็อปตามคำขอของคุณ",
    title1: "เวิร์กช็อปครั้งต่อไป",
    title2: "อยากเรียนกับโคริโอกราเฟอร์คนไหน?",
    sub: "deetz จัดเวิร์กช็อปกับโคริโอกราเฟอร์ชั้นนำจากเกาหลีอย่างต่อเนื่อง\nบอกเราว่าคุณอยากเรียนกับใคร\nคำขอของคุณจะเป็นตัวกำหนดไลน์อัพเวิร์กช็อปครั้งต่อไปในเมืองของคุณ",
    heroNote: "การเสนอชื่อและการลงคะแนนฟรีทั้งหมด\nค่ามัดจำจะเก็บเฉพาะเวิร์กช็อปที่เปิดรับสมัครแล้ว และคืนเต็มจำนวนหากผู้เข้าร่วมไม่ครบตามขั้นต่ำ",
    ctaNominate: "เสนอชื่อโคริโอกราเฟอร์",
    ctaBrowse: "ดูรายชื่อที่ถูกเสนอ",
    loginLabel: "เข้าสู่ระบบ",

    eventsTitle: "เวิร์กช็อปที่เปิดรับสมัคร",
    eventsSub: "เวิร์กช็อปที่ยืนยันวันและผู้สอนแล้ว\nเลือกคลาสและสมัครได้เลย",
    eventsView: "ดูตาราง · สมัคร",
    eventsClasses: (n) => `${n} คลาส`,

    recruitingTitle: "กำลังเปิดรับสมัคร",
    recruitingBadge: "เปิดรับสมัคร",
    deadlineToday: "ปิดรับวันนี้",
    closedLabel: "ปิดรับแล้ว",
    reservedProgress: (r, m) => `จองแล้ว ${r} คน${m > 0 ? ` / ขั้นต่ำ ${m} คน` : ""}`,
    remainingToMin: (n) => `อีก ${n} คนจะยืนยันการจัด`,
    minReached: "ครบขั้นต่ำแล้ว — กำลังเตรียมยืนยัน",
    depositLabel: (a) => `มัดจำ ${a}`,

    requestedTitle: "โคริโอกราเฟอร์ที่กำลังถูกเสนอชื่อ",
    requestedSub: "แตะการ์ดเพื่อดูโปรไฟล์\nเมื่อคำขอมากพอ deetz จะเริ่มติดต่อ และเปิดรับสมัครเมื่อตกลงเงื่อนไขได้",
    requestedEmpty: "ยังไม่มีการเสนอชื่อ มาเป็นคนแรกได้เลย — ค้นหาด้านบน",
    officialBadge: "ผู้เข้าชิงอย่างเป็นทางการ",
    confirmedBadge: "ยืนยันแล้ว",
    completedBadge: "จัดเสร็จแล้ว",
    demandBand: {
      lt10: "กำลังรวบรวมคำขอ",
      "10+": "10+ คนกำลังรอ",
      "30+": "30+ คนกำลังรอ",
      "50+": "50+ คนกำลังรอ",
      "100+": "100+ คนกำลังรอ",
    },

    chipsTitle: "ลองค้นหาชื่อหรือสไตล์เหล่านี้",
    chips: [
      { label: "J HO", q: "j ho" },
      { label: "Emily", q: "emily" },
      { label: "K-Pop", q: "k-pop" },
      { label: "Hip Hop", q: "hip hop" },
      { label: "Choreography", q: "choreography" },
      { label: "Heels", q: "heels" },
    ],

    modalInsta: "ดูใน Instagram",
    modalDeetzProfile: "ดูโปรไฟล์ deetz",
    modalGoDetail: "ไปหน้ารับสมัคร",

    firstVoteNote: "คุณคือคนแรกที่เสนอชื่อเขา!",

    searchPh: "ชื่อ หรือ @instagram",
    searchSearching: "กำลังค้นหา…",
    searchEmpty: "ยังไม่มีการ์ดของคนนี้ เสนอชื่อได้ด้านล่างเลย",
    searchManualCta: "หาไม่เจอ? เสนอชื่อเอง",
    searchStatusListed: "ผู้เข้าชิง",
    searchStatusSuggested: "ถูกเสนอชื่อแล้ว",
    searchStatusDancer: "นักเต้น deetz",
    shareCta: "ชวนเพื่อน",
    shareText: "deetz Workshops — โหวตโคริโอกราเฟอร์เกาหลีที่คุณอยากเรียนด้วย",
    shareCopied: "คัดลอกลิงก์แล้ว",

    voteCta: "ฉันก็อยากเรียน",
    votedLabel: "ลงคะแนนแล้ว",
    voteSubmitting: "กำลังบันทึก…",
    voteContactPrompt: "เราต้องมีช่องทางติดต่อเพื่อแจ้งข่าว\nกรอกอีเมลหรือ Instagram อย่างใดอย่างหนึ่ง",
    voteEmailPh: "อีเมล",
    voteInstaPh: "Instagram (ไม่ต้องใส่ @)",
    voteClose: "ปิด",
    voteSubmit: "ลงคะแนน",
    voteNeedContact: "กรุณากรอกอีเมลหรือ Instagram",
    howTitle: "ขั้นตอนการทำงาน",
    howSteps: [
      { title: "เสนอชื่อ", body: "บอกชื่อและ Instagram ของโคริโอกราเฟอร์ที่อยากเรียนด้วย\nคำขอสำหรับคนเดียวกันจะรวมเป็นการ์ดเดียว" },
      { title: "รวบรวมคำขอ", body: "กด \"ฉันก็อยากเรียน\" บนการ์ดผู้เข้าชิง\ndeetz จะเริ่มติดต่อคนที่มีคำขอมากที่สุดก่อน" },
      { title: "เปิดรับสมัคร", body: "เมื่อการเจรจาคืบหน้า จะเปิดรับมัดจำ\nมัดจำคือส่วนหนึ่งของค่าเรียนและเป็นการยืนยันที่นั่งของคุณ" },
      { title: "ยืนยันการจัด", body: "เมื่อครบจำนวนขั้นต่ำ เวิร์กช็อปจะถูกยืนยัน\nเราจะแจ้งตารางและวิธีชำระส่วนที่เหลือ" },
    ],

    nominateTitle: "เสนอชื่อโคริโอกราเฟอร์",
    nominateSub: "ลองค้นหาก่อน\nถ้ามีการ์ดอยู่แล้ว แตะครั้งเดียวคำขอจะรวมกัน\nถ้าไม่มี เสนอชื่อเองได้เลย",
    fArtistName: "ชื่อโคริโอกราเฟอร์",
    fArtistNamePh: "เช่น RIEHATA",
    fInstagram: "Instagram",
    fInstagramPh: "@handle หรือลิงก์โปรไฟล์",
    fComment: "คอมเมนต์",
    fCommentPh: "อยากเรียนสไตล์ไหนหรือเพลงอะไร บอกเราได้ ช่วยในการติดต่อเชิญ",
    fCountry: "ประเทศที่อาศัย",
    fCity: "เมือง",
    fCityDefault: "กรุงเทพฯ",
    fLocationNote: "รู้ว่าคำขอมาจากที่ไหน ช่วยให้เราเลือกเมืองที่จะจัดได้",
    fMyEmail: "อีเมลของคุณ",
    fMyEmailPh: "อีเมลสำหรับรับข่าว",
    fMyInsta: "Instagram ของคุณ",
    fMyInstaPh: "ไม่ต้องใส่ @",
    fContactNote: "กรอกอย่างใดอย่างหนึ่งก็พอ\nใช้เพื่อแจ้งการเปิดรับสมัครและการยืนยันเท่านั้น",
    fSubmit: "เสนอชื่อ",
    fSubmitting: "กำลังส่ง…",
    fFreeNote: "การเสนอชื่อฟรี\nทีม deetz จะตรวจสอบก่อนเปิดการ์ดและเริ่มการติดต่อ",
    errNeedNameInsta: "กรุณากรอกชื่อและ Instagram ของโคริโอกราเฟอร์",
    errNeedContact: "กรุณากรอกอีเมลหรือ Instagram เพื่อรับข่าว",
    errGeneric: "เกิดข้อผิดพลาด กรุณาลองใหม่",
    doneTitle: "รับคำเสนอแล้ว",
    doneAlreadyTitle: "คุณลงคะแนนไว้แล้ว",
    doneBody: "เมื่อมีคนอยากเรียนกับโคริโอกราเฟอร์คนเดียวกันมากพอ deetz จะเริ่มติดต่อเชิญ\nเราจะแจ้งคุณเมื่อเปิดรับสมัคร",
    doneAgain: "เสนอชื่อคนอื่นด้วย",
    requiredMark: "*",
    optionalMark: "(ไม่บังคับ)",

    policyTitle: "มัดจำและการคืนเงิน",
    policyRows: [
      "มัดจำคือส่วนหนึ่งของค่าเรียน เมื่อยืนยันการจัดจะแจ้งวิธีชำระส่วนที่เหลือ",
      "หากเวิร์กช็อปไม่ได้จัดเพราะผู้เข้าร่วมไม่ครบหรือเหตุจากผู้จัด คืนมัดจำเต็มจำนวน",
      "ก่อนยืนยันการจัด ยกเลิกด้วยเหตุส่วนตัวได้ คืนเต็มจำนวน",
      "หลังยืนยันการจัด การยกเลิกด้วยเหตุส่วนตัวอาจถูกจำกัด เพราะการเชิญและที่นั่งถูกยืนยันแล้ว",
      "สิทธิ์ตามกฎหมายและกรณีความรับผิดของผู้จัดไม่ถูกจำกัด",
      "การยกเลิกหรือโอนสิทธิ์ ทีมงานจะตรวจสอบก่อน — ตอบกลับอีเมลยืนยันการชำระเงินได้เลย",
    ],
    faqTitle: "คำถามที่พบบ่อย",
    faqs: [
      { q: "เสนอชื่อมีค่าใช้จ่ายไหม?", a: "ไม่มี การเสนอชื่อและการลงคะแนนฟรีทั้งหมด\nจ่ายมัดจำเฉพาะตอนจองที่นั่งในเวิร์กช็อปที่เปิดรับสมัครแล้ว" },
      { q: "ลงคะแนนแล้วจะได้รับข่าวอะไรบ้าง?", a: "เมื่อเปิดรับสมัครหรือยืนยันการจัด เราจะติดต่อผ่านอีเมลหรือบัญชี deetz ที่คุณให้ไว้" },
      { q: "จ่ายมัดจำแล้วแต่คนไม่ครบ?", a: "เวิร์กช็อปจะไม่ถูกจัดและคืนมัดจำเต็มจำนวน" },
      { q: "deetz เชิญโคริโอกราเฟอร์อย่างไร?", a: "ติดต่อโดยตรงผ่านเครือข่ายของ deetz และ GRIGO Entertainment ในเกาหลี\nข้อมูลคำขอช่วยให้การเจรจาเร็วขึ้นมาก" },
      { q: "อยู่นอกกรุงเทพฯ เสนอได้ไหม?", a: "ได้ กรอกประเทศและเมืองของคุณมาด้วย\nถ้าคำขอในเมืองของคุณมากพอ เราจะพิจารณาจัดที่นั่น" },
      { q: "ชื่อของฉันอยู่ในรายชื่อ ขอลบได้ไหม?", a: "โคริโอกราเฟอร์ที่ไม่ต้องการให้แสดงชื่อ ติดต่อ contact@deetz.kr เราจะลบให้ทันทีหลังตรวจสอบ" },
    ],
    disclaimer:
      "การ์ดผู้เข้าชิงมีไว้เพื่อสำรวจความต้องการ การเปิดการ์ดไม่ได้แปลว่าการมาสอนถูกยืนยันแล้ว\nการเชิญและตารางอาจเปลี่ยนแปลงตามการเจรจา",
  },
};
