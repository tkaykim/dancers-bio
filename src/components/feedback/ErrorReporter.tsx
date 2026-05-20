"use client";

import { useEffect } from "react";

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
          url: window.location.href,
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
