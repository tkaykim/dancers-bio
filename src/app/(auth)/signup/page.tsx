import Link from "next/link";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-6 pb-10 pt-12">
      <Link href="/" className="inline-flex self-start">
        <DeetzLogo className="h-8 w-auto" priority />
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          시작해 봅시다
        </h1>
        <p className="text-sm text-ink-2">
          이메일과 비밀번호로 가입하세요.
        </p>
      </div>

      <SignupForm />
    </div>
  );
}
