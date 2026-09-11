import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  REQUESTED_LOCALE_HEADER,
  UI_LOCALE_HEADER,
  detectLocaleFromText,
  isLocale,
  type Locale,
} from "./locale";
import { translator, type Messages, type Translator } from "./t";

/**
 * 서버 컴포넌트·서버 액션·라우트 핸들러에서 언어를 읽는다.
 *
 * 미들웨어가 요청 헤더 `x-locale`(UI 언어)·`x-locale-requested`(요청 언어)를 세팅한다.
 * `cache` 는 한 렌더 안에서 중복 호출을 줄일 뿐이다. 서버 액션 컨텍스트에서는 캐시 없이
 * 매번 헤더를 읽는다(React.cache 는 렌더 요청 단위).
 * 헤더를 못 읽는 경우(정적 렌더 등)에도 화면을 막지 않도록 ko 로 떨어진다.
 */
async function readLocaleHeader(name: string): Promise<Locale> {
  try {
    const value = (await headers()).get(name);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** 전역 문구용 UI 언어(운영 경로 강제 ko·플래그 적용 후). */
export const getLocale = cache((): Promise<Locale> => readLocaleHeader(UI_LOCALE_HEADER));

/** 강등 전 요청 언어. 기존 다국어 기능(비자·워크숍·빌리지·프로그램·간편접수·영상제출)용. */
export const getRequestedLocale = cache(
  (): Promise<Locale> => readLocaleHeader(REQUESTED_LOCALE_HEADER),
);

/** UI 언어로 번역하는 함수를 만든다. */
export async function serverT<M extends Messages>(messages: M): Promise<Translator<M>> {
  return translator(messages, await getLocale());
}

/** 요청 언어로 번역하는 함수. 기능 사전에서만 쓴다. */
export async function requestedT<M extends Messages>(messages: M): Promise<Translator<M>> {
  return translator(messages, await getRequestedLocale());
}

/** 현재 경로(미들웨어가 `x-pathname` 으로 넘긴다). 못 읽으면 "/" */
export const getPathname = cache(async (): Promise<string> => {
  try {
    return (await headers()).get("x-pathname") ?? "/";
  } catch {
    return "/";
  }
});

/**
 * 요청의 Accept-Language 헤더. 옛 호출자 호환용이며 새 코드는 getRequestedLocale() 을 쓴다.
 */
export async function acceptLanguage(): Promise<string | null> {
  try {
    return (await headers()).get("accept-language");
  } catch {
    return null;
  }
}

/**
 * 공고 본문(있으면)의 언어를 먼저 보고, 판단이 안 서면 요청 언어로 떨어진다.
 * /apply·/submit 처럼 특정 공고를 위한 외부 진입점이 쓴다(docs/design-i18n-ui.md §3.2 예외).
 */
export async function localeFor(
  ...text: Array<string | null | undefined>
): Promise<Locale> {
  return detectLocaleFromText(...text) ?? (await getRequestedLocale());
}
