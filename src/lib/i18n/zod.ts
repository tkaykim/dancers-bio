import type { ZodError, ZodIssue } from "zod";
import { type Locale } from "./locale";
import { translator } from "./t";
import validation from "./messages/validation";

/**
 * zod 검증 실패를 사용자 언어 문장으로 바꾼다 (docs/design-i18n-ui.md §3.5).
 *
 * 스키마 메시지 자리에 사전 키("v.name_required")를 넣어 두면 여기서 번역한다.
 * 키가 아닌 zod 기본 문구("Required" 등)는 영문으로 새어 나가므로 `v.invalid_input` 으로 뭉뚱그린다.
 * (quick-apply.ts 의 isMessageKey 패턴을 공용으로 옮긴 것)
 */
export function isValidationKey(value: unknown): value is keyof typeof validation.ko {
  return typeof value === "string" && Object.hasOwn(validation.ko, value);
}

export function localizeIssue(issue: ZodIssue | undefined, locale: Locale): string {
  const t = translator(validation, locale);
  const msg = issue?.message;
  return isValidationKey(msg) ? t(msg) : t("v.invalid_input");
}

/** 첫 번째 이슈를 번역한다. 서버 액션의 `error` 반환용. */
export function localizeZodError(error: ZodError, locale: Locale): string {
  return localizeIssue(error.issues[0], locale);
}

/** 사전 키이면 번역하고, 아니면 그대로 돌려준다. 이미 문장인 값과 키가 섞인 곳에서 쓴다. */
export function localizeMessage(value: string, locale: Locale): string {
  return isValidationKey(value) ? translator(validation, locale)(value) : value;
}
