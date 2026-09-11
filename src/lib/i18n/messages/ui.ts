import type { Messages } from "../t";

/**
 * 공용 UI 프리미티브(`components/ui/*`)의 접근성 라벨·기본 문구.
 *
 * 이 값들은 대부분 prop 기본값이다. 호출처가 넘긴 값이 있으면 그것을 우선하고,
 * 없을 때만 여기 문구를 쓴다(기본값 자리에서는 훅을 부를 수 없으므로 본문에서 `??` 로 채운다).
 */
const ko = {
  "back.aria": "뒤로",

  "sheet.close": "닫기",
  "drawer.close": "닫기",

  "priority.order_title": "선택 순서 (위일수록 높은 우선순위)",
  "priority.move_up": "위로",
  "priority.move_down": "아래로",
  "priority.remove": "제거",

  "select.placeholder": "선택",
  "select.search_placeholder": "검색...",
  "select.clear": "선택 해제",
  "select.no_results": "검색 결과가 없습니다.",

  "email_typo.label": "혹시",
  "email_typo.suffix": " 아닌가요?",
  "email_typo.action": "이걸로 고치기",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "back.aria": "Back",

  "sheet.close": "Close",
  "drawer.close": "Close",

  "priority.order_title": "Order of choice (higher is higher priority)",
  "priority.move_up": "Move up",
  "priority.move_down": "Move down",
  "priority.remove": "Remove",

  "select.placeholder": "Select",
  "select.search_placeholder": "Search...",
  "select.clear": "Clear selection",
  "select.no_results": "No results.",

  "email_typo.label": "Did you mean",
  "email_typo.suffix": "?",
  "email_typo.action": "Use this instead",
};

const ja: Record<Key, string> = {
  "back.aria": "戻る",

  "sheet.close": "閉じる",
  "drawer.close": "閉じる",

  "priority.order_title": "選んだ順序（上ほど優先度が高い）",
  "priority.move_up": "上へ",
  "priority.move_down": "下へ",
  "priority.remove": "削除",

  "select.placeholder": "選択",
  "select.search_placeholder": "検索...",
  "select.clear": "選択を解除",
  "select.no_results": "該当する項目がありません。",

  "email_typo.label": "もしかして",
  "email_typo.suffix": " ではありませんか。",
  "email_typo.action": "これに修正する",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
