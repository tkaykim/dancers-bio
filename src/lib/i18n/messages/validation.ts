import type { Messages } from "../t";

/**
 * zod 메시지 키와 입력 검증 오류 (docs/design-i18n-ui.md §3.5).
 * zod 스키마에는 값 대신 키를 넣는다: z.string().min(1, "v.name_required")
 * 서버 액션은 localizeZodError() 로, 클라이언트는 useT(validation) 로 번역한다.
 * 키 이름은 `v.<대상>_<조건>`. S4 가 lib/validation/*.ts 의 메시지를 여기로 옮긴다.
 */
const ko = {
  "v.invalid_input": "입력값을 확인해 주세요.",
  "v.required": "필수 입력 항목이에요.",
  "v.too_long": "너무 길어요.",
  "v.too_short": "너무 짧아요.",
  "v.email_invalid": "이메일 형식을 확인해 주세요.",
  "v.url_invalid": "올바른 링크 주소를 입력해 주세요.",
  "v.number_invalid": "숫자만 입력해 주세요.",
  "v.password_length": "비밀번호는 8~72자여야 합니다.",

  "v.phone_required": "휴대폰 번호를 입력해 주세요.",
  "v.phone_country": "국가와 전화번호를 다시 확인해 주세요.",
  "v.phone_invalid": "올바른 휴대폰 번호를 입력해 주세요.",
} as const;

type Key = keyof typeof ko;

const en: Record<Key, string> = {
  "v.invalid_input": "Please check your input.",
  "v.required": "This field is required.",
  "v.too_long": "This is too long.",
  "v.too_short": "This is too short.",
  "v.email_invalid": "Please check the email format.",
  "v.url_invalid": "Please enter a valid link.",
  "v.number_invalid": "Please enter numbers only.",
  "v.password_length": "Password must be 8 to 72 characters.",

  "v.phone_required": "Enter your mobile number.",
  "v.phone_country": "Check the country and phone number.",
  "v.phone_invalid": "Enter a valid mobile number.",
};

const ja: Record<Key, string> = {
  "v.invalid_input": "入力内容をご確認ください。",
  "v.required": "必須項目です。",
  "v.too_long": "長すぎます。",
  "v.too_short": "短すぎます。",
  "v.email_invalid": "メールアドレスの形式をご確認ください。",
  "v.url_invalid": "正しいリンクを入力してください。",
  "v.number_invalid": "数字のみ入力してください。",
  "v.password_length": "パスワードは8〜72文字で入力してください。",

  "v.phone_required": "携帯電話番号を入力してください。",
  "v.phone_country": "国と電話番号をもう一度ご確認ください。",
  "v.phone_invalid": "正しい携帯電話番号を入力してください。",
};

const messages = { ko, en, ja } satisfies Messages<Key>;
export default messages;
