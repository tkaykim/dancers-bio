import type { Messages } from "../t";

/**
 * 댄서·팀 디렉터리(`/dancers`) 문구 (docs/design-i18n-ui.md §3.4 "directory").
 * 공개 프로필(`/d`·`/t`·`/u`)은 `profile` 네임스페이스다.
 */
const ko = {
  // 메타데이터 — 제목·설명은 meta 네임스페이스(dancers.title·dancers.description).
  "meta.keywords":
    "댄서 포트폴리오,댄스팀 섭외,댄서 섭외,댄서 플랫폼,안무가 섭외,K-POP 댄서,디츠,deetz",

  "header.eyebrow": "↳ 디렉토리",
  "header.title": "댄서 / 팀 찾기",

  "tab.dancers": "개인",
  "tab.teams": "팀",

  "search.placeholder_dancers": "활동명, 한글 이름 검색",
  "search.placeholder_teams": "팀명 검색",

  "count.dancers": "총 {total}명 중 {shown}명 표시",
  "count.teams": "총 {total}팀 중 {shown}팀 표시",

  "empty.search": "검색 결과가 없습니다.",
  "empty.dancers": "아직 등록된 댄서가 없습니다.",
  "empty.teams": "아직 등록된 팀이 없습니다.",

  "badge.curation": "큐레이션",
  "badge.team": "팀",

  "more.loading": "불러오는 중…",
  "more.label": "더 보기",

  "cap.title": "더 많은 댄서가 필요하신가요?",
  "cap.body_limit": "공개 디렉토리에는 {count}명까지 표시됩니다.",
  "cap.body_notice": "전체 명단은 공개하지 않고, 목적을 확인한 뒤 개별적으로 안내드립니다.",
  "cap.requested": "문의 접수됨 ✓",
  "cap.cta_member": "목적 선택하고 문의하기",
  "cap.cta_guest": "로그인하고 문의하기",

  "request.purpose_question": "어떤 목적으로 찾고 계신가요?",
  "purpose.profile_check.label": "내 프로필이 잘 등록되었는지 확인하고 싶어요",
  "purpose.profile_check.description": "내 공개 프로필 링크를 확인하고 SNS에 공유할 수 있어요.",
  "purpose.casting.label": "캐스팅·섭외할 댄서나 팀을 찾고 있어요",
  "purpose.casting.description": "프로젝트와 찾는 조건을 남겨주시면 검토 후 연락드려요.",
  "purpose.collaboration.label": "협업·제휴를 제안하고 싶어요",
  "purpose.collaboration.description": "제안 내용을 남겨주시면 담당자가 확인 후 연락드려요.",
  "request.details_label": "구체적인 내용을 적어주세요.",
  "request.details_placeholder":
    "프로젝트·회사명, 찾는 장르/조건, 예상 일정, 협업 내용 등을 적어주세요.",
  "request.notice": "작성해주신 내용을 확인한 뒤 deetz 운영팀이 이메일로 연락드립니다.",
  "request.sending": "전송 중…",
  "request.submit": "문의 접수하기",
  "request.pick_purpose": "목적을 선택하면 필요한 안내가 표시됩니다.",
  "request.success": "문의가 접수되었습니다. 검토 후 연락드리겠습니다.",

  "profile_link.title": "내 공개 프로필",
  "profile_link.hint": "두 링크 중 하나를 SNS 프로필에 등록해두시면 됩니다.",
  "profile_link.deetz": "deetz.kr 프로필 보기",
  "profile_link.dancers_bio": "dancers.bio 프로필 보기",
  "profile_link.empty": "아직 연결된 댄서 프로필이 없습니다.",
  "profile_link.create": "내 프로필 확인·등록하기",

  "grid.retry": "다시 시도",
  "grid.loading_more": "더 불러오는 중",
  "grid.end": "마지막입니다.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "meta.keywords":
    "dancer portfolio,dance team booking,dancer booking,dancer platform,choreographer booking,K-POP dancer,deetz",

  "header.eyebrow": "↳ Directory",
  "header.title": "Find dancers & teams",

  "tab.dancers": "Individuals",
  "tab.teams": "Teams",

  "search.placeholder_dancers": "Search stage name or Korean name",
  "search.placeholder_teams": "Search team name",

  "count.dancers": "Showing {shown} of {total} dancers",
  "count.teams": "Showing {shown} of {total} teams",

  "empty.search": "No results.",
  "empty.dancers": "No dancers have been listed yet.",
  "empty.teams": "No teams have been listed yet.",

  "badge.curation": "Curated",
  "badge.team": "Team",

  "more.loading": "Loading…",
  "more.label": "Show more",

  "cap.title": "Need more dancers?",
  "cap.body_limit": "The public directory shows up to {count} dancers.",
  "cap.body_notice":
    "We do not publish the full roster. Tell us what you need and we will get back to you individually.",
  "cap.requested": "Request received ✓",
  "cap.cta_member": "Pick a purpose and contact us",
  "cap.cta_guest": "Log in to contact us",

  "request.purpose_question": "What are you looking for?",
  "purpose.profile_check.label": "I want to check that my profile is listed correctly",
  "purpose.profile_check.description":
    "You can check your public profile link and share it on social media.",
  "purpose.casting.label": "I am looking for dancers or teams to cast",
  "purpose.casting.description":
    "Tell us about the project and what you need, and we will get back to you.",
  "purpose.collaboration.label": "I want to propose a collaboration or partnership",
  "purpose.collaboration.description":
    "Leave your proposal and our team will review it and get back to you.",
  "request.details_label": "Tell us the details.",
  "request.details_placeholder":
    "Project or company name, the genre and requirements you are looking for, expected dates, what the collaboration involves.",
  "request.notice": "The deetz team reviews your request and replies by email.",
  "request.sending": "Sending…",
  "request.submit": "Send request",
  "request.pick_purpose": "Pick a purpose to see what happens next.",
  "request.success": "We received your request. We will get back to you after reviewing it.",

  "profile_link.title": "My public profile",
  "profile_link.hint": "Add either of these links to your social profile.",
  "profile_link.deetz": "View deetz.kr profile",
  "profile_link.dancers_bio": "View dancers.bio profile",
  "profile_link.empty": "No dancer profile is linked to your account yet.",
  "profile_link.create": "Check or create my profile",

  "grid.retry": "Try again",
  "grid.loading_more": "Loading more",
  "grid.end": "That is everything.",
};

const ja: Record<Key, string> = {
  "meta.keywords":
    "ダンサー ポートフォリオ,ダンスチーム 依頼,ダンサー 依頼,ダンサー プラットフォーム,振付師 依頼,K-POP ダンサー,deetz",

  "header.eyebrow": "↳ ディレクトリ",
  "header.title": "ダンサー・チームを探す",

  "tab.dancers": "個人",
  "tab.teams": "チーム",

  "search.placeholder_dancers": "活動名・韓国語の名前で検索",
  "search.placeholder_teams": "チーム名で検索",

  "count.dancers": "全{total}名中{shown}名を表示",
  "count.teams": "全{total}チーム中{shown}チームを表示",

  "empty.search": "検索結果がありません。",
  "empty.dancers": "登録されたダンサーはまだいません。",
  "empty.teams": "登録されたチームはまだありません。",

  "badge.curation": "キュレーション",
  "badge.team": "チーム",

  "more.loading": "読み込み中…",
  "more.label": "もっと見る",

  "cap.title": "もっと多くのダンサーをお探しですか？",
  "cap.body_limit": "公開ディレクトリでは{count}名まで表示されます。",
  "cap.body_notice":
    "全リストは公開しておりません。目的をうかがったうえで個別にご案内します。",
  "cap.requested": "受付完了 ✓",
  "cap.cta_member": "目的を選んで問い合わせる",
  "cap.cta_guest": "ログインして問い合わせる",

  "request.purpose_question": "どのような目的でお探しですか？",
  "purpose.profile_check.label": "自分のプロフィールが正しく登録されているか確認したい",
  "purpose.profile_check.description":
    "公開プロフィールのリンクを確認し、SNSで共有できます。",
  "purpose.casting.label": "キャスティングするダンサーやチームを探している",
  "purpose.casting.description":
    "プロジェクトと希望条件をお送りいただければ、確認のうえご連絡します。",
  "purpose.collaboration.label": "協業・提携を提案したい",
  "purpose.collaboration.description":
    "ご提案の内容をお送りいただければ、担当者が確認してご連絡します。",
  "request.details_label": "具体的な内容をご記入ください。",
  "request.details_placeholder":
    "プロジェクト・会社名、お探しのジャンルや条件、想定スケジュール、協業の内容などをご記入ください。",
  "request.notice": "いただいた内容を確認のうえ、deetz運営チームからメールでご連絡します。",
  "request.sending": "送信中…",
  "request.submit": "問い合わせを送る",
  "request.pick_purpose": "目的を選ぶと必要なご案内が表示されます。",
  "request.success": "お問い合わせを受け付けました。確認のうえご連絡します。",

  "profile_link.title": "公開プロフィール",
  "profile_link.hint": "2つのリンクのどちらかをSNSプロフィールに登録してください。",
  "profile_link.deetz": "deetz.krのプロフィールを見る",
  "profile_link.dancers_bio": "dancers.bioのプロフィールを見る",
  "profile_link.empty": "まだ連携されたダンサープロフィールがありません。",
  "profile_link.create": "プロフィールを確認・登録する",

  "grid.retry": "もう一度試す",
  "grid.loading_more": "さらに読み込み中",
  "grid.end": "以上です。",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
