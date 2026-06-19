"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signupAction } from "@/app/actions/auth";
import { suggestEmailCorrection } from "@/lib/utils/email-typo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const emailSuggestion = suggestEmailCorrection(email);

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
        <Label htmlFor="display_name">이름</Label>
        <Input
          id="display_name"
          name="display_name"
          required
          maxLength={50}
          placeholder="활동명 또는 본명"
          autoComplete="name"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">휴대폰 번호</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          maxLength={20}
          placeholder="010-1234-5678"
        />
        <p className="text-xs text-muted-foreground">
          캐스팅 섭외 연락에 사용됩니다.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">이메일</Label>
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
        {emailSuggestion ? (
          <p className="text-xs text-warn">
            혹시{" "}
            <button
              type="button"
              onClick={() => setEmail(emailSuggestion)}
              className="font-semibold underline underline-offset-2"
            >
              {emailSuggestion}
            </button>{" "}
            아닌가요? (오타 확인)
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">비밀번호</Label>
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
        {pending ? "가입하는 중..." : "가입하기"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{" "}
        <Link
          href={
            redirectParam
              ? `/login?redirect=${encodeURIComponent(redirectParam)}`
              : "/login"
          }
          className="font-medium text-foreground underline"
        >
          로그인
        </Link>
      </p>
    </form>
  );
}
