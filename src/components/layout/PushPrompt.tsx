"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type State =
  | "loading"
  | "unsupported"
  | "ios-not-installed"
  | "denied"
  | "default"
  | "subscribed";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const std = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStd = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return !!(std || iosStd);
}

export function PushPrompt() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    void check();
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  async function ensureServerSync(sub: PushSubscription) {
    try {
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          ua: navigator.userAgent.slice(0, 500),
        }),
      });
    } catch (err) {
      console.warn("[PushPrompt] sync failed:", err);
    }
  }

  async function check() {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      if (isIOSSafari() && !isStandalone()) {
        setState("ios-not-installed");
      } else {
        setState("unsupported");
      }
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      setState("subscribed");
      void ensureServerSync(sub);
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    if (Notification.permission === "granted") {
      const ok = await silentResubscribe(reg);
      if (ok) return;
    }
    setState("default");
  }

  async function silentResubscribe(reg: ServiceWorkerRegistration): Promise<boolean> {
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) return false;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          ua: navigator.userAgent.slice(0, 500),
        }),
      });
      if (!res.ok) return res.status === 401;
      setState("subscribed");
      return true;
    } catch (err) {
      console.warn("[PushPrompt] silent resubscribe failed:", err);
      return false;
    }
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setMsg({ kind: "error", text: "VAPID 키가 설정되지 않았습니다." });
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "default");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          ua: navigator.userAgent.slice(0, 500),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMsg({ kind: "error", text: err.error ?? "구독 등록 실패" });
        await sub.unsubscribe().catch(() => null);
        return;
      }
      setMsg({ kind: "ok", text: "알림 받기를 시작했어요." });
      setState("subscribed");
    } catch (err) {
      console.error(err);
      setMsg({ kind: "error", text: "알림 등록 중 오류가 발생했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setState("default");
        return;
      }
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setMsg({ kind: "ok", text: "알림을 껐어요." });
      setState("default");
    } catch (err) {
      console.error(err);
      setMsg({ kind: "error", text: "해제 중 오류가 발생했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/send-test", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "error", text: json.error ?? "발송 실패" });
        return;
      }
      setMsg({
        kind: "ok",
        text: `테스트 알림 발송: ${json.data?.sent ?? 0}/${json.data?.total ?? 0} 성공.`,
      });
    } catch (err) {
      console.error(err);
      setMsg({ kind: "error", text: "발송 중 오류가 발생했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell size={16} aria-hidden />
        <p className="text-sm font-semibold">푸시 알림</p>
      </div>

      {state === "loading" ? (
        <p className="text-xs text-ink-3">상태 확인 중...</p>
      ) : null}

      {state === "unsupported" ? (
        <p className="text-xs text-ink-3">이 브라우저에서는 푸시 알림을 지원하지 않아요.</p>
      ) : null}

      {state === "ios-not-installed" ? (
        <p className="text-xs text-ink-3">
          iPhone/iPad에서는 먼저 <b>홈 화면에 추가</b>한 뒤 설치된 앱에서 알림을 켤 수 있어요.
          (Safari 공유 → 홈 화면에 추가)
        </p>
      ) : null}

      {state === "denied" ? (
        <p className="text-xs text-ink-3">
          브라우저에서 알림 권한이 차단되어 있어요. 설정에서 사이트 권한을 허용으로 바꿔주세요.
        </p>
      ) : null}

      {state === "default" ? (
        <>
          <p className="text-xs text-ink-3">새 지원·수락 등 중요한 이벤트를 알림으로 받을 수 있어요.</p>
          <Button onClick={enable} disabled={busy} size="sm" className="gap-2 self-start">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            알림 받기
          </Button>
        </>
      ) : null}

      {state === "subscribed" ? (
        <>
          <p className="text-xs text-ink-3">이 기기에서 알림을 받고 있어요.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={sendTest}
              disabled={busy}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Send size={14} />
              테스트 알림 보내기
            </Button>
            <Button onClick={disable} disabled={busy} size="sm" variant="ghost" className="gap-2">
              <BellOff size={14} />
              끄기
            </Button>
          </div>
        </>
      ) : null}

      {msg ? (
        <p
          className={
            "rounded-md px-3 py-2 text-xs " +
            (msg.kind === "ok"
              ? "bg-ok/10 text-ok"
              : "bg-destructive/10 text-destructive")
          }
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
