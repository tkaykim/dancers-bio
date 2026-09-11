"use server";

import { cookies } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";

/**
 * 언어 전환 (docs/design-i18n-ui.md §3.8).
 *
 * 순서: ① 로그인 상태면 profiles.preferred_lang 갱신(실패하면 쿠키를 건드리지 않고 반환)
 *       ② 쿠키 세팅  ③ `lang` 파라미터를 뺀 현재 URL 로 redirect(replace).
 *
 * 서버 액션에서 쿠키만 바꾸면 Next 가 액션 응답에 현재 페이지 렌더를 포함하지만 그 렌더는
 * 옛 x-locale 을 쓴다. 그래서 응답 렌더에 기대지 않고 redirect 로 새 요청을 만든다.
 * 성공한 redirect 는 클라이언트에서 액션 Promise 의 rejection 으로 전달되므로(Next 내부),
 * 호출부는 rejection 을 실패로 잡지 않고 반환값 `{ ok: false }` 만 실패로 본다.
 */
export type SetLocaleResult = { ok: false; error: string };

export async function setLocaleAction(
  locale: unknown,
  currentUrl: unknown,
): Promise<SetLocaleResult | undefined> {
  if (!isLocale(locale)) {
    return { ok: false, error: "unsupported_locale" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // profiles_update_self(id = auth.uid()) 정책으로 본인 행만 갱신된다.
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_lang: locale })
      .eq("id", user.id);
    if (error) {
      return { ok: false, error: error.message };
    }
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });

  redirect(cleanInternalUrl(currentUrl), RedirectType.replace);
}

/**
 * 내부 경로만 허용하고 `lang` 파라미터만 제거한다. 나머지 쿼리·해시는 보존한다.
 * 외부 URL·프로토콜 상대 URL(//host)·잘못된 값은 "/" 로 떨어진다.
 * ("use server" 파일에서 export 하지 않는 동기 헬퍼)
 */
function cleanInternalUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  try {
    const url = new URL(raw, "http://deetz.local");
    if (url.origin !== "http://deetz.local") return "/";
    url.searchParams.delete("lang");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
