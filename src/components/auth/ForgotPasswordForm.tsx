"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  requestPasswordResetAction,
  findEmailByNameAction,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tab = "password" | "id";

export function ForgotPasswordForm() {
  const [tab, setTab] = useState<Tab>("password");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [maskedEmails, setMaskedEmails] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function switchTab(next: Tab) {
    setTab(next);
    setError(null);
    setSuccess(null);
    setMaskedEmails([]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex overflow-hidden rounded-lg border border-input">
        {(["password", "id"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={
              "flex-1 py-2 text-sm font-medium transition-colors " +
              (tab === t
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted")
            }
          >
            {t === "password" ? "비밀번호 찾기" : "아이디 찾기"}
          </button>
        ))}
      </div>

      {tab === "password" && (
        <form
          action={(formData) => {
            setError(null);
            setSuccess(null);
            startTransition(async () => {
              const result = await requestPasswordResetAction(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSuccess("이메일을 확인해 주세요. 재설정 링크를 보내드렸습니다.");
            });
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">가입한 이메일</Label>
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
          {success ? (
            <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
              {success}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={pending || !!success}
            className="w-full"
          >
            {pending ? "전송 중..." : "재설정 링크 전송"}
          </Button>
        </form>
      )}

      {tab === "id" && (
        <form
          action={(formData) => {
            setError(null);
            setSuccess(null);
            setMaskedEmails([]);
            startTransition(async () => {
              const result = await findEmailByNameAction(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              const emails = result.data?.maskedEmails ?? [];
              if (emails.length === 0) {
                setSuccess("해당 이름으로 등록된 계정을 찾을 수 없습니다.");
              } else {
                setMaskedEmails(emails);
              }
            });
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="display_name">등록한 이름 (활동명)</Label>
            <Input
              id="display_name"
              name="display_name"
              required
              maxLength={50}
              placeholder="활동명 또는 본명"
            />
          </div>
          {error ? (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {maskedEmails.length > 0 ? (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <p className="mb-1 font-medium">찾은 계정</p>
              <ul className="flex flex-col gap-1">
                {maskedEmails.map((email, i) => (
                  <li key={`${email}-${i}`} className="font-mono text-foreground">
                    {email}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {success ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {success}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "검색 중..." : "아이디 찾기"}
          </Button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
