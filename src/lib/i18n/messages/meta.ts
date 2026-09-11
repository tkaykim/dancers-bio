import type { Messages } from "../t";

/**
 * 사이트 제목·설명·OG. 루트 레이아웃과 홈의 generateMetadata 가 쓴다.
 * 공고·프로필 제목은 이용자 작성 원문을 그대로 쓰므로 여기 없다.
 */
const ko = {
  "site.title": "deetz | 댄서 섭외·안무 제작 플랫폼",
  "site.title_short": "deetz",
  "site.description":
    "MV·광고·무대·방송 댄서 섭외와 안무 제작·안무가·댄스팀 섭외를 연결하는 댄서 캐스팅 플랫폼, 디츠(deetz).",
  "home.title": "deetz(디츠) | 댄서 섭외·캐스팅·안무 제작 플랫폼",
  "home.description":
    "디츠(deetz)는 MV, 광고, 무대, 방송 댄서 섭외와 안무 제작·안무가·댄스팀 섭외를 연결하는 댄서 캐스팅 플랫폼.",
  "feed.title": "캐스팅 공고",
  "feed.description": "지금 모집 중인 댄서·안무가·댄스팀 캐스팅 공고를 확인하고 지원하세요.",
  "dancers.title": "댄서 디렉토리",
  "dancers.description": "장르·지역별 댄서와 댄스팀 프로필을 찾아보세요.",
  "login.title": "로그인",
  "signup.title": "회원가입",
  "me.title": "내 계정",
  "applications.title": "내 지원",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "site.title": "deetz | Dancer casting & choreography platform",
  "site.title_short": "deetz",
  "site.description":
    "deetz connects dancers, choreographers and dance teams with music videos, ads, stages and broadcasts in Korea.",
  "home.title": "deetz | Dancer casting, choreography & dance team booking in Korea",
  "home.description":
    "deetz is a casting platform that connects dancers, choreographers and dance teams with music videos, ads, stages and broadcasts.",
  "feed.title": "Casting calls",
  "feed.description": "Browse open casting calls for dancers, choreographers and dance teams and apply.",
  "dancers.title": "Dancer directory",
  "dancers.description": "Find dancer and dance team profiles by genre and region.",
  "login.title": "Log in",
  "signup.title": "Sign up",
  "me.title": "My account",
  "applications.title": "My applications",
};

const ja: Record<Key, string> = {
  "site.title": "deetz | ダンサーキャスティング・振付制作プラットフォーム",
  "site.title_short": "deetz",
  "site.description":
    "deetzは韓国のMV・広告・ステージ・放送のダンサー、振付師、ダンスチームをつなぐキャスティングプラットフォームです。",
  "home.title": "deetz | 韓国のダンサーキャスティング・振付制作・ダンスチーム手配",
  "home.description":
    "deetzは韓国のMV・広告・ステージ・放送のダンサー、振付師、ダンスチームをつなぐキャスティングプラットフォームです。",
  "feed.title": "募集一覧",
  "feed.description": "募集中のダンサー・振付師・ダンスチームの募集を確認して応募できます。",
  "dancers.title": "ダンサー一覧",
  "dancers.description": "ジャンル・地域からダンサーとダンスチームのプロフィールを探せます。",
  "login.title": "ログイン",
  "signup.title": "会員登録",
  "me.title": "マイアカウント",
  "applications.title": "応募履歴",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
