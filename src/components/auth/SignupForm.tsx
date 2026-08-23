"use client";

import { useState, useTransition } from "react";
import { EmailTypoHint } from "@/components/ui/EmailTypoHint";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signupAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InternationalPhoneField } from "@/components/auth/InternationalPhoneField";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectRaw = searchParams.get("redirect") ?? searchParams.get("next");
  const redirectParam =
    redirectRaw && redirectRaw.startsWith("/") && !redirectRaw.startsWith("//")
      ? redirectRaw
      : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await signupAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          // 회원가입 직후엔 /onboarding/create 로 가서 댄서 프로필 생성. redirect 가
          // 있으면 onboarding 의 기존 returnTo 메커니즘으로 보존해서 그 페이지로 복귀.
          router.push(
            redirectParam
              ? `/onboarding/create?returnTo=${encodeURIComponent(redirectParam)}`
              : "/onboarding/create",
          );
          router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="display_name">
          이름 <span className="font-normal text-ink-3">/ Name</span>
        </Label>
        <Input
          id="display_name"
          name="display_name"
          required
          maxLength={50}
          placeholder="활동명 또는 본명 / Stage or legal name"
          autoComplete="name"
        />
      </div>
      <InternationalPhoneField idPrefix="signup" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">
          이메일 <span className="font-normal text-ink-3">/ Email</span>
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
        />
        <EmailTypoHint email={email} onFix={setEmail} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">
          비밀번호 <span className="font-normal text-ink-3">/ Password</span>
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">8자 이상 / At least 8 characters</p>
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "가입하는 중... / Signing up..." : "가입하기 / Sign up"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <span className="block">이미 계정이 있으신가요?</span>
        <span className="block text-xs">Already have an account?</span>
        <Link
          href={
            redirectParam
              ? `/login?redirect=${encodeURIComponent(redirectParam)}`
              : "/login"
          }
          className="mt-1 inline-block font-medium text-foreground underline"
        >
          로그인 / Log in
        </Link>
      </p>
    </form>
  );
}
