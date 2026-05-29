import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

// Supabase는 비밀번호 재설정 이메일에 ?code=... 를 포함(PKCE). 이 페이지에서
// exchangeCodeForSession 으로 임시 session을 만든 뒤에 폼을 노출.
// 코드가 없거나 교환 실패 시 안내 화면.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string; error_description?: string }>;
}) {
  const { code, error: errParam, error_description } = await searchParams;

  let exchangeError: string | null = null;
  if (code) {
    // PKCE 경로: 같은 브라우저에서 시작된 재설정. 서버에서 코드 교환 → 세션 쿠키 설정.
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      exchangeError = error.message;
    }
  } else if (errParam) {
    exchangeError = error_description ?? errParam;
  }
  // code도 error도 없으면 implicit(해시 토큰) 경로일 수 있음.
  // 해시는 서버에서 못 읽으므로 폼을 렌더하고 클라이언트가 세션을 감지하게 둔다.

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-6 pb-10 pt-12">
      <Link href="/" className="flex items-baseline gap-1.5 self-start">
        <span className="text-2xl font-extrabold tracking-tight leading-none">
          dancers.bio
        </span>
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          새 비밀번호<br />설정
        </h1>
        {!exchangeError ? (
          <p className="text-sm text-ink-2">
            새로 사용할 비밀번호를 입력해 주세요. (8자 이상)
          </p>
        ) : null}
      </div>

      {exchangeError ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <p className="text-sm text-foreground">
            재설정 링크가 만료됐거나 이미 사용됐어요. 새 링크를 발급받아 주세요.
          </p>
          <p className="text-[11px] text-ink-3">사유: {exchangeError}</p>
          <Link
            href="/forgot-password"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            재설정 링크 다시 받기 →
          </Link>
        </div>
      ) : (
        <ResetPasswordForm />
      )}
    </div>
  );
}
