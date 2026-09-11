import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/guard";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { getPathname } from "@/lib/i18n/server";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (user) redirect("/me");
  // 가입 화면은 폼 맨 위에 언어 선택이 있어 우상단 전환기를 겹쳐 두지 않는다.
  const pathname = await getPathname();
  const showSwitcher = !pathname.startsWith("/signup");
  return (
    <main className="relative min-h-svh">
      {/* 인증 화면 우상단 언어 전환기 (docs/design-i18n-ui.md §3.8) */}
      {showSwitcher ? (
        <div className="absolute right-4 top-4 z-10">
          <LanguageSwitcher />
        </div>
      ) : null}
      {children}
    </main>
  );
}
