"use client";

import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * PWA 자동 로그아웃 완화 (oneshotcrew 패턴 포팅).
 *  1) 앱 부팅 시 refreshSession() 1회 — cold-start race 방지.
 *  2) visibilitychange === 'visible' / focus 마다 — 백그라운드 복귀 race 방지.
 * iOS PWA에서 백그라운드 진입 시 JS 타이머가 멈춰 autoRefresh가 못 도는 케이스 보정.
 */
export function SessionRefresher() {
  useEffect(() => {
    let cancelled = false;
    const supabase = getBrowserClient();

    async function refresh() {
      try {
        await supabase.auth.refreshSession();
      } catch (err) {
        console.warn("[SessionRefresher] refresh failed:", err);
      }
    }

    void refresh();

    const onVis = () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    const onFocus = () => {
      if (!cancelled) void refresh();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
