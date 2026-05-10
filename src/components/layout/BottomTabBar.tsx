"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  House,
  Mail,
  ClipboardList,
  Users,
} from "lucide-react";

type Tab = {
  href: string;
  label: string;
  Icon: typeof Briefcase;
  match: (path: string) => boolean;
  badge?: number;
};

export function BottomTabBar({
  proposalCount,
}: {
  proposalCount?: number;
}) {
  const pathname = usePathname() ?? "/";

  const tabs: Tab[] = [
    {
      href: "/feed",
      label: "캐스팅",
      Icon: Briefcase,
      match: (p) => p === "/feed" || p.startsWith("/projects"),
    },
    {
      href: "/dancers",
      label: "댄서",
      Icon: Users,
      match: (p) => p === "/dancers" || p.startsWith("/d/"),
    },
    {
      href: "/proposals",
      label: "받은 제안",
      Icon: Mail,
      match: (p) => p === "/proposals",
      badge: proposalCount,
    },
    {
      href: "/applications",
      label: "내 지원",
      Icon: ClipboardList,
      match: (p) => p === "/applications",
    },
    {
      href: "/me",
      label: "나",
      Icon: House,
      match: (p) =>
        p === "/me" ||
        p.startsWith("/me/") ||
        p.startsWith("/admin") ||
        p.startsWith("/verify-instagram"),
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-hairline-2 bg-background/95 pb-safe backdrop-blur-xl"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={
                  "flex h-14 flex-col items-center justify-center gap-0.5 transition-colors " +
                  (active ? "text-primary" : "text-ink-3 hover:text-ink-2")
                }
              >
                <span className="relative">
                  <t.Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.7}
                    aria-hidden
                  />
                  {t.badge && t.badge > 0 ? (
                    <span className="absolute -right-1.5 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
                      {t.badge > 9 ? "9+" : t.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10px] font-medium tracking-tight">
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
