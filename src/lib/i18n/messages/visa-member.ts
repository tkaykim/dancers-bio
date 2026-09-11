import type { Messages } from "../t";

/**
 * `/me/visa` 의 빈 상태 — 국적 조건은 맞지만 아직 연결된 비자 케이스가 없는 회원이 보는 화면.
 *
 * 이 화면은 요청 언어를 따른다(docs/design-i18n-ui.md §3.8). 호출부는
 * `translator(visaMember, await getRequestedLocale())` 로 명시한다 —
 * 전역 UI 언어(`serverT`)가 아니라 이용자가 원한 언어여야 하기 때문이다.
 * 케이스가 있는 화면(여정 타임라인)은 저장된 케이스 언어를 쓰므로 여기 담지 않는다.
 */
const ko = {
  "empty.back": "내 계정",
  "empty.eyebrow": "비자 & 한국",
  "empty.title": "비자 프로그램 안내부터 시작해 보세요",
  "empty.body":
    "국적 정보 기준으로는 이 영역을 보실 수 있지만, 아직 계정에 연결된 비자 프로그램 케이스가 없습니다.",
  "empty.cta": "프로그램 보기",
  "empty.disclaimer":
    "프로그램 참여가 비자 발급, 취업, 프로젝트 참여를 보장하지는 않습니다.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "empty.back": "My page",
  "empty.eyebrow": "Visa & Korea",
  "empty.title": "Start with the visa program guide",
  "empty.body":
    "Your nationality profile is eligible to view this area, but no visa program case is connected to your account yet.",
  "empty.cta": "View the program",
  "empty.disclaimer":
    "Program participation does not guarantee a visa, employment, or project placement.",
};

const ja: Record<Key, string> = {
  "empty.back": "マイページ",
  "empty.eyebrow": "ビザ・韓国",
  "empty.title": "ビザプログラムのご案内から始めましょう",
  "empty.body":
    "国籍の情報ではこの領域をご覧いただけますが、アカウントに紐づくビザプログラムのケースがまだありません。",
  "empty.cta": "プログラムを見る",
  "empty.disclaimer":
    "プログラムへの参加が、ビザの発給・就業・プロジェクトへの参加を保証するものではありません。",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
