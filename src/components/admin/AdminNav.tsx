"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserCheck,
  Users,
  BadgeCheck,
  Megaphone,
  Download,
  Search,
  ClipboardCheck,
  Send,
  Bot,
  Shield,
  BarChart3,
  TrendingUp,
  Wallet,
  Receipt,
  HandCoins,
  CreditCard,
  Home,
  Flame,
  CalendarDays,
  Calculator,
} from "lucide-react";

type Item = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  exact?: boolean;
};

type Group = { title: string | null; items: Item[] };

const GROUPS: Group[] = [
  {
    title: null,
    items: [
      { href: "/admin", label: "대시보드", Icon: LayoutDashboard, exact: true },
      { href: "/admin/analytics", label: "분석", Icon: TrendingUp, exact: true },
    ],
  },
  {
    title: "승인 큐",
    items: [
      { href: "/admin/dancers", label: "댄서 승인", Icon: UserCheck, exact: true },
      { href: "/admin/teams", label: "팀 승인", Icon: Users },
      { href: "/admin/verifications", label: "인증", Icon: BadgeCheck },
    ],
  },
  {
    title: "콘텐츠",
    items: [
      { href: "/admin/projects", label: "공고 관리", Icon: Megaphone, exact: true },
      { href: "/admin/projects/import", label: "공고 수집", Icon: Download },
    ],
  },
  {
    title: "프로그램",
    items: [
      { href: "/admin/village", label: "Village 수요조사", Icon: Home, exact: true },
      { href: "/admin/workshops", label: "워크샵 초청", Icon: Flame, exact: true },
      { href: "/admin/workshops/events", label: "워크샵 행사", Icon: CalendarDays, exact: true },
    ],
  },
  {
    title: "수집 파이프",
    items: [
      { href: "/admin/dancers/discovery", label: "발견 / 스크랩", Icon: Search },
      { href: "/admin/dancers/ingestions", label: "댄서 검수", Icon: ClipboardCheck },
      { href: "/admin/dancers/outreach", label: "아웃리치", Icon: Send },
    ],
  },
  {
    title: "정산",
    items: [
      { href: "/admin/rate-check", label: "페이 산정", Icon: Calculator },
      { href: "/admin/payments", label: "통합 결제 장부", Icon: CreditCard, exact: true },
      { href: "/admin/settlements", label: "정산 처리", Icon: Wallet, exact: true },
      { href: "/admin/settlements/ledger", label: "지급 장부", Icon: Receipt },
      { href: "/admin/finance/receivables", label: "매출·수금", Icon: HandCoins },
    ],
  },
  {
    title: "시스템",
    items: [
      { href: "/admin/llm", label: "LLM 설정", Icon: Bot },
      { href: "/admin/users", label: "사용자 / 권한", Icon: Shield },
      { href: "/admin/scores", label: "경력 점수", Icon: BarChart3 },
    ],
  },
];

const FLAT: Item[] = GROUPS.flatMap((g) => g.items);

function isActive(item: Item, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Vertical grouped nav for the desktop sidebar (lg+). */
export function AdminSidebarNav() {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav aria-label="관리자" className="flex flex-col gap-5">
      {GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.title ? (
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-4">
              {group.title}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-ink-2 hover:bg-secondary hover:text-foreground")
                }
              >
                <item.Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Horizontal scrollable chips for the mobile top bar (<lg). */
export function AdminTopNav() {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav
      aria-label="관리자"
      className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-2"
    >
      {FLAT.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "border border-hairline-2 text-ink-2 hover:text-foreground")
            }
          >
            <item.Icon size={14} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
