import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
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
          돌아오신 걸<br />환영합니다
        </h1>
      </div>

      <LoginForm />
    </div>
  );
}
