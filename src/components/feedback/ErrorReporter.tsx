"use client";

import { useEffect } from "react";

// `/submit/<token>` 만 오류 로그에서 마스킹한다.
// 이 경로는 로그인이 없는 대신 URL 자체가 업로드 자격증명이라 예외를 뒀다.
// 다른 코드 경로는 건드리지 않는다 — 디버깅 때 실제 주소가 안 남으면 오히려 손해다.
// (2026-08-14 대표 지시: 과도한 보안으로 기존 동작을 해치지 말 것)
const SUBMIT_PATH = /^\/submit\/[^/]+/;

function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (!SUBMIT_PATH.test(u.pathname)) return raw;
    return u.origin + u.pathname.replace(SUBMIT_PATH, "/submit/[token]") + u.search;
  } catch {
    return raw;
  }
}

// Captures unhandled client errors + promise rejections and reports them to
// /api/log-error. Uses sendBeacon when available so the report survives page
// unloads. Never throws (would create infinite recursion with itself).
export function ErrorReporter() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const send = (payload: {
      message: string;
      stack?: string;
      source: "client" | "global";
      context?: Record<string, unknown>;
    }) => {
      try {
        const body = JSON.stringify({
          ...payload,
          url: maskUrl(window.location.href),
          userAgent: navigator.userAgent,
        });
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon && navigator.sendBeacon("/api/log-error", blob)) return;
        fetch("/api/log-error", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "Content-Type": "application/json" },
        }).catch(() => {});
      } catch {
        // never throw from the reporter
      }
    };

    const onError = (e: ErrorEvent) => {
      if (!e?.message) return;
      // Ignore noisy ResizeObserver / cross-origin script errors.
      if (/ResizeObserver loop|Script error\.?$/i.test(e.message)) return;
      send({
        message: e.message,
        stack: e.error?.stack,
        source: "client",
        context: { filename: e.filename, lineno: e.lineno, colno: e.colno },
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason?.message
            ? reason.message
            : "unhandledrejection (no message)";
      const stack = reason?.stack;
      send({ message: `unhandledrejection: ${message}`, stack, source: "client" });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
