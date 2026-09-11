"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import nav from "@/lib/i18n/messages/nav";

/** 강조(<b>)를 끼울 자리. 언어마다 위치가 달라 문장을 이어 붙이지 않는다. */
const SLOT = "\u0000";

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
  const t = useT(nav);
  const [iosBefore, iosAfter = ""] = t("push.ios_not_installed", { add: SLOT }).split(SLOT);

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
        setMsg({ kind: "error", text: t("push.error_no_vapid") });
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
        setMsg({ kind: "error", text: err.error ?? t("push.error_subscribe") });
        await sub.unsubscribe().catch(() => null);
        return;
      }
      setMsg({ kind: "ok", text: t("push.enabled_ok") });
      setState("subscribed");
    } catch (err) {
      console.error(err);
      setMsg({ kind: "error", text: t("push.error_enable") });
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
      setMsg({ kind: "ok", text: t("push.disabled_ok") });
      setState("default");
    } catch (err) {
      console.error(err);
      setMsg({ kind: "error", text: t("push.error_disable") });
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
        setMsg({ kind: "error", text: json.error ?? t("push.error_send") });
        return;
      }
      setMsg({
        kind: "ok",
        text: t("push.test_sent", {
          sent: json.data?.sent ?? 0,
          total: json.data?.total ?? 0,
        }),
      });
    } catch (err) {
      console.error(err);
      setMsg({ kind: "error", text: t("push.error_send_generic") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell size={16} aria-hidden />
        <p className="text-sm font-semibold">{t("push.title")}</p>
      </div>

      {state === "loading" ? (
        <p className="text-xs text-ink-3">{t("push.checking")}</p>
      ) : null}

      {state === "unsupported" ? (
        <p className="text-xs text-ink-3">{t("push.unsupported")}</p>
      ) : null}

      {state === "ios-not-installed" ? (
        <p className="text-xs text-ink-3">
          {iosBefore}
          <b>{t("push.ios_not_installed_em")}</b>
          {iosAfter}
        </p>
      ) : null}

      {state === "denied" ? (
        <p className="text-xs text-ink-3">
          {t("push.denied")}
        </p>
      ) : null}

      {state === "default" ? (
        <>
          <p className="text-xs text-ink-3">{t("push.default_body")}</p>
          <Button onClick={enable} disabled={busy} size="sm" className="gap-2 self-start">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            {t("push.enable")}
          </Button>
        </>
      ) : null}

      {state === "subscribed" ? (
        <>
          <p className="text-xs text-ink-3">{t("push.subscribed_body")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={sendTest}
              disabled={busy}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              <Send size={14} />
              {t("push.send_test")}
            </Button>
            <Button onClick={disable} disabled={busy} size="sm" variant="ghost" className="gap-2">
              <BellOff size={14} />
              {t("push.disable")}
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
