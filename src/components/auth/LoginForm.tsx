"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Open-redirect 방지: 내부 경로(/...)만 허용. //protocol-relative 차단.
function safeRedirect(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export function LoginForm({ nextPath }: { nextPath?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Server-component 로그인 페이지에서 ?next= → nextPath prop 으로 전달. 그 외
  // 프로젝트 상세 등에서 직접 LoginForm 페이지로 보낼 땐 ?redirect= 또는 ?next= 둘 다 수용.
  const queryRedirect =
    safeRedirect(searchParams.get("redirect")) ??
    safeRedirect(searchParams.get("next"));
  const dest = nextPath ?? queryRedirect ?? "/me";
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await loginAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(dest);
          router.refresh();
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
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "로그인 중..." : "로그인"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </p>
      <p className="text-center text-sm text-muted-foreground">
        아직 계정이 없으신가요?{" "}
        <Link
          href={dest !== "/me" ? `/signup?next=${encodeURIComponent(dest)}` : "/signup"}
          className="font-medium text-foreground underline"
        >
          회원가입
        </Link>
      </p>
    </form>
  );
}
