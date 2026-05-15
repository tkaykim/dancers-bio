import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

// Supabase가 reset 링크에서 들어온 사용자에게 임시 세션을 부여하므로,
// 이 페이지는 로그인 가드 없이 노출. 폼이 changePasswordAction(updateUser)을 호출.
export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-6 pb-10 pt-12">
      <Link href="/" className="flex items-baseline gap-1.5 self-start">
        <span className="text-2xl font-extrabold tracking-tight leading-none">
          Cue
        </span>
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          새 비밀번호<br />설정
        </h1>
        <p className="text-sm text-ink-2">
          새로 사용할 비밀번호를 입력해 주세요. (8자 이상)
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
