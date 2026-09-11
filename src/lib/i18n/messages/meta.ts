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
  "feed.title": "댄서 섭외 공고·캐스팅 콜 | deetz(디츠)",
  "feed.description":
    "디츠(deetz)에 등록된 댄서 섭외·캐스팅 공고를 한 곳에서. MV, 광고, 무대, 방송, 행사 백댄서 섭외와 안무 제작, 안무가 섭외, 댄스팀 섭외 공고를 확인하고 포트폴리오로 지원하세요.",
  "dancers.title": "댄서·댄스팀 포트폴리오 디렉토리 | deetz(디츠)",
  "dancers.description":
    "디츠(deetz)에서 검증된 댄서와 댄스팀의 경력·영상 포트폴리오를 확인하세요. 댄서 섭외, 댄스팀 섭외, 안무가 섭외에 맞는 프로필을 비교하고 캐스팅할 수 있는 댄서 플랫폼입니다.",
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
  "feed.title": "Casting calls for dancers & choreographers | deetz",
  "feed.description":
    "Browse open casting calls on deetz for music videos, ads, stages, broadcasts and events. Find dancer, backup dancer, choreographer and dance team casting calls and apply with your portfolio.",
  "dancers.title": "Dancer & dance team portfolio directory | deetz",
  "dancers.description":
    "Browse verified dancers and dance teams on deetz with their credits and video portfolios. Compare profiles for dancer, dance team and choreographer casting and book the right fit.",
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
  "feed.title": "ダンサー募集・キャスティング一覧 | deetz",
  "feed.description":
    "deetzに掲載されたダンサー募集・キャスティングを一か所で。MV・広告・ステージ・放送・イベントのバックダンサー、振付制作、振付師、ダンスチームの募集を確認し、ポートフォリオで応募できます。",
  "dancers.title": "ダンサー・ダンスチームのポートフォリオ一覧 | deetz",
  "dancers.description":
    "deetzで認証済みのダンサーとダンスチームの経歴・映像ポートフォリオを確認できます。ダンサー・ダンスチーム・振付師の手配に合うプロフィールを比較してキャスティングできるダンサープラットフォームです。",
  "login.title": "ログイン",
  "signup.title": "会員登録",
  "me.title": "マイアカウント",
  "applications.title": "応募履歴",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
