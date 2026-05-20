"use client";

import { useEffect } from "react";

// Catches rendering errors that escape all other error.tsx boundaries
// (including the root layout). Auto-reports to /api/log-error.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const body = JSON.stringify({
        message: error.message || "global error",
        stack: error.stack,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        source: "global",
        context: { digest: error.digest },
      });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/log-error",
          new Blob([body], { type: "application/json" }),
        );
      } else {
        fetch("/api/log-error", {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // swallow
    }
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#fafafa",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 48 }}>⚠️</div>
            <h1 style={{ fontSize: 20, margin: "12px 0 6px", color: "#18181b" }}>
              일시적인 오류가 발생했습니다
            </h1>
            <p style={{ color: "#71717a", fontSize: 14, marginTop: 0 }}>
              잠시 후 다시 시도해주세요.<br />운영팀에 자동으로 신고되었습니다.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 16,
                padding: "10px 24px",
                background: "#18181b",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontSize: 14,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
