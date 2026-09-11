"use client";

import { useEffect } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";

/**
 * 옛 기능별 localStorage 언어 키를 쿠키로 한 번만 옮긴다 (docs/design-i18n-ui.md §3.8, §3.4 예외).
 * 조건: 쿠키가 없고 URL 에 ?lang= 도 없을 때. hydration 이후 effect 에서 실행하며 첫 렌더를 바꾸지 않는다.
 * 먼저 키를 지우고 그다음 액션을 부른다. 액션이 실패하면 Accept-Language 결과를 그대로 쓴다.
 */
const LEGACY_KEYS = ["deetz_program_lang", "deetz_village_lang", "deetz_ws_lang"] as const;

export function LegacyLocaleMigration() {
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("lang")) return;
      if (document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`))) return;
      let saved: string | null = null;
      for (const key of LEGACY_KEYS) {
        const v = localStorage.getItem(key);
        if (v && !saved) saved = v;
        localStorage.removeItem(key);
      }
      if (!isLocale(saved)) return;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      // 성공하면 redirect 로 화면이 새 언어로 다시 온다. 실패는 조용히 무시한다.
      void setLocaleAction(saved, currentUrl).catch(() => {});
    } catch {
      // localStorage 접근 불가(프라이빗 모드 등)면 아무것도 하지 않는다.
    }
  }, []);
  return null;
}
