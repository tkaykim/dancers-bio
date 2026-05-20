"use client";

import { useEffect } from "react";

// 클라이언트 진입 시 /sw.js 등록. 실패는 조용히 무시 (지원 안 하는 브라우저).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const reg = navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[SW] register failed:", err);
    });
    return () => {
      void reg;
    };
  }, []);
  return null;
}
