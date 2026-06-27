"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

// 설치 유도 배너 — 전역 마운트(루트 레이아웃).
// - Android/데스크톱 Chrome·Edge: beforeinstallprompt 포착 → "앱 설치" 버튼 → prompt()
// - iOS Safari: 이벤트 없음 → "공유 → 홈 화면에 추가" 가이드 시트
// - iOS 비-Safari: Safari로 열기 안내
// - 이미 설치(standalone) / 최근 닫음 → 숨김
// iOS는 홈화면 설치(PWA)해야만 웹푸시가 작동하므로, 설치가 알림의 전제다.

const DISMISS_KEY = "deetz_install_dismissed_at";
const DISMISS_DAYS = 7;

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const std = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStd = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return !!(std || iosStd);
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ 는 데스크톱 Mac UA로 위장 → 터치포인트로 보강
  const iPadDesktop =
    /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  return iOSDevice || iPadDesktop;
}

function isIOSSafari(): boolean {
  if (!detectIOS()) return false;
  const ua = navigator.userAgent;
  // iOS Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS — 이들은 홈화면 설치 불가
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function dismissedRecently(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    return Date.now() - Number(v) < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

type Mode = "native" | "ios" | "ios-other";

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || dismissedRecently()) return;

    // iOS 는 beforeinstallprompt 가 없으니 즉시 모드 결정.
    // 클라이언트 전용 감지라 SSR/하이드레이션 미스매치 방지 위해 마운트 후 설정.
    if (detectIOS()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode(isIOSSafari() ? "ios" : "ios-other");
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("native");
    };
    const onInstalled = () => {
      rememberDismiss();
      setMode(null);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    rememberDismiss();
    setMode(null);
    setShowGuide(false);
  }

  async function installNative() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setMode(null);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setDeferred(null);
    }
  }

  if (!mode) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="앱 설치 안내"
        className="fixed inset-x-0 z-40 mx-auto max-w-md px-3"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)" }}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Download size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">앱으로 설치하기</p>
            <p className="text-xs text-ink-3">
              설치하면 핏 맞는 새 공고를 알림으로 받아요.
            </p>
          </div>

          {mode === "native" ? (
            <button
              type="button"
              onClick={installNative}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              설치
            </button>
          ) : mode === "ios" ? (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              설치 방법
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-2 hover:bg-secondary"
            >
              안내
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            aria-label="닫기"
            className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-secondary hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {showGuide ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-bold">홈 화면에 추가</p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="닫기"
                className="rounded-lg p-1.5 text-ink-3 hover:bg-secondary"
              >
                <X size={18} />
              </button>
            </div>

            {mode === "ios-other" ? (
              <p className="text-sm leading-relaxed text-ink-2">
                iPhone/iPad에서는 <b>Safari</b>에서만 홈 화면에 추가할 수 있어요.
                이 페이지를 Safari로 열어주세요.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                <li className="flex items-center gap-3 text-sm text-ink-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    1
                  </span>
                  <span className="flex items-center gap-1.5">
                    하단의 <Share size={16} className="inline" aria-label="공유" /> <b>공유</b> 버튼을 누르세요.
                  </span>
                </li>
                <li className="flex items-center gap-3 text-sm text-ink-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    2
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Plus size={16} className="inline" /> <b>홈 화면에 추가</b>를 선택하세요.
                  </span>
                </li>
                <li className="flex items-center gap-3 text-sm text-ink-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    3
                  </span>
                  <span>
                    추가된 <b>deetz</b> 앱을 열고 알림을 켜면 새 공고 알림을 받아요.
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={dismiss}
              className="mt-5 w-full rounded-lg border border-border py-2.5 text-sm font-medium text-ink-2 hover:bg-secondary"
            >
              나중에 하기
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
