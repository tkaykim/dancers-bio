"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, Plus, X } from "lucide-react";
import { getBrandFromHost } from "@/lib/brand";
import { useT } from "@/lib/i18n/provider";
import nav from "@/lib/i18n/messages/nav";

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

/** 아이콘·강조(<b>)를 끼울 자리. 언어마다 위치가 달라 문장을 이어 붙이지 않는다. */
const SLOT = "\u0000";

export function InstallPrompt() {
  const pathname = usePathname();
  const t = useT(nav);
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

  // 비자 온보딩 퍼널(/visa, /visa/apply)에서는 집중도를 위해 설치 배너 숨김.
  if (pathname?.startsWith("/visa")) return null;
  // GRIGO 화이트라벨 호스트에서는 deetz 앱 설치 유도를 노출하지 않는다.
  if (
    typeof window !== "undefined" &&
    getBrandFromHost(window.location.host) === "grigo"
  )
    return null;
  if (!mode) return null;

  const [iosOtherBefore, iosOtherAfter = ""] = t("install.ios_other", { safari: SLOT }).split(SLOT);
  const [step1Before, step1After = ""] = t("install.step1", { share: SLOT }).split(SLOT);
  const [step2Before, step2After = ""] = t("install.step2", { add: SLOT }).split(SLOT);
  const [step3Before, step3After = ""] = t("install.step3", { app: SLOT }).split(SLOT);

  return (
    <>
      <div
        role="dialog"
        aria-label={t("install.aria")}
        className="fixed inset-x-0 z-40 mx-auto max-w-md px-3"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)" }}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Download size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">{t("install.title")}</p>
            <p className="text-xs text-ink-3">
              {t("install.body")}
            </p>
          </div>

          {mode === "native" ? (
            <button
              type="button"
              onClick={installNative}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("install.cta")}
            </button>
          ) : mode === "ios" ? (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("install.how")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-medium text-ink-2 hover:bg-secondary"
            >
              {t("install.guide")}
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            aria-label={t("install.close")}
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
              <p className="text-base font-bold">{t("install.add_to_home")}</p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label={t("install.close")}
                className="rounded-lg p-1.5 text-ink-3 hover:bg-secondary"
              >
                <X size={18} />
              </button>
            </div>

            {mode === "ios-other" ? (
              <p className="text-sm leading-relaxed text-ink-2">
                {iosOtherBefore}
                <b>{t("install.safari")}</b>
                {iosOtherAfter}
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                <li className="flex items-center gap-3 text-sm text-ink-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    1
                  </span>
                  <span className="flex items-center gap-1.5">
                    {step1Before}
                    <Share size={16} className="inline" aria-label={t("install.share")} />{" "}
                    <b>{t("install.share")}</b>
                    {step1After}
                  </span>
                </li>
                <li className="flex items-center gap-3 text-sm text-ink-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    2
                  </span>
                  <span className="flex items-center gap-1.5">
                    {step2Before}
                    <Plus size={16} className="inline" />{" "}
                    <b>{t("install.add_to_home")}</b>
                    {step2After}
                  </span>
                </li>
                <li className="flex items-center gap-3 text-sm text-ink-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                    3
                  </span>
                  <span>
                    {step3Before}
                    <b>deetz</b>
                    {step3After}
                  </span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={dismiss}
              className="mt-5 w-full rounded-lg border border-border py-2.5 text-sm font-medium text-ink-2 hover:bg-secondary"
            >
              {t("install.later")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
