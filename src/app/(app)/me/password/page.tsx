import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";

export default async function ChangePasswordPage() {
  await requireUser();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <Link
        href="/me"
        className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
      >
        ← 내 계정
      </Link>
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-ink-3">
          ↳ 계정 설정
        </p>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          비밀번호 변경
        </h1>
        <p className="text-sm text-ink-2">새 비밀번호를 입력해 주세요. (8자 이상)</p>
      </header>
      <ChangePasswordForm />
    </div>
  );
}
