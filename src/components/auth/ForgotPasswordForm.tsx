"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { EmailTypoHint } from "@/components/ui/EmailTypoHint";
import { useRouter } from "next/navigation";
import { autoClaimDancersAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import type { KeyOf } from "@/lib/i18n/t";
import auth from "@/lib/i18n/messages/auth";

// 네이버·회사메일의 링크 자동스캔(프리페치)이 일회용 재설정 링크를 소진하는 문제 때문에
// "클릭 링크" 대신 "6자리 인증코드(이메일 OTP)" 방식으로 재설정한다. (코드는 스캔당해도 안 쓰임)
type Step = "email" | "code";

/** GoTrue 영어 오류를 사전 키로 옮긴다. 화면 문구는 호출처가 t() 로 만든다. */
function errorKey(msg: string): KeyOf<typeof auth> {
  const m = (msg || "").toLowerCase();
  if (m.includes("expired") || m.includes("invalid")) return "error.code_invalid";
  if (m.includes("rate") && m.includes("limit")) return "error.rate_limit";
  if (m.includes("at least") || m.includes("weak") || m.includes("short"))
    return "error.password_weak";
  if (m.includes("same as") || m.includes("different from the old"))
    return "error.password_same";
  return "error.generic";
}

export function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const t = useT(auth);

  function sendCode(resend = false) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setError(t("error.email_invalid"));
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const supabase = getBrowserClient();
      // 가입 여부를 노출하지 않기 위해 결과와 무관하게 동일 안내. (미가입이면 코드가 안 옴)
      await supabase.auth.resetPasswordForEmail(e);
      setEmail(e);
      setStep("code");
      setInfo(resend ? t("forgot.code_resent") : t("forgot.code_sent"));
    });
  }

  function verifyAndSet() {
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(token)) {
      setError(t("error.code_required"));
      return;
    }
    if (pw.length < 8) {
      setError(t("error.password_short"));
      return;
    }
    if (pw !== pw2) {
      setError(t("error.password_mismatch"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const supabase = getBrowserClient();
      const { error: vErr } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "recovery",
      });
      if (vErr) {
        setError(t(errorKey(vErr.message)));
        return;
      }
      const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
      if (pwErr) {
        setError(t(errorKey(pwErr.message)));
        return;
      }
      await autoClaimDancersAction();
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-sm text-foreground">
          {t("forgot.done")}
        </p>
        <Link
          href="/me/portfolio"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {t("forgot.go_profile")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("forgot.email")}</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("forgot.email_placeholder")}
            />
            {/* 주소를 잘못 적으면 인증 메일이 반송되는데 본인은 알 방법이 없다. */}
            <EmailTypoHint email={email} onFix={setEmail} />
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={pending}
            onClick={() => sendCode(false)}
            className="w-full"
          >
            {pending ? t("forgot.sending") : t("forgot.send_code")}
          </Button>
          <button
            type="button"
            onClick={() => {
              const e = email.trim().toLowerCase();
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
                setError(t("error.email_first"));
                return;
              }
              setError(null);
              setEmail(e);
              setStep("code");
            }}
            className="text-xs text-ink-3 underline underline-offset-2 hover:text-foreground"
          >
            {t("forgot.have_code")}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-foreground underline">
              {t("forgot.back_to_login")}
            </Link>
          </p>
        </>
      ) : (
        <>
          {info ? (
            <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-ink-2">
              {info}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{t("forgot.code")}</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={t("forgot.code_placeholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">{t("forgot.new_password")}</Label>
            <Input
              id="pw"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw2">{t("forgot.new_password_confirm")}</Label>
            <Input
              id="pw2"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={pending}
            onClick={verifyAndSet}
            className="w-full"
          >
            {pending ? t("forgot.submitting") : t("forgot.submit")}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCode(true)}
            className="text-xs text-ink-3 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            {t("forgot.resend")}
          </button>
        </>
      )}
    </div>
  );
}
