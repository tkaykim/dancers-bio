"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DeetzLogo } from "@/components/brand/DeetzLogo";

type NavLink = {
  href: string;
  label: string;
  match: (path: string) => boolean;
};

const links: NavLink[] = [
  {
    href: "/feed",
    label: "캐스팅",
    match: (p) => p === "/feed" || p.startsWith("/projects"),
  },
  {
    href: "/dancers",
    label: "댄서",
    match: (p) => p === "/dancers" || p.startsWith("/d/"),
  },
  {
    href: "/applications",
    label: "내 지원",
    match: (p) => p === "/applications",
  },
  {
    href: "/me",
    label: "나",
    match: (p) =>
      p === "/me" ||
      p.startsWith("/me/") ||
      p.startsWith("/admin") ||
      p.startsWith("/verify-instagram"),
  },
];

/** 데스크톱(lg+) 전용 상단 헤더. 모바일은 BottomTabBar 사용. */
export function TopNav() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="sticky top-0 z-30 hidden border-b border-hairline-2 bg-background/90 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-8">
        <Link href="/" className="inline-flex items-center">
          <DeetzLogo className="h-7 w-auto" priority />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          {links.map((l) => {
            const active = l.match(pathname);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={
                  "rounded-full px-4 py-2 font-semibold transition-colors " +
                  (active
                    ? "bg-foreground text-background"
                    : "text-ink-2 hover:bg-card")
                }
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
