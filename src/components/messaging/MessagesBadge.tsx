"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { usePolling } from "./poll";

// UI 노출 플래그(공개 플래그는 노출용일 뿐 — 서버 차단은 MESSAGING_ENABLED 가 한다).
const UI_ENABLED = process.env.NEXT_PUBLIC_MESSAGING_ENABLED === "true";

// 전역 안읽음 뱃지. 60초 폴링 — 페이지 이동 없이도 갱신된다.
export function useUnreadBadge(enabled = true): number {
  const [unread, setUnread] = useState(0);
  usePolling(
    async () => {
      const res = await fetch("/api/messages/badge", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: number };
      setUnread(data.unread ?? 0);
    },
    60_000,
    enabled,
  );
  return unread;
}

/** 데스크탑 사이드바용 메시지 항목(PublicShell 이 사용). */
export function MessagesNavItem({ active }: { active: boolean }) {
  const unread = useUnreadBadge(UI_ENABLED);
  if (!UI_ENABLED) return null;
  const className =
    "flex items-center gap-3 rounded-md px-2.5 py-2.5 transition-colors " +
    (active
      ? "bg-primary text-primary-foreground [&_.text-ink-3]:text-white/62"
      : "text-ink-2 hover:bg-secondary hover:text-foreground");
  return (
    <Link href="/messages" className={className}>
      <span className="relative shrink-0">
        <MessageCircle size={18} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">Messages</span>
        <span className="mt-0.5 block text-[10px] leading-tight text-ink-3">
          메시지{unread > 0 ? ` · 안읽음 ${unread}` : ""}
        </span>
      </span>
    </Link>
  );
}

/** 텍스트 링크 + 카운트(마이·지원내역 등에서 사용). */
export function MessagesTextLink({ className }: { className?: string }) {
  const unread = useUnreadBadge(UI_ENABLED);
  if (!UI_ENABLED) return null;
  return (
    <Link href="/messages" className={className}>
      메시지
      {unread > 0 ? (
        <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-[18px] text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : (
        <span aria-hidden> →</span>
      )}
    </Link>
  );
}
