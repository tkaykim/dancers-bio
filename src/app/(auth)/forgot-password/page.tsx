import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getBrand } from "@/lib/brand-server";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default async function ForgotPasswordPage() {
  const brand = await getBrand();
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col lg:justify-center gap-8 px-6 pb-10 pt-12">
      {/* GRIGO 호스트의 루트는 외부 리다이렉트라 로고를 링크로 감싸지 않는다. */}
      {brand === "grigo" ? (
        <BrandLogo brand={brand} className="h-8 w-auto" priority />
      ) : (
        <Link href="/" className="inline-flex self-start">
          <BrandLogo brand={brand} className="h-8 w-auto" priority />
        </Link>
      )}

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
          비밀번호<br />재설정
        </h1>
        <p className="text-sm text-ink-2">
          가입할 때 쓰신 이메일로 숫자 인증코드를 보내드려요.
          <br />
          코드를 입력하고 새 비밀번호를 설정하시면 됩니다.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
