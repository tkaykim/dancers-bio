"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { resetPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ExchangeState = "loading" | "ready" | "invalid";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exchangeState, setExchangeState] = useState<ExchangeState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setExchangeState("invalid");
      return;
    }
    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setExchangeState("invalid");
      } else {
        setExchangeState("ready");
      }
    });
  }, [searchParams]);

  if (exchangeState === "loading") {
    return (
      <p className="text-sm text-muted-foreground">링크를 확인하는 중...</p>
    );
  }

  if (exchangeState === "invalid") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          링크가 유효하지 않거나 만료되었습니다.
        </p>
        <Link
          href="/forgot-password"
          className="text-center text-sm font-medium text-foreground underline"
        >
          비밀번호 찾기로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await resetPasswordAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/me");
          router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">새 비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">8자 이상</p>
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "변경 중..." : "비밀번호 변경"}
      </Button>
    </form>
  );
}
