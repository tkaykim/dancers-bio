import type { Messages } from "../t";

/**
 * 랜딩(`/`) 문구. 제목·설명은 meta 네임스페이스(home.*)를 쓰고 여기에는
 * 랜딩 전용 OG 설명·검색 키워드·본문만 둔다 (docs/design-i18n-ui.md §3.3).
 *
 * `meta.keywords` 는 쉼표로 구분한 목록이며 페이지가 split 해서 쓴다.
 * 화면 문구와 접근성 이름은 세 언어 사전에서 함께 관리한다.
 */
const ko = {
  "home.skip": "본문으로 이동",
  "home.home_label": "deetz 홈",
  "home.nav_label": "주요 메뉴",
  "home.how": "이용 방법",
  "home.login": "로그인",
  "home.stat_dancers": "등록 댄서",
  "home.stat_teams": "활동 중인 팀",
  "home.stat_calls": "모집 중인 공고",
  "home.image_caption": "영상으로 만나는 퍼포먼스",
  "home.watch": "영상 보기",
  "home.client_label": "댄서를 찾고 있다면",
  "home.client_title": "우리 프로젝트에\n맞는 댄서.",
  "home.client_body": "영상과 경력을 살펴보고 필요한 댄서에게 제안하세요.\n공고를 올려 일정과 조건에 맞는 지원자를 모을 수도 있습니다.",
  "home.post_call": "공고 등록하기",
  "home.dancer_label": "새로운 작업을 찾고 있다면",
  "home.dancer_title": "다음 작업으로\n이어지는 프로필.",
  "home.dancer_body": "경력과 작업 영상을 한 페이지에 담으세요.\n촬영·공연 공고에 지원하고 새로운 캐스팅 제안을 받아보세요.",
  "home.create_profile": "프로필 만들기",
  "home.service_label": "함께 만드는 작업",
  "home.service_title": "카메라 앞에서도.\n무대 위에서도.",
  "home.service_body": "솔로 퍼포먼스부터 팀 단위 공연, 안무 제작까지.\n프로젝트에 필요한 경험과 장르를 찾아보세요.",
  "home.service_film": "뮤직비디오 · 광고",
  "home.service_stage": "무대 · 방송",
  "home.service_choreography": "안무 제작 · 디렉팅",
  "home.service_team": "공연 · 행사",
  "home.program_label": "한국 활동을 준비하는 해외 댄서에게",
  "home.program_title": "비자·댄스 프로그램 알아보기",
  "home.faq_label": "자주 묻는 질문",
  "home.guide": "이용 가이드 보기",
  "home.contact_label": "섭외·캐스팅 문의",
  "home.footer_note": "댄서, 안무가, 그리고 다음 무대.",
  "home.terms": "이용약관",
  "home.privacy": "개인정보처리방침",

  "meta.og_description":
    "MV·광고·무대·방송 댄서 섭외와 안무 제작을 포트폴리오로 연결하는 댄서 캐스팅 플랫폼, 디츠(deetz).",
  "meta.keywords":
    "디츠, deetz, 댄서 플랫폼, 댄서 캐스팅, 댄서 캐스팅 플랫폼, 댄서 섭외, 댄서 섭외 플랫폼, 댄서 구인, 백댄서 섭외, 안무 제작, 안무제작, K-POP 댄서, 안무가 섭외, 댄스팀 섭외, 댄스 공연 섭외, MV 댄서, 광고 댄서",

  "nav.dancers": "댄서 보기",
  "nav.feed": "공고 보기",

  "hero.badge": "댄서 · 안무가 · 댄스팀",
  "hero.title": "댄서 섭외부터\n안무 제작까지.",
  "hero.lede":
    "뮤직비디오, 광고, 공연에 필요한 댄서와 안무가들의\n프로필을 보고 작업에 맞는 사람을 찾으세요.",
  "hero.cta_feed": "공고 보기",
  "hero.cta_portfolio": "댄서 찾기",
  "hero.image_alt": "스튜디오에서 함께 안무를 연습하는 댄서들",

  "stats.calls_fallback": "공개",

  "magazine.title": "댄서의 경력과 영상으로 판단하는 캐스팅.",
  "card.dancers": "검증된 댄서·팀 포트폴리오를 확인하세요.",
  "card.projects": "프로젝트 공고를 열고 지원자를 비교하세요.",

  "solve.title": "댄서 섭외를 검색, 비교, 지원 흐름으로 바꿉니다.",
  "usecase.mv": "뮤직비디오와 퍼포먼스 영상 백업댄서 섭외",
  "usecase.ad": "광고, 브랜드 캠페인, 숏폼 콘텐츠 출연 댄서 캐스팅",
  "usecase.stage": "방송, 행사, 쇼케이스, 팬미팅 무대 댄서 모집",
  "usecase.choreography": "안무 제작, 안무가 섭외, 퍼포먼스 디렉터 연결",
  "usecase.team": "댄스 공연 섭외와 댄스팀 포트폴리오 확인",
  "usecase.portfolio": "안무가, 디렉터, 인스트럭터, 댄스팀 포트폴리오 확인",

  "faq.title": "궁금한 점을\n먼저 확인하세요.",
  "faq.q_service": "deetz는 어떤 서비스인가요?",
  "faq.a_service":
    "deetz(디츠)는 MV, 광고, 무대, 방송, 행사에 필요한 댄서와 안무가를 연결하는 댄서 캐스팅 플랫폼입니다. 검증된 댄서·댄스팀의 경력과 영상 포트폴리오를 직접 보고 섭외할 수 있습니다.",
  "faq.q_booking": "댄서나 안무가를 어떻게 섭외하나요?",
  "faq.a_booking":
    "프로젝트 유형, 일정, 지역, 예산, 필요한 장르를 정리해 섭외 공고를 올리면 댄서와 안무가의 지원을 받을 수 있습니다. 마음에 드는 프로필에는 직접 캐스팅 제안을 보낼 수도 있습니다.",
  "faq.q_price": "댄서 섭외 비용은 어떻게 정해지나요?",
  "faq.a_price":
    "비용은 프로젝트 유형, 촬영·공연 일정, 회차, 지역, 요구 경력에 따라 달라집니다. 공고에 출연료 조건을 적거나 댄서·안무가와 직접 협의해 정하며, 포트폴리오와 경력을 확인한 뒤 합리적으로 결정할 수 있습니다.",
  "faq.q_choreography": "안무 제작이나 안무가 섭외도 가능한가요?",
  "faq.a_choreography":
    "네. 댄서 섭외뿐 아니라 안무 제작, 안무가 섭외, 퍼포먼스 디렉터 연결까지 가능합니다. 안무가·디렉터의 작업 영상과 경력을 보고 프로젝트에 맞는 사람을 섭외할 수 있습니다.",
  "faq.q_team": "공연이나 행사 댄스팀 섭외도 되나요?",
  "faq.a_team":
    "무대, 행사, 쇼케이스, 팬미팅 같은 공연 댄스팀 섭외도 가능합니다. 공고를 올려 지원을 받거나, 디렉토리에서 댄스팀 포트폴리오를 보고 직접 섭외 제안을 보낼 수 있습니다.",
  "faq.q_dancer": "댄서로 활동하고 싶은데 어떻게 시작하나요?",
  "faq.a_dancer":
    "프로필을 만들고 경력과 영상 포트폴리오를 등록하면 공개된 섭외 공고에 지원하거나 캐스팅 제안을 받을 수 있습니다. 인스타그램 프로필에는 dancers.bio 링크로 본인 페이지를 공유할 수 있습니다.",
  "faq.more": "더 자세한 내용은 {link}에서 확인하세요.",
  "faq.more_link": "댄서 섭외·안무 제작 가이드",

  "contact.title": "어떤 무대를\n준비하고 있나요?",
  "contact.body":
    "프로젝트 유형, 일정, 예산, 필요한 장르를 함께 적어주시면 더 빠르게 도와드릴 수 있습니다.",
  "contact.kakao": "카카오톡으로 문의",
  "contact.instagram": "인스타그램 DM",

  "jsonld.service_name": "deetz 댄서 섭외 및 안무 제작",
  "jsonld.service_description":
    "MV, 광고, 무대, 방송, 행사에 필요한 댄서 섭외, 안무 제작, 안무가 섭외, 댄스팀 섭외, 댄스 공연 섭외를 포트폴리오 기반으로 연결하는 플랫폼.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "home.skip": "Skip to content",
  "home.home_label": "deetz home",
  "home.nav_label": "Main navigation",
  "home.how": "How it works",
  "home.login": "Log in",
  "home.stat_dancers": "Registered dancers",
  "home.stat_teams": "Active teams",
  "home.stat_calls": "Open casting calls",
  "home.image_caption": "Performance, on film",
  "home.watch": "Watch the film",
  "home.client_label": "Looking for dancers?",
  "home.client_title": "Find the people\nfor your project.",
  "home.client_body": "Explore their work and credits, then send an offer.\nOr post a casting call to find applicants who fit your schedule and brief.",
  "home.post_call": "Post a casting call",
  "home.dancer_label": "Looking for your next project?",
  "home.dancer_title": "Your work.\nYour next opportunity.",
  "home.dancer_body": "Bring your credits and videos together in one profile.\nApply for shoots and performances, and receive casting offers.",
  "home.create_profile": "Create a profile",
  "home.service_label": "What we work on",
  "home.service_title": "On camera.\nOn stage.",
  "home.service_body": "From solo performances to full dance teams and choreography.\nFind the experience and styles your project needs.",
  "home.service_film": "Music videos & commercials",
  "home.service_stage": "Stage & broadcast",
  "home.service_choreography": "Choreography & direction",
  "home.service_team": "Performances & events",
  "home.program_label": "For international dancers planning to work in Korea",
  "home.program_title": "Explore the visa & dance program",
  "home.faq_label": "Questions & answers",
  "home.guide": "Read the guide",
  "home.contact_label": "Casting inquiries",
  "home.footer_note": "Dancers, choreographers, and what comes next.",
  "home.terms": "Terms",
  "home.privacy": "Privacy",

  "meta.og_description":
    "deetz is a dancer casting platform that connects music videos, ads, stages and broadcasts with dancers and choreography through portfolios.",
  "meta.keywords":
    "deetz, dancer casting, dancer casting platform, book dancers, hire dancers, backup dancers, choreography, choreography production, hire a choreographer, K-POP dancers, dance team booking, dance performance booking, music video dancers, commercial dancers",

  "nav.dancers": "Dancers",
  "nav.feed": "Casting calls",

  "hero.badge": "Dancers, choreographers & dance teams",
  "hero.title": "Dancer casting\nand choreography.",
  "hero.lede":
    "Browse dancer and choreographer profiles to find the right people for your music video, ad, or performance.",
  "hero.cta_feed": "Explore casting calls",
  "hero.cta_portfolio": "Find dancers",
  "hero.image_alt": "Dancers rehearsing choreography together in a studio",

  "stats.calls_fallback": "Open",

  "magazine.title": "Casting decided by credits and video.",
  "card.dancers": "Check verified dancer and team portfolios.",
  "card.projects": "Post a casting call and compare applicants.",

  "solve.title": "We turn dancer casting into one flow: search, compare, apply.",
  "usecase.mv": "Book backup dancers for music videos and performance films",
  "usecase.ad": "Cast dancers for ads, brand campaigns and short-form content",
  "usecase.stage": "Recruit stage dancers for broadcasts, events, showcases and fan meetings",
  "usecase.choreography": "Choreography production, choreographer booking and introductions to performance directors",
  "usecase.team": "Book dance performances and review dance team portfolios",
  "usecase.portfolio": "Review portfolios of choreographers, directors, instructors and dance teams",

  "faq.title": "A few things\nto know first.",
  "faq.q_service": "What is deetz?",
  "faq.a_service":
    "deetz is a dancer casting platform that connects music videos, ads, stages, broadcasts and events with dancers and choreographers. You can see the credits and video portfolios of verified dancers and dance teams and book them directly.",
  "faq.q_booking": "How do I book a dancer or a choreographer?",
  "faq.a_booking":
    "Post a casting call with your project type, schedule, region, budget and the genres you need, and dancers and choreographers will apply. You can also send a direct offer to any profile you like.",
  "faq.q_price": "How is the cost of booking a dancer decided?",
  "faq.a_price":
    "It depends on the project type, the shoot or show schedule, the number of sessions, the region and the experience you need. You can state the pay in the casting call or agree on it directly with the dancer or choreographer, once you have seen their portfolio and credits.",
  "faq.q_choreography": "Can I also arrange choreography or book a choreographer?",
  "faq.a_choreography":
    "Yes. Beyond booking dancers, you can arrange choreography production, book a choreographer and get connected with a performance director. Watch their work and check their credits to find the right person for your project.",
  "faq.q_team": "Can I book a dance team for a show or an event?",
  "faq.a_team":
    "Yes, you can book dance teams for stages, events, showcases and fan meetings. Post a casting call to receive applications, or browse team portfolios in the directory and send a direct offer.",
  "faq.q_dancer": "I want to work as a dancer. How do I start?",
  "faq.a_dancer":
    "Create a profile and add your credits and video portfolio. Then you can apply to open casting calls or receive direct offers. You can also share your page from your Instagram profile with a dancers.bio link.",
  "faq.more": "For more, see the {link}.",
  "faq.more_link": "guide to dancer casting and choreography",

  "contact.title": "What are you\nworking on?",
  "contact.body":
    "Tell us the project type, schedule, budget and the genres you need, and we can help you faster.",
  "contact.kakao": "Talk on KakaoTalk",
  "contact.instagram": "Instagram DM",

  "jsonld.service_name": "deetz dancer casting and choreography production",
  "jsonld.service_description":
    "A portfolio-based platform that connects music videos, ads, stages, broadcasts and events with dancer booking, choreography production, choreographer booking, dance team booking and dance performance booking.",
};

const ja: Record<Key, string> = {
  "home.skip": "本文へ移動",
  "home.home_label": "deetz ホーム",
  "home.nav_label": "メインナビゲーション",
  "home.how": "利用方法",
  "home.login": "ログイン",
  "home.stat_dancers": "登録ダンサー",
  "home.stat_teams": "活動中のチーム",
  "home.stat_calls": "募集中の案件",
  "home.image_caption": "映像で出会うパフォーマンス",
  "home.watch": "映像を見る",
  "home.client_label": "ダンサーを探している方へ",
  "home.client_title": "プロジェクトに合う\nダンサーと出会う。",
  "home.client_body": "映像と経歴を見て、気になるダンサーにオファー。\n募集を掲載して、日程や条件に合う応募者を集めることもできます。",
  "home.post_call": "募集を掲載する",
  "home.dancer_label": "新しい仕事を探している方へ",
  "home.dancer_title": "次の仕事につながる\nプロフィール。",
  "home.dancer_body": "経歴と作品映像をひとつのページに。\n撮影・公演の募集に応募し、キャスティングのオファーを受け取りましょう。",
  "home.create_profile": "プロフィールを作る",
  "home.service_label": "一緒につくる仕事",
  "home.service_title": "カメラの前でも。\nステージの上でも。",
  "home.service_body": "ソロからチーム公演、振付制作まで。\nプロジェクトに必要な経験とジャンルを探せます。",
  "home.service_film": "MV・広告",
  "home.service_stage": "ステージ・放送",
  "home.service_choreography": "振付制作・ディレクション",
  "home.service_team": "公演・イベント",
  "home.program_label": "韓国での活動を準備する海外ダンサーへ",
  "home.program_title": "ビザ・ダンスプログラムを見る",
  "home.faq_label": "よくある質問",
  "home.guide": "利用ガイドを見る",
  "home.contact_label": "キャスティングのお問い合わせ",
  "home.footer_note": "ダンサー、振付師、そして次のステージへ。",
  "home.terms": "利用規約",
  "home.privacy": "プライバシーポリシー",

  "meta.og_description":
    "deetzは、MV・広告・ステージ・放送のダンサーキャスティングと振付制作をポートフォリオでつなぐプラットフォームです。",
  "meta.keywords":
    "deetz, ダンサーキャスティング, ダンサー手配, ダンサー募集, バックダンサー, 振付制作, 振付師, 振付師手配, K-POPダンサー, ダンスチーム手配, ダンス公演, MVダンサー, 広告ダンサー",

  "nav.dancers": "ダンサー一覧",
  "nav.feed": "募集一覧",

  "hero.badge": "ダンサー・振付師・ダンスチーム",
  "hero.title": "ダンサーの手配から\n振付制作まで。",
  "hero.lede":
    "ミュージックビデオ、広告、公演に出演するダンサーや振付師のプロフィールを見て、依頼内容に合う人を探しましょう。",
  "hero.cta_feed": "募集を見る",
  "hero.cta_portfolio": "ダンサーを探す",
  "hero.image_alt": "スタジオで一緒に振付を練習するダンサーたち",

  "stats.calls_fallback": "公開",

  "magazine.title": "ダンサーの経歴と映像で判断するキャスティング。",
  "card.dancers": "審査を通過したダンサー・チームのポートフォリオをご覧ください。",
  "card.projects": "案件の募集を掲載して、応募者を比較しましょう。",

  "solve.title": "ダンサーの手配を、検索・比較・応募の流れに変えます。",
  "usecase.mv": "MVやパフォーマンス映像のバックダンサー手配",
  "usecase.ad": "広告・ブランドキャンペーン・ショート動画に出演するダンサーのキャスティング",
  "usecase.stage": "放送・イベント・ショーケース・ファンミーティングのステージダンサー募集",
  "usecase.choreography": "振付制作・振付師の手配・パフォーマンスディレクターのご紹介",
  "usecase.team": "ダンス公演の手配とダンスチームのポートフォリオ確認",
  "usecase.portfolio": "振付師・ディレクター・インストラクター・ダンスチームのポートフォリオ確認",

  "faq.title": "はじめに\n知っておきたいこと。",
  "faq.q_service": "deetzはどんなサービスですか？",
  "faq.a_service":
    "deetzは、MV・広告・ステージ・放送・イベントに必要なダンサーと振付師をつなぐキャスティングプラットフォームです。審査を通過したダンサー・ダンスチームの経歴と映像ポートフォリオを直接見て手配できます。",
  "faq.q_booking": "ダンサーや振付師はどのように手配しますか？",
  "faq.a_booking":
    "案件の種類、日程、地域、予算、必要なジャンルをまとめて募集を掲載すると、ダンサーや振付師から応募が届きます。気になるプロフィールには直接オファーを送ることもできます。",
  "faq.q_price": "ダンサーの手配費用はどのように決まりますか？",
  "faq.a_price":
    "費用は案件の種類、撮影・公演の日程、回数、地域、求める経歴によって変わります。募集に出演料の条件を記載するか、ダンサー・振付師と直接相談して決めます。ポートフォリオと経歴を確認したうえで、妥当な金額を判断できます。",
  "faq.q_choreography": "振付制作や振付師の手配もできますか？",
  "faq.a_choreography":
    "はい。ダンサーの手配だけでなく、振付制作、振付師の手配、パフォーマンスディレクターのご紹介まで可能です。振付師・ディレクターの作品映像と経歴を見て、案件に合う方を手配できます。",
  "faq.q_team": "公演やイベントのダンスチーム手配もできますか？",
  "faq.a_team":
    "ステージ、イベント、ショーケース、ファンミーティングなどに出演するダンスチームの手配も可能です。募集を掲載して応募を受けるか、一覧でダンスチームのポートフォリオを見て直接オファーを送れます。",
  "faq.q_dancer": "ダンサーとして活動したいのですが、どう始めればよいですか？",
  "faq.a_dancer":
    "プロフィールを作成し、経歴と映像ポートフォリオを登録すると、公開中の募集に応募したりオファーを受け取ったりできます。Instagramのプロフィールにdancers.bioのリンクを載せて、ご自身のページを共有できます。",
  "faq.more": "詳しくは{link}をご覧ください。",
  "faq.more_link": "ダンサー手配・振付制作ガイド",

  "contact.title": "どんなステージを\n準備していますか？",
  "contact.body":
    "案件の種類・日程・予算・必要なジャンルを併せてご記入いただくと、より早くご案内できます。",
  "contact.kakao": "KakaoTalkで相談",
  "contact.instagram": "InstagramのDM",

  "jsonld.service_name": "deetz ダンサーキャスティング・振付制作",
  "jsonld.service_description":
    "MV・広告・ステージ・放送・イベントに必要なダンサーの手配、振付制作、振付師の手配、ダンスチームの手配、ダンス公演の手配を、ポートフォリオをもとにつなぐプラットフォームです。",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
