import type { Messages } from "../t";

/** 셸·탭바·사이드바·언어 전환기·설치 안내. */
const ko = {
  "tab.casting": "캐스팅",
  "tab.dancers": "댄서",
  "tab.applications": "내 지원",
  "tab.me": "나",
  "tab.messages": "메시지",

  "side.casting": "Casting",
  "side.casting.sub": "모집 공고",
  "side.dancers": "Dancers",
  "side.dancers.sub": "댄서 / 팀",
  "side.magazine": "Magazine",
  "side.magazine.sub": "Deetz TV",
  "side.applications": "Applications",
  "side.applications.sub": "내 지원",
  "side.me": "My",
  "side.me.sub": "프로필",
  "side.messages": "Messages",
  "side.messages.sub": "메시지",
  "side.client": "Client",
  "side.new_project": "공고 개설",
  "side.brand_sub": "Magazine / Casting",

  "lang.switcher": "언어 선택",
  "lang.switch_failed": "언어를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.",
  "lang.setting_title": "언어",
  "lang.setting_desc": "화면 언어를 고르면 이 계정에 저장돼요.",

  "install.title": "deetz 앱으로 설치",
  "install.body": "홈 화면에 추가하면 앱처럼 빠르게 열 수 있어요.",
  "install.cta": "설치",
  "install.later": "나중에",

  "push.title": "새 캐스팅 알림 받기",
  "push.body": "관심 장르의 새 공고와 제안을 놓치지 않게 알려드려요.",
  "push.cta": "알림 켜기",
  "push.later": "나중에",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "tab.casting": "Casting",
  "tab.dancers": "Dancers",
  "tab.applications": "Applied",
  "tab.me": "Me",
  "tab.messages": "Messages",

  "side.casting": "Casting",
  "side.casting.sub": "Casting calls",
  "side.dancers": "Dancers",
  "side.dancers.sub": "Dancers / teams",
  "side.magazine": "Magazine",
  "side.magazine.sub": "Deetz TV",
  "side.applications": "Applications",
  "side.applications.sub": "My applications",
  "side.me": "My",
  "side.me.sub": "Profile",
  "side.messages": "Messages",
  "side.messages.sub": "Messages",
  "side.client": "Client",
  "side.new_project": "Post a casting call",
  "side.brand_sub": "Magazine / Casting",

  "lang.switcher": "Language",
  "lang.switch_failed": "We could not change the language. Please try again in a moment.",
  "lang.setting_title": "Language",
  "lang.setting_desc": "Your choice is saved to this account.",

  "install.title": "Install the deetz app",
  "install.body": "Add it to your home screen to open it like an app.",
  "install.cta": "Install",
  "install.later": "Later",

  "push.title": "Get casting alerts",
  "push.body": "We will let you know about new casting calls and offers in your genres.",
  "push.cta": "Turn on alerts",
  "push.later": "Later",
};

const ja: Record<Key, string> = {
  "tab.casting": "募集",
  "tab.dancers": "ダンサー",
  "tab.applications": "応募",
  "tab.me": "マイ",
  "tab.messages": "メッセージ",

  "side.casting": "Casting",
  "side.casting.sub": "募集一覧",
  "side.dancers": "Dancers",
  "side.dancers.sub": "ダンサー / チーム",
  "side.magazine": "Magazine",
  "side.magazine.sub": "Deetz TV",
  "side.applications": "Applications",
  "side.applications.sub": "応募履歴",
  "side.me": "My",
  "side.me.sub": "プロフィール",
  "side.messages": "Messages",
  "side.messages.sub": "メッセージ",
  "side.client": "Client",
  "side.new_project": "募集を作成",
  "side.brand_sub": "Magazine / Casting",

  "lang.switcher": "言語を選択",
  "lang.switch_failed": "言語を変更できませんでした。しばらくしてからもう一度お試しください。",
  "lang.setting_title": "言語",
  "lang.setting_desc": "選んだ言語はこのアカウントに保存されます。",

  "install.title": "deetzアプリをインストール",
  "install.body": "ホーム画面に追加するとアプリのようにすぐ開けます。",
  "install.cta": "インストール",
  "install.later": "あとで",

  "push.title": "募集の通知を受け取る",
  "push.body": "関心のあるジャンルの新しい募集やオファーをお知らせします。",
  "push.cta": "通知をオンにする",
  "push.later": "あとで",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
