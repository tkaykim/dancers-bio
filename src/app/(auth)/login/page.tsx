import Link from "next/link";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { brandMetadata, getBrand } from "@/lib/brand-server";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeReturnTo } from "@/lib/safeRedirect";

interface SearchParams {
  next?: string;
}

// GRIGO 화이트라벨 호스트에서만 탭 제목을 덮어 deetz 표기가 새지 않게 한다.
export async function generateMetadata(): Promise<Metadata> {
  return brandMetadata("GRIGO ENT 정산 · 로그인");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { next } = await searchParams;
  const safeNext = safeReturnTo(next, "");
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
        {safeNext ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              로그인이 필요한 페이지예요
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
              로그인 후<br />이어서 보기
            </h1>
            <p className="text-sm text-ink-2">
              로그인하시면 보시려던 페이지로 바로 이동합니다.
            </p>
          </>
        ) : (
          <h1 className="text-3xl font-extrabold tracking-tight leading-tight">
            돌아오신 걸<br />환영합니다
          </h1>
        )}
      </div>

      <LoginForm nextPath={safeNext || undefined} />
    </div>
  );
}
