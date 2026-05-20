"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-sm text-foreground leading-relaxed">
          입력하신 이메일이 등록되어 있다면 잠시 후 재설정 링크가 도착합니다.
          받은 이메일의 링크를 눌러 새 비밀번호를 설정해 주세요.
        </p>
        <p className="text-xs text-ink-3">
          메일이 도착하지 않으면 스팸함을 확인하거나 잠시 후 다시 시도해 주세요.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← 로그인으로 돌아가기
        </Link>
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
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
        />
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "전송 중..." : "재설정 링크 보내기"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline">
          ← 로그인으로
        </Link>
      </p>
    </form>
  );
}
