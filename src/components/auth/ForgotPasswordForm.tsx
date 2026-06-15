"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoClaimDancersAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// 네이버·회사메일의 링크 자동스캔(프리페치)이 일회용 재설정 링크를 소진하는 문제 때문에
// "클릭 링크" 대신 "6자리 인증코드(이메일 OTP)" 방식으로 재설정한다. (코드는 스캔당해도 안 쓰임)
type Step = "email" | "code";

function toKoreanErr(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("expired") || m.includes("invalid"))
    return "코드가 만료됐거나 올바르지 않습니다. 코드를 다시 확인하거나 재발송해 주세요.";
  if (m.includes("rate") && m.includes("limit"))
    return "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.";
  if (m.includes("at least") || m.includes("weak") || m.includes("short"))
    return "비밀번호가 너무 짧거나 약합니다. 8자 이상으로 설정해 주세요.";
  if (m.includes("same as") || m.includes("different from the old"))
    return "새 비밀번호는 기존 비밀번호와 달라야 합니다.";
  return "처리에 실패했습니다. 다시 시도해 주세요.";
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
      // 가입 여부를 노출하지 않기 위해 결과와 무관하게 동일 안내. (미가입이면 코드가 안 옴)
      await supabase.auth.resetPasswordForEmail(e);
      setEmail(e);
      setStep("code");
      setInfo(
        resend
          ? "인증코드를 다시 보냈어요. 메일을 확인해 주세요."
          : "메일로 6자리 인증코드를 보냈어요. (스팸함도 확인해 주세요)",
      );
    });
  }

  function verifyAndSet() {
    const token = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(token)) {
      setError("메일로 받은 6자리 코드를 입력해 주세요.");
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
        email,
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
        <p className="text-sm text-foreground">
          비밀번호가 설정됐습니다. 본인 프로필도 연결되었어요.
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
    <div className="flex flex-col gap-4">
      {step === "email" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="가입할 때 사용한 이메일"
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
            onClick={() => sendCode(false)}
            className="w-full"
          >
            {pending ? "보내는 중..." : "인증코드 받기"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-foreground underline">
              ← 로그인으로
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
            <Label htmlFor="code">인증코드 (6자리)</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="메일로 받은 6자리 숫자"
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
            className="w-full"
          >
            {pending ? "변경 중..." : "비밀번호 변경"}
          </Button>
          <button
            type="button"
            disabled={pending}
            onClick={() => sendCode(true)}
            className="text-xs text-ink-3 underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            코드 재발송
          </button>
        </>
      )}
    </div>
  );
}
