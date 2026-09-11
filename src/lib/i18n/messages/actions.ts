import type { Messages } from "../t";

/**
 * 서버 액션 오류·성공 문구 (docs/design-i18n-ui.md §3.5).
 * 액션은 `const t = await serverT(actions)` 로 요청 언어 문장을 만들어 `error`/`message` 에 담아 반환한다.
 * 키 이름은 `<액션군>.<상황>`. S4 가 actions/*.ts 의 문구를 여기로 옮긴다.
 */
const ko = {
  "common.invalid_input": "입력값을 확인해 주세요.",
  "common.login_required": "로그인이 필요합니다.",
  "common.session_missing": "로그인 세션을 찾을 수 없습니다.",
  "common.forbidden": "권한이 없습니다.",
  "common.not_found": "찾을 수 없습니다.",
  "common.failed": "처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.",
  "common.saved": "저장했어요.",

  "auth.email_taken": "이미 가입된 이메일입니다.",
  "auth.login_failed": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "auth.email_invalid": "올바른 이메일 주소를 입력해 주세요.",
  "auth.password_length": "비밀번호는 8~72자여야 합니다.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "common.invalid_input": "Please check your input.",
  "common.login_required": "Please log in.",
  "common.session_missing": "We could not find your login session.",
  "common.forbidden": "You do not have permission to do this.",
  "common.not_found": "Not found.",
  "common.failed": "Something went wrong. Please try again in a moment.",
  "common.saved": "Saved.",

  "auth.email_taken": "This email is already registered.",
  "auth.login_failed": "The email or password is incorrect.",
  "auth.email_invalid": "Please enter a valid email address.",
  "auth.password_length": "Password must be 8 to 72 characters.",
};

const ja: Record<Key, string> = {
  "common.invalid_input": "入力内容をご確認ください。",
  "common.login_required": "ログインが必要です。",
  "common.session_missing": "ログインセッションが見つかりません。",
  "common.forbidden": "権限がありません。",
  "common.not_found": "見つかりませんでした。",
  "common.failed": "処理中に問題が発生しました。しばらくしてからもう一度お試しください。",
  "common.saved": "保存しました。",

  "auth.email_taken": "このメールアドレスはすでに登録されています。",
  "auth.login_failed": "メールアドレスまたはパスワードが正しくありません。",
  "auth.email_invalid": "正しいメールアドレスを入力してください。",
  "auth.password_length": "パスワードは8〜72文字で入力してください。",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
