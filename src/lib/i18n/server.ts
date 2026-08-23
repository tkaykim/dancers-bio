import "server-only";
import { headers } from "next/headers";
import { resolveLocale, type Locale } from "./locale";

/**
 * 요청의 Accept-Language 헤더. 공고 본문으로 언어를 못 정할 때의 차선책이다.
 * 헤더를 못 읽어도(정적 렌더 등) 접수를 막을 이유는 없으므로 null 로 흘린다.
 */
export async function acceptLanguage(): Promise<string | null> {
  try {
    return (await headers()).get("accept-language");
  } catch {
    return null;
  }
}

/** 공고 본문(있으면)과 Accept-Language 를 함께 보고 언어를 정한다. */
export async function localeFor(
  ...text: Array<string | null | undefined>
): Promise<Locale> {
  return resolveLocale({ text, acceptLanguage: await acceptLanguage() });
}
