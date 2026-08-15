import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import { SignupForm } from "@/components/auth/SignupForm";

// GRIGO 화이트라벨 호스트에서만 탭 제목을 덮어 deetz 표기가 새지 않게 한다.
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata("GRIGO ENT 정산 · 회원가입");
}

export default async function SignupPage() {
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
