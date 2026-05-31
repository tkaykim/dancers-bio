"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ClaimFormProps {
  initialEmail: string;
  dancerSlug?: string;
}

export function ClaimForm({ initialEmail, dancerSlug }: ClaimFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-8.004 8.004a1 1 0 01-1.414 0L3.296 10.72a1 1 0 011.414-1.414L8 12.596l7.29-7.305a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">메일을 보냈습니다</p>
            <p className="mt-1 text-sm text-ink-2 leading-relaxed">
              <span className="font-medium text-foreground">{email}</span> 으로<br />
              비밀번호 설정 링크를 보냈어요.
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-background p-3.5 text-xs leading-relaxed text-ink-2">
          <p className="mb-1.5 font-semibold text-foreground">다음 단계</p>
          1. 받은편지함 (또는 스팸함)에서 deetz 메일 열기<br />
          2. 메일 안의 <b>비밀번호 재설정 링크</b> 클릭<br />
          3. 새 비밀번호 설정 → 자동으로 본인 프로필 연결
        </div>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-xs text-ink-3 underline-offset-2 hover:underline self-start"
        >
          다른 이메일로 다시 시도
        </button>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await forgotPasswordAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSent(true);
        });
      }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email" className="text-xs font-medium text-ink-2">
          지원 시 사용한 이메일
        </Label>
        <Input
          id="email"
          name="email"
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
      <Button type="submit" disabled={pending} size="lg" className="w-full text-base font-semibold">
        {pending ? "보내는 중..." : "비밀번호 설정 메일 받기"}
      </Button>
      <p className="text-center text-[11px] text-ink-3">
        링크는 약 1시간 동안 유효합니다.
      </p>
      <div className="mt-1 border-t border-border pt-3 text-center">
        <Link href="/login" className="text-xs text-ink-3 underline-offset-2 hover:underline">
          이미 비밀번호를 설정하셨나요? 로그인
        </Link>
      </div>
    </form>
  );
}
