import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/guard";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (user) redirect("/me");
  return (
    <main className="relative min-h-svh">
      {/* 인증 화면 우상단 언어 전환기 (docs/design-i18n-ui.md §3.8) */}
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>
      {children}
    </main>
  );
}
