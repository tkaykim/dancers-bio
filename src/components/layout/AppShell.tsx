"use client";

import { usePathname } from "next/navigation";
import { PublicShell } from "@/components/layout/PublicShell";

/**
 * Shell for authenticated (app) routes.
 * Admin routes render full-width and provide their own desktop shell
 * (see src/app/(app)/admin/layout.tsx); everything else gets the
 * unified PublicShell — mobile: max-w-md column + bottom tab bar,
 * desktop(lg+): left sidebar nav.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  return <PublicShell>{children}</PublicShell>;
}
