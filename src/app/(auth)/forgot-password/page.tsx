import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-6 pb-10 pt-12">
      <Link href="/" className="flex items-baseline gap-1.5 self-start">
        <span className="text-2xl font-extrabold tracking-tight leading-none">
          deetz
        </span>
        <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          비밀번호<br />재설정
        </h1>
        <p className="text-sm text-ink-2">
          가입할 때 쓰신 이메일로 6자리 인증코드를 보내드려요.
          <br />
          코드를 입력하고 새 비밀번호를 설정하시면 됩니다.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
