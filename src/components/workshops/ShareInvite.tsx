"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { T, type Lang } from "./copy";

/**
 * 수요 등록 완료 화면의 공유 장치 — "N명 모이면 열려요" 루프의 시작점.
 * navigator.share 미지원(데스크톱 등)이면 클립보드 복사로 폴백한다.
 */
export function ShareInvite({ lang, className }: { lang: Lang; className?: string }) {
  const c = T[lang];
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/workshops`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url, text: c.shareText });
        return;
      } catch {
        // 사용자가 시트를 닫은 경우 등 — 클립보드 폴백으로 이어간다.
      }
    }
    try {
      await navigator.clipboard.writeText(`${c.shareText}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 클립보드 접근 불가 환경은 조용히 무시
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline-2 px-4 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:text-foreground",
        className,
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
      {copied ? c.shareCopied : c.shareCta}
    </button>
  );
}
