"use client";

import { usePathname } from "next/navigation";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

/**
 * Shell for authenticated (app) routes.
 * Admin routes render full-width and provide their own desktop shell
 * (see src/app/(app)/admin/layout.tsx); everything else gets the
 * mobile-first column + bottom tab bar.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return (
    <div className="relative mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children}</main>
      <BottomTabBar />
    </div>
  );
}
