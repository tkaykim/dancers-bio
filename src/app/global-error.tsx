"use client";

import { useEffect, useSyncExternalStore } from "react";

// Catches rendering errors that escape all other error.tsx boundaries
// (including the root layout). Auto-reports to /api/log-error.
//
// 이 화면은 루트 레이아웃(LocaleProvider) 바깥에서 렌더되므로 공용 사전·훅을 쓸 수 없다.
// 그래서 작은 3개 언어 사전을 파일 안에 두고, 첫 렌더는 ko 로 고정한 뒤
// hydration 이후에만 ?lang= → 쿠키 → 브라우저 언어 순으로 언어를 정한다
// (docs/design-i18n-ui.md §3.5 의 문서화된 예외).

type Lang = "ko" | "en" | "ja";

/* eslint-disable no-restricted-syntax -- i18n: 루트 LocaleProvider 밖이라 공용 사전을 못 쓴다. 파일 안 3개 언어 사전이 설계상 정본 (docs/design-i18n-ui.md §3.5) */
const COPY: Record<Lang, { title: string; body: string; reported: string; retry: string }> = {
  ko: {
    title: "일시적인 오류가 발생했습니다",
    body: "잠시 후 다시 시도해주세요.",
    reported: "운영팀에 자동으로 신고되었습니다.",
    retry: "다시 시도",
  },
  en: {
    title: "Something went wrong",
    body: "Please try again in a moment.",
    reported: "Our team has been notified automatically.",
    retry: "Try again",
  },
  ja: {
    title: "一時的なエラーが発生しました",
    body: "しばらくしてからもう一度お試しください。",
    reported: "運営チームに自動で通知されました。",
    retry: "再試行",
  },
};
/* eslint-enable no-restricted-syntax */

/** 루트 레이아웃의 쿠키와 같은 이름. 여기서는 공용 모듈을 import 하지 않는다. */
const LANG_COOKIE = "deetz_lang";

function toLang(value: string | null | undefined): Lang | null {
  if (!value) return null;
  const head = value.trim().toLowerCase().split(/[-_,;]/)[0];
  if (head === "ko" || head === "en" || head === "ja") return head;
  return null;
}

function readCookieLang(): Lang | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANG_COOKIE) return toLang(decodeURIComponent(rest.join("=")));
  }
  return null;
}

/** 외부 스토어가 없다. 구독은 아무것도 하지 않고 해제 함수만 돌려준다. */
function subscribe(): () => void {
  return () => {};
}

function getSnapshot(): Lang {
  if (typeof window === "undefined") return "ko";
  const fromQuery = toLang(new URLSearchParams(window.location.search).get("lang"));
  if (fromQuery) return fromQuery;
  const fromCookie = readCookieLang();
  if (fromCookie) return fromCookie;
  return toLang(navigator.language) ?? "ko";
}

/** 서버 렌더와 첫 클라이언트 렌더는 ko 로 같게 두어 hydration 불일치를 막는다. */
function getServerSnapshot(): Lang {
  return "ko";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const copy = COPY[lang];

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
    <html lang={lang}>
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
              {copy.title}
            </h1>
            <p style={{ color: "#71717a", fontSize: 14, marginTop: 0 }}>
              {copy.body}
              <br />
              {copy.reported}
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
              {copy.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
