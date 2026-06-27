import Link from "next/link";
import { notFound } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { requireProfile } from "@/lib/auth/guard";
import { AdminSidebarNav, AdminTopNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  if (!profile.is_admin) notFound();

  return (
    <div className="min-h-svh bg-background lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border px-4 py-6 lg:flex">
        <Link href="/feed" className="flex items-center gap-2 px-3">
          <DeetzLogo className="h-6 w-auto" priority />
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          <span className="ml-1 text-[11px] font-medium text-ink-3">admin</span>
        </Link>
        <AdminSidebarNav />
        <Link
          href="/feed"
          className="mt-auto px-3 text-xs text-ink-3 hover:text-foreground"
        >
          ← 앱으로 돌아가기
        </Link>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 pt-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 pb-2">
          <Link href="/feed" className="flex items-center gap-2">
            <DeetzLogo className="h-5 w-auto" priority />
            <span className="text-[11px] font-medium text-ink-3">admin</span>
          </Link>
          <Link href="/me" className="text-xs text-ink-3 hover:text-foreground">
            앱으로 →
          </Link>
        </div>
        <AdminTopNav />
      </header>

      {/* Content */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-5 py-7 lg:px-10 lg:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
