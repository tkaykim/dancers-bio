"use client";

/**
 * 클라이언트 언어 컨텍스트. 서버(루트 레이아웃)가 정한 값을 그대로 받는다.
 *
 * 클라이언트에서 navigator.language 나 localStorage 로 언어를 다시 정하지 않는다 —
 * 서버 렌더와 첫 클라이언트 렌더가 달라지면 hydration 경고가 난다(docs/design-i18n-ui.md §3.4).
 *
 *   const t = useT(messages);            // 전역 문구: UI 언어
 *   const lang = useRequestedLocale();   // 기존 다국어 기능(비자·워크숍·빌리지…): 요청 언어
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { translator, type Messages, type Translator } from "./t";

type LocaleContextValue = {
  /** 전역 문구가 쓰는 언어(운영 경로 강제 ko·플래그 적용 후). */
  locale: Locale;
  /** 이용자가 원한 언어(강등 전). 기능 사전용. */
  requested: Locale;
  /** 플래그로 열린 언어. 전환기 메뉴에 노출할 목록. */
  enabled: readonly Locale[];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  requested,
  enabled,
  children,
}: LocaleContextValue & { children: ReactNode }) {
  // enabled 는 서버가 만든 배열이라 참조가 렌더마다 바뀔 수 있어 내용(문자열)으로 비교한다.
  const enabledKey = enabled.join(",");
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, requested, enabled: enabledKey.split(",") as Locale[] }),
    [locale, requested, enabledKey],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== "production") {
      throw new Error("[i18n] LocaleProvider 가 없습니다. 루트 레이아웃 안에서만 useT/useLocale 을 쓰세요.");
    }
    return { locale: DEFAULT_LOCALE, requested: DEFAULT_LOCALE, enabled: [DEFAULT_LOCALE] };
  }
  return ctx;
}

export function useLocale(): Locale {
  return useLocaleContext().locale;
}

export function useRequestedLocale(): Locale {
  return useLocaleContext().requested;
}

export function useEnabledLocales(): readonly Locale[] {
  return useLocaleContext().enabled;
}

export function useT<M extends Messages>(messages: M): Translator<M> {
  const locale = useLocale();
  return useMemo(() => translator(messages, locale), [messages, locale]);
}

/** 요청 언어로 번역하는 훅. 기존 다국어 기능 화면에서만 쓴다. */
export function useRequestedT<M extends Messages>(messages: M): Translator<M> {
  const locale = useRequestedLocale();
  return useMemo(() => translator(messages, locale), [messages, locale]);
}
