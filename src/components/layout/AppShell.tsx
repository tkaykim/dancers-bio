"use client";

import { usePathname } from "next/navigation";
import { PublicShell } from "@/components/layout/PublicShell";
import { getBrandFromHost } from "@/lib/brand";

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

  // GRIGO 화이트라벨 호스트의 정산 화면은 회사 내부 시스템으로 보여야 한다.
  // deetz 로고·캐스팅/댄서/매거진 네비가 그대로 뜨면 외부 댄서 입장에서
  // 다른 서비스로 넘어온 것처럼 보이므로, 이 경로만 셸 없이 렌더한다.
  // (수집 링크로 들어온 댄서가 출금 신청까지 밟는 유일한 경로라 노출 빈도가 높다)
  if (
    pathname.startsWith("/me/settlements") &&
    typeof window !== "undefined" &&
    getBrandFromHost(window.location.host) === "grigo"
  ) {
    return <>{children}</>;
  }

  return <PublicShell>{children}</PublicShell>;
}
