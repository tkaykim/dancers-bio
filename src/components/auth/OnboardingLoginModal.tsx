"use client";

import { useEffect, useRef, useState } from "react";
import { autoClaimDancersAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import type { KeyOf } from "@/lib/i18n/t";
import auth from "@/lib/i18n/messages/auth";

/** GoTrue 영어 오류를 사전 키로 옮긴다. 화면 문구는 호출처가 t() 로 만든다. */
function errorKey(msg: string): KeyOf<typeof auth> {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "error.invalid_login";
  if (m.includes("email not confirmed")) return "error.email_unconfirmed";
  if (m.includes("rate") && m.includes("limit")) return "error.rate_limit_short";
  return "error.login_failed";
}

/** 강조(<b>)를 끼울 자리. 언어마다 위치가 달라 문장을 이어 붙이지 않는다. */
const EM_SLOT = "\u0000";

export function OnboardingLoginModal({
  email,
  redirectTo = "/me/portfolio",
}: {
  email: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const openedOnce = useRef(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 키보드(가상 뷰포트) 높이만큼 시트를 올려 버튼이 가려지지 않게 함.
  const [kbInset, setKbInset] = useState(0);
  const t = useT(auth);
  const [ledeBefore, ledeAfter = ""] = t("welcome.modal_lede", { em: EM_SLOT }).split(EM_SLOT);
  const [hintBefore, hintAfter = ""] = t("welcome.change_password_hint", {
    em: EM_SLOT,
  }).split(EM_SLOT);

  // 살짝 스크롤하면 로그인 팝업 등장 (최초 1회 자동).
  useEffect(() => {
    const onScroll = () => {
      if (!openedOnce.current && window.scrollY > 100) {
        openedOnce.current = true;
        setOpen(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 모바일 키보드 대응: visualViewport 변화로 키보드 높이 계산.
  useEffect(() => {
    if (!open) {
      setKbInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const pw = password.trim();
    if (!pw) {
      setError(t("error.temp_password_required"));
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (signErr) {
        setError(t(errorKey(signErr.message)));
        setLoading(false);
        return;
      }
      // 미연결 시 프로필 자동 연결 (실패해도 진행).
      try {
        await autoClaimDancersAction();
      } catch {
        // ignore
      }
      // 하드 네비게이션 — 세션 쿠키가 확실히 반영된 채로 보호 페이지 진입.
      window.location.assign(redirectTo);
    } catch {
      setError(t("error.login_failed"));
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline-2 bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/85">
        <div className="mx-auto max-w-md">
          <Button
            onClick={() => setOpen(true)}
            size="lg"
            className="w-full text-base font-semibold"
          >
            {t("welcome.login_cta")}
          </Button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label={t("welcome.close")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-background p-6 pb-8 shadow-2xl transition-transform duration-150"
            style={{ transform: kbInset ? `translateY(-${kbInset}px)` : undefined }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline-2" />
            <h2 className="text-lg font-bold tracking-tight">{t("welcome.modal_title")}</h2>
            <p className="mt-1 text-sm text-ink-2">
              {ledeBefore}
              <b>{t("welcome.modal_lede_em")}</b>
              {ledeAfter}
            </p>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ob-email">{t("welcome.email")}</Label>
                <Input
                  id="ob-email"
                  type="email"
                  value={email}
                  readOnly
                  className="bg-secondary/40"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ob-pw">{t("welcome.temp_password")}</Label>
                <Input
                  id="ob-pw"
                  type="password"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("welcome.temp_password_placeholder")}
                />
              </div>
              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full text-base font-semibold"
              >
                {loading ? t("welcome.logging_in") : t("welcome.login")}
              </Button>
              <p className="text-center text-[11px] text-ink-3">
                {hintBefore}
                <b>{t("welcome.change_password_hint_em")}</b>
                {hintAfter}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
