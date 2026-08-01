"use client";

import Link from "next/link";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import {
  ArrowUpRight,
  Briefcase,
  ClipboardList,
  House,
  PlayCircle,
  Users,
} from "lucide-react";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import { BottomTabBar } from "@/components/layout/BottomTabBar";

const navItems = [
  {
    href: "/feed",
    label: "Casting",
    sub: "모집 공고",
    Icon: Briefcase,
    match: (path: string) => path === "/feed" || path.startsWith("/projects"),
  },
  {
    href: "/dancers",
    label: "Dancers",
    sub: "댄서 / 팀",
    Icon: Users,
    match: (path: string) => path === "/dancers" || path.startsWith("/d/") || path.startsWith("/t/"),
  },
  {
    href: "https://www.youtube.com/@deetzmagazine",
    label: "Magazine",
    sub: "Deetz TV",
    Icon: PlayCircle,
    external: true,
    match: () => false,
  },
  {
    href: "/applications",
    label: "Applications",
    sub: "내 지원",
    Icon: ClipboardList,
    match: (path: string) => path === "/applications",
  },
  {
    href: "/me",
    label: "My",
    sub: "프로필",
    Icon: House,
    match: (path: string) => path === "/me" || path.startsWith("/me/"),
  },
];

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const segments = useSelectedLayoutSegments();
  const isPortfolioPage =
    segments[0] === "d" || segments[0] === "t";

  return (
    <div className="min-h-svh bg-background">
      <div
        className={
          "mx-auto grid min-h-svh w-full grid-cols-1 bg-background lg:max-w-[1360px] lg:grid-cols-[184px_minmax(0,1fr)] " +
          (isPortfolioPage ? "max-w-none" : "max-w-md")
        }
      >
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:border-r lg:border-border lg:px-5 lg:py-7">
          <Link href="/feed" className="mb-10 block">
            <DeetzLogo className="h-10 w-auto" priority />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-3">
              Magazine / Casting
            </p>
          </Link>

          <nav aria-label="Desktop primary" className="flex flex-col gap-2">
            {navItems.map((item) => {
              const active = item.match(pathname);
              const content = (
                <>
                  <item.Icon
                    size={18}
                    strokeWidth={active ? 2.2 : 1.7}
                    aria-hidden
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-tight">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-ink-3">
                      {item.sub}
                    </span>
                  </span>
                  {item.external ? (
                    <ArrowUpRight size={15} className="text-ink-4" aria-hidden />
                  ) : null}
                </>
              );

              const className =
                "flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors " +
                (active
                  ? "bg-primary text-primary-foreground [&_.text-ink-3]:text-white/62"
                  : "text-ink-2 hover:bg-secondary hover:text-foreground");

              return item.external ? (
                <a
                  key={item.href}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className={className}
                >
                  {content}
                </a>
              ) : (
                <Link key={item.href} href={item.href} className={className}>
                  {content}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border pt-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3">
              Client
            </p>
            <Link
              href="/projects/new"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
            >
              공고 개설
              <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        </aside>

        <main
          className={
            "min-w-0 flex-1 " +
            (isPortfolioPage ? "pb-0 lg:pb-10" : "pb-24 lg:pb-10")
          }
        >
          {children}
        </main>

        {!isPortfolioPage ? (
          <div className="lg:hidden">
            <BottomTabBar />
          </div>
        ) : null}
      </div>
    </div>
  );
}
