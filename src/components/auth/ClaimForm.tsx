"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { autoClaimDancersAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ClaimFormProps {
  initialEmail: string;
  dancerSlug?: string;
}

// 비밀번호 설정(=프로필 클레임)도 비번찾기와 동일한 OTP 코드 방식.
// 네이버/회사메일 링크 프리페치 문제 때문에 "링크 클릭" 대신 "메일 속 숫자 코드 입력".
type Step = "email" | "code";

function toKoreanErr(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("expired") || m.includes("invalid"))
    return "코드가 만료됐거나 올바르지 않습니다. 코드를 다시 확인하거나 재발송해 주세요.";
  if (m.includes("rate") && m.includes("limit"))
    return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  if (m.includes("at least") || m.includes("weak") || m.includes("short"))
    return "비밀번호가 너무 짧거나 약합니다. 8자 이상으로 설정해 주세요.";
  return "처리에 실패했습니다. 다시 시도해 주세요.";
}

export function ClaimForm({ initialEmail, dancerSlug }: ClaimFormProps) {
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

  function sendCode(resend = false) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setError("올바른 이메일 주소를 입력해 주세요.");
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const supabase = getBrowserClient();
      await supabase.auth.resetPasswordForEmail(e);
      setEmail(e);
      setStep("code");
      setInfo(
        resend
          ? "인증코드를 다시 보냈어요. 메일을 확인해 주세요."
          : "메일로 숫자 인증코드를 보냈어요. (스팸함도 확인해 주세요)",
      );
    });
  }

  function verifyAndSet() {
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,8}$/.test(token)) {
      setError("메일로 받은 숫자 인증코드를 입력해 주세요.");
      return;
    }
    if (pw.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pw !== pw2) {
      setError("두 비밀번호가 일치하지 않습니다.");
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
        setError(toKoreanErr(vErr.message));
        return;
      }
      const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
      if (pwErr) {
        setError(toKoreanErr(pwErr.message));
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
          비밀번호가 설정됐어요. 본인 프로필이 연결되었습니다.
        </p>
        <Link
          href="/me/portfolio"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          내 프로필로 이동 →
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
              지원 시 사용한 이메일
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
                ※ 다른 이메일을 사용하시면 본인 프로필이 자동 연결되지 않을 수 있습니다.
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
            {pending ? "보내는 중..." : "인증코드 받기"}
          </Button>
          <button
            type="button"
            onClick={() => {
              const e = email.trim().toLowerCase();
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
                setError("먼저 이메일을 입력해 주세요.");
                return;
              }
              setError(null);
              setEmail(e);
              setStep("code");
            }}
            className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-foreground"
          >
            이미 인증코드를 받았어요 — 코드 입력하기
          </button>
          <div className="mt-1 border-t border-border pt-3 text-center">
            <Link
              href="/login"
              className="text-xs text-ink-3 underline-offset-2 hover:underline"
            >
              이미 비밀번호를 설정하셨나요? 로그인
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
            <p className="mb-1.5 font-semibold text-foreground">다음 단계</p>
            1. 받은편지함(또는 스팸함)에서 deetz 메일 열기
            <br />
            2. 메일 속 <b>숫자 인증코드</b>를 아래에 입력
            <br />
            3. 새 비밀번호 설정 → 자동으로 본인 프로필 연결
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code">인증코드</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="메일로 받은 숫자 코드"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw">새 비밀번호</Label>
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
            <Label htmlFor="pw2">새 비밀번호 확인</Label>
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
            {pending ? "설정 중..." : "비밀번호 설정"}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCode(true)}
            className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            코드 재발송
          </button>
        </>
      )}
    </div>
  );
}
