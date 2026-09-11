"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { autoClaimDancersAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import type { KeyOf } from "@/lib/i18n/t";
import auth from "@/lib/i18n/messages/auth";

interface ClaimFormProps {
  initialEmail: string;
  dancerSlug?: string;
  /** 화이트라벨 호스트에서 안내 문구에 쓰는 브랜드 표기. 기본은 deetz. */
  brandName?: string;
}

// 비밀번호 설정(=프로필 클레임)도 비번찾기와 동일한 OTP 코드 방식.
// 네이버/회사메일 링크 프리페치 문제 때문에 "링크 클릭" 대신 "메일 속 숫자 코드 입력".
type Step = "email" | "code";

/** GoTrue 영어 오류를 사전 키로 옮긴다. 화면 문구는 호출처가 t() 로 만든다. */
function errorKey(msg: string): KeyOf<typeof auth> {
  const m = (msg || "").toLowerCase();
  if (m.includes("expired") || m.includes("invalid")) return "error.code_invalid";
  if (m.includes("rate") && m.includes("limit")) return "error.rate_limit";
  if (m.includes("at least") || m.includes("weak") || m.includes("short"))
    return "error.password_weak";
  return "error.generic";
}

/** 강조(<b>)를 끼울 자리. 언어마다 위치가 달라 문장을 이어 붙이지 않는다. */
const EM_SLOT = "\u0000";

export function ClaimForm({
  initialEmail,
  dancerSlug,
  brandName = "deetz",
}: ClaimFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const t = useT(auth);
  const [step2Before, step2After = ""] = t("claim.step2", { em: EM_SLOT }).split(EM_SLOT);

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
      await supabase.auth.resetPasswordForEmail(e);
      setEmail(e);
      setStep("code");
      setInfo(resend ? t("claim.code_resent") : t("claim.code_sent"));
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
        email: email.trim().toLowerCase(),
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
        <p className="text-sm font-semibold text-foreground">
          {t("claim.done")}
        </p>
        <Link
          href="/me/portfolio"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {t("claim.go_profile")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      {step === "email" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email" className="text-xs font-medium text-ink-2">
              {t("claim.email")}
            </Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-base"
            />
            {dancerSlug ? (
              <p className="text-[11px] text-ink-3">
                {t("claim.email_warning")}
              </p>
            ) : null}
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
            size="lg"
            className="w-full text-base font-semibold"
          >
            {pending ? t("claim.sending") : t("claim.send_code")}
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
            className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-foreground"
          >
            {t("claim.have_code")}
          </button>
          <div className="mt-1 border-t border-border pt-3 text-center">
            <Link
              href="/login"
              className="text-xs text-ink-3 underline-offset-2 hover:underline"
            >
              {t("claim.already_set_login")}
            </Link>
          </div>
        </>
      ) : (
        <>
          {info ? (
            <p className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-ink-2">
              {info}
            </p>
          ) : null}
          <div className="rounded-xl bg-background p-3.5 text-xs leading-relaxed text-ink-2">
            <p className="mb-1.5 font-semibold text-foreground">{t("claim.steps_title")}</p>
            {t("claim.step1", { brand: brandName })}
            <br />
            {step2Before}
            <b>{t("claim.step2_em")}</b>
            {step2After}
            <br />
            {t("claim.step3")}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">{t("claim.code")}</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={t("claim.code_placeholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">{t("claim.new_password")}</Label>
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
            <Label htmlFor="pw2">{t("claim.new_password_confirm")}</Label>
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
            size="lg"
            className="w-full text-base font-semibold"
          >
            {pending ? t("claim.submitting") : t("claim.submit")}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCode(true)}
            className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            {t("claim.resend")}
          </button>
        </>
      )}
    </div>
  );
}
