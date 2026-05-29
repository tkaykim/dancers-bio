"use client";

import { useEffect, useRef, useState } from "react";
import { autoClaimDancersAction } from "@/app/actions/auth";
import { getBrowserClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function toKoreanLoginError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "이메일 또는 비밀번호가 올바르지 않습니다. 메일의 임시 비밀번호(숫자 6자리)를 확인해 주세요.";
  if (m.includes("email not confirmed"))
    return "이메일 인증이 필요합니다. 관리자에게 문의해 주세요.";
  if (m.includes("rate") && m.includes("limit")) return "잠시 후 다시 시도해 주세요.";
  return "로그인에 실패했습니다. 다시 시도해 주세요.";
}

export function OnboardingLoginModal({
  email,
  redirectTo = "/me/portfolio",
}: {
  email: string;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const openedOnce = useRef(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // 키보드(가상 뷰포트) 높이만큼 시트를 올려 버튼이 가려지지 않게 함.
  const [kbInset, setKbInset] = useState(0);

  // 살짝 스크롤하면 로그인 팝업 등장 (최초 1회 자동).
  useEffect(() => {
    const onScroll = () => {
      if (!openedOnce.current && window.scrollY > 100) {
        openedOnce.current = true;
        setOpen(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 모바일 키보드 대응: visualViewport 변화로 키보드 높이 계산.
  useEffect(() => {
    if (!open) {
      setKbInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const pw = password.trim();
    if (!pw) {
      setError("임시 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: pw,
      });
      if (signErr) {
        setError(toKoreanLoginError(signErr.message));
        setLoading(false);
        return;
      }
      // 미연결 시 프로필 자동 연결 (실패해도 진행).
      try {
        await autoClaimDancersAction();
      } catch {
        // ignore
      }
      // 하드 네비게이션 — 세션 쿠키가 확실히 반영된 채로 보호 페이지 진입.
      window.location.assign(redirectTo);
    } catch {
      setError("로그인에 실패했습니다. 다시 시도해 주세요.");
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline-2 bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/85">
        <div className="mx-auto max-w-md">
          <Button
            onClick={() => setOpen(true)}
            size="lg"
            className="w-full text-base font-semibold"
          >
            로그인하고 내 프로필 관리하기
          </Button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-background p-6 pb-8 shadow-2xl transition-transform duration-150"
            style={{ transform: kbInset ? `translateY(-${kbInset}px)` : undefined }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline-2" />
            <h2 className="text-lg font-bold tracking-tight">로그인하고 시작하기</h2>
            <p className="mt-1 text-sm text-ink-2">
              메일로 받은 <b>임시 비밀번호(숫자 6자리)</b>를 입력해 주세요.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ob-email">이메일</Label>
                <Input
                  id="ob-email"
                  type="email"
                  value={email}
                  readOnly
                  className="bg-secondary/40"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ob-pw">임시 비밀번호 (숫자 6자리)</Label>
                <Input
                  id="ob-pw"
                  type="password"
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="메일에 적힌 숫자 6자리"
                />
              </div>
              {error ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                size="lg"
                disabled={loading}
                className="w-full text-base font-semibold"
              >
                {loading ? "로그인 중..." : "로그인"}
              </Button>
              <p className="text-center text-[11px] text-ink-3">
                로그인 후 <b>[내 정보 → 비밀번호 변경]</b>에서 비밀번호를 꼭 바꿔 주세요.
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
