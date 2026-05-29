"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase = "checking" | "ready" | "no_session";

export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  // 세션 감지: PKCE(코드 교환→쿠키) 또는 implicit(해시 토큰) 모두 지원.
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    const supabase = getBrowserClient();
    let active = true;

    const markReady = () => {
      if (active) setPhase("ready");
    };

    const run = async () => {
      // 1) 이미 세션이 있으면 (PKCE 코드 교환으로 서버가 쿠키 설정한 경우 포함) 바로 준비.
      const { data: s } = await supabase.auth.getSession();
      if (s.session) return markReady();

      // 2) implicit 경로: URL 해시에서 토큰을 직접 읽어 세션 설정 (기기 독립적).
      if (typeof window !== "undefined" && window.location.hash) {
        const hp = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");
        const errDesc = hp.get("error_description") ?? hp.get("error");
        if (errDesc) {
          if (active) setPhase("no_session");
          return;
        }
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          // 해시 제거 (토큰 노출 방지)
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
          if (!setErr) return markReady();
        }
      }
      // 3) detectSessionInUrl가 비동기로 처리할 수도 있으니 잠시 대기 후 판정.
      if (active) setPhase("no_session");
    };

    // detectSessionInUrl(비동기 해시 파싱) 결과도 수신.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) markReady();
    });

    void run();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (phase === "checking") {
    return (
      <p className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-2">
        링크 확인 중...
      </p>
    );
  }

  if (phase === "no_session") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <p className="text-sm text-foreground">
          재설정 링크가 만료됐거나 이미 사용됐어요. 새 링크를 발급받아 주세요.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          재설정 링크 다시 받기 →
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
        <p className="text-sm text-foreground">
          비밀번호가 설정됐습니다. 본인 프로필이 연결되었어요.
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
          // 브라우저 클라이언트로 먼저 비밀번호 설정 (해시 세션이 확실히 적용됨).
          const supabase = getBrowserClient();
          const { error: pwErr } = await supabase.auth.updateUser({
            password: pw,
          });
          if (pwErr) {
            setError(pwErr.message);
            return;
          }
          // 서버 액션으로 프로필 자동 연결(auto_claim) 실행. 쿠키 세션 사용.
          const result = await changePasswordAction(formData);
          if (!result.ok) {
            // 비번 자체는 이미 변경됨 — 연결만 실패한 경우라도 로그인은 가능.
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
