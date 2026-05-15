"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-sm text-foreground">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
        </p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          로그인 →
        </Link>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        const pw = (formData.get("password") ?? "").toString();
        const pw2 = (formData.get("password2") ?? "").toString();
        if (pw !== pw2) {
          setError("두 비밀번호가 일치하지 않습니다.");
          return;
        }
        startTransition(async () => {
          const result = await changePasswordAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setDone(true);
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
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password2">새 비밀번호 확인</Label>
        <Input
          id="password2"
          name="password2"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
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
